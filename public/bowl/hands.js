/*
 * StrikeHands — shared webcam hand tracker (MediaPipe HandLandmarker).
 * One gesture model used by both the single-screen lane (tv.html) and the
 * remote camera controller (camera.html):
 *   open hand = aim · fist = grab the ball · swing & flick the fingers open = release.
 * Detection follows docs/bowling-swing-mechanics.md §5B (release is the fingers
 * flinging open at the bottom of the swing, revs from the wrist turn — not a chop).
 *
 * StrikeHands.start(videoEl, canvasEl, {
 *   getHand:  () => 1 | -1,            // which hand you throw with (1=RH, -1=LH)
 *   onAim:    (board, locked) => {},   // live stance board; locked=true when you grab
 *   onStance: (board) => {},           // throttled stance (for sending over the network)
 *   onHand:   (text) => {},            // "open" | "grabbing" | "ball in hand"
 *   onThrow:  ({launchBoard,launchAngle,speedMph,revRate}) => {},
 *   onState:  (text) => {}, onReady: () => {}, onError: (msg) => {},
 * }) -> { stop(), recenter() }  (or null on failure)
 */
(function (global) {
  "use strict";
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const K = {
    AIM_RANGE: 0.42,      // how far your open hand sweeps = the whole lane
    FIST: 0.72,           // enter "holding the ball" when the mean finger curl drops below this
    FIST_CONFIRM: 0.60,   // ...but only count a throw if the fist actually closed this tight (kills noise)
    OPEN: 1.10,           // above this = fingers clearly extended (released)
    FIST_FRAMES: 3,       // consecutive fist frames required to grab (debounce the detector)
    SPEED_FULL: 1.3,      // hand speed that maps to a full-power throw (lower = easier to throw hard)
    REV_K: 3.4,           // degrees of wrist turn through release → revs
    DWELL: 0.20,          // s you must hold the fist before an open counts as a throw
    MIN_MPH: 12, MAX_MPH: 20,
    COOLDOWN: 1200,       // ms between throws
    MISS_TOL: 6,          // frames we coast on the last hand before "show your hand"
    SMOOTH: 0.5,          // EMA weight on new samples (lower = smoother, laggier)
  };
  const DEG = 180 / Math.PI;
  const HB = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

  function drawHand(octx, lm, w, h, dim) {
    octx.lineWidth = 4; octx.strokeStyle = dim ? "rgba(50,224,207,.4)" : "rgba(50,224,207,.85)"; octx.fillStyle = dim ? "rgba(255,90,44,.5)" : "#ff5a2c";
    HB.forEach(([a, b]) => { octx.beginPath(); octx.moveTo(lm[a].x * w, lm[a].y * h); octx.lineTo(lm[b].x * w, lm[b].y * h); octx.stroke(); });
    for (let i = 0; i < lm.length; i++) { octx.beginPath(); octx.arc(lm[i].x * w, lm[i].y * h, 5, 0, 7); octx.fill(); }
  }

  // pick the hand matching the thrower's handedness; fall back to the only/most-confident hand
  function pickHand(res, wantRight) {
    const hands = res.landmarks || []; if (!hands.length) return null;
    if (hands.length === 1) return hands[0];
    const want = wantRight ? "Right" : "Left";       // MediaPipe reports selfie-mirrored handedness
    let best = null, bestScore = -1;
    for (let i = 0; i < hands.length; i++) {
      const cat = res.handedness && res.handedness[i] && res.handedness[i][0];
      if (cat && cat.categoryName === want && cat.score > bestScore) { best = hands[i]; bestScore = cat.score; }
    }
    if (best) return best;
    // no label match: take the most-confident hand
    let bi = 0, bs = -1; for (let i = 0; i < hands.length; i++) { const cat = res.handedness && res.handedness[i] && res.handedness[i][0]; const s = cat ? cat.score : 0; if (s > bs) { bs = s; bi = i; } }
    return hands[bi];
  }

  function withTimeout(p, ms, label) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label || "timed out")), ms))]);
  }
  // prefer the module loaded by the page's <script type=module> shim; fall back to a dynamic import
  async function waitForTasksVision() {
    if (window.__TasksVision) return window.__TasksVision;
    const viaEvent = await new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(window.__TasksVision || null); } };
      window.addEventListener("tasksvision-ready", fin, { once: true });
      if (window.__TasksVision) fin();
      setTimeout(fin, 8000);
    });
    if (viaEvent) return viaEvent;
    try { return await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12"); } catch (_) { return null; }
  }

  async function start(video, canvas, opts) {
    opts = opts || {};
    const getHand = opts.getHand || (() => 1);
    const octx = canvas.getContext("2d");
    let hl = null, raf = 0, running = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { opts.onError && opts.onError("This browser can't use the camera. Try Chrome or Safari, or use the phone controller."); return null; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = stream; await video.play();
    } catch (e) {
      const n = (e && e.name) || "";
      const msg = n === "NotAllowedError" || n === "SecurityError" ? "Camera blocked — allow camera access, then reload."
        : n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError" ? "No camera on this device — use the phone controller instead."
        : n === "NotReadableError" ? "Camera is busy in another app — close it and reload."
        : "Couldn't start the camera (" + (n || "unknown") + "). Try reloading.";
      opts.onError && opts.onError(msg); return null;
    }

    opts.onState && opts.onState("loading hand tracker…");
    try {
      // use the tasks-vision module loaded via a static <script type=module> shim (robust cross-browser),
      // falling back to a dynamic import if the shim hasn't run.
      const mod = await waitForTasksVision();
      if (!mod) throw new Error("tasks-vision unavailable");
      const vision = await mod.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm");
      hl = await withTimeout(mod.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" },
        runningMode: "VIDEO", numHands: 2,
      }), 30000, "model load timed out");
    } catch (e) {
      const slow = /timed out/.test((e && e.message) || "");
      opts.onError && opts.onError(slow ? "Hand tracker is taking too long — check your connection and reload." : "Couldn't load the hand tracker — check your connection and reload.");
      return null;
    }

    running = true; opts.onReady && opts.onReady();
    opts.onState && opts.onState("Open hand = aim · fist = grab the ball · swing & flick open to throw");

    let state = "aim", aimBase = null, stanceBoard = 20, lastStanceSent = 0, lastThrow = 0;
    let peakSpeed = 0, gripTheta = 0, aimAtGrip = 20, gripStartT = 0, hist = [], smoothGrip = 1.1, sx = 0, sy = 0, sInit = false, miss = 0, lastLm = null;
    let fistCount = 0, minGrip = 2, sawOpen = false;   // sawOpen: you must show an open hand before a grab counts

    function loop() {
      if (!running) return; raf = requestAnimationFrame(loop);
      if (video.readyState < 2) return;
      canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
      let res; try { res = hl.detectForVideo(video, performance.now()); } catch (e) { return; }
      octx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();
      let lm = pickHand(res, getHand() > 0), coasting = false;
      if (!lm) {
        miss++;
        if (miss <= K.MISS_TOL && lastLm) { lm = lastLm; coasting = true; }
        else { opts.onState && opts.onState(state === "hold" ? "swing & flick open" : "show your throwing hand"); opts.onHand && opts.onHand("—"); return; }
      } else { miss = 0; lastLm = lm; }
      drawHand(octx, lm, canvas.width, canvas.height, coasting);

      const wrist = lm[0], mcp9 = lm[9];
      const S = Math.hypot(mcp9.x - wrist.x, mcp9.y - wrist.y) || 0.001;
      let gs = 0; for (const p of [[8,5],[12,9],[16,13],[20,17]]) gs += Math.hypot(lm[p[0]].x - lm[p[1]].x, lm[p[0]].y - lm[p[1]].y);
      gs = gs / 4 / S; smoothGrip = smoothGrip * (1 - K.SMOOTH) + gs * K.SMOOTH;
      if (!sInit) { sx = wrist.x; sy = wrist.y; sInit = true; } else { sx = sx * (1 - K.SMOOTH) + wrist.x * K.SMOOTH; sy = sy * (1 - K.SMOOTH) + wrist.y * K.SMOOTH; }
      const hx = 1 - sx;                                  // camera mirrored → flip for aim
      const theta = Math.atan2(lm[17].y - lm[5].y, lm[17].x - lm[5].x);
      hist.push({ x: hx, y: sy, t: now }); if (hist.length > 6) hist.shift();
      let speed = 0; if (hist.length >= 2) { const a = hist[0], b = hist[hist.length - 1]; speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(0.001, (b.t - a.t) / 1000); }
      const grip = smoothGrip < K.FIST, open = smoothGrip > K.OPEN;

      if (state === "aim") {
        opts.onHand && opts.onHand(grip ? "grabbing" : "open");
        opts.onState && opts.onState("open hand = aim · make a fist to grab");
        if (aimBase == null) aimBase = hx;
        if (open) {
          sawOpen = true;                                  // a clear open hand must precede a grab
          const off = (hx - aimBase) / K.AIM_RANGE;
          stanceBoard = Math.round(clamp(20 - off * 18, 2, 38));
          opts.onAim && opts.onAim(stanceBoard, false);
          if (opts.onStance && now - lastStanceSent > 80) { lastStanceSent = now; opts.onStance(stanceBoard); }
        }
        fistCount = grip ? fistCount + 1 : 0;
        // grab only after a clear open, with the fist held a few frames (so detector noise can't grab+throw)
        if (grip && sawOpen && fistCount >= K.FIST_FRAMES) { state = "hold"; peakSpeed = 0; gripTheta = theta; aimAtGrip = stanceBoard; gripStartT = now; minGrip = smoothGrip; opts.onAim && opts.onAim(aimAtGrip, true); }
      } else {
        opts.onHand && opts.onHand("ball in hand");
        opts.onState && opts.onState("flick your fingers open to throw");
        if (speed > peakSpeed) peakSpeed = speed;
        if (smoothGrip < minGrip) minGrip = smoothGrip;
        const held = (now - gripStartT) / 1000;
        // RELEASE = you open your fingers after the grab (the ball rolling off your hand). No big swing
        // required — power scales with whatever motion there was, so a seated flick throws soft, a full
        // swing throws hard. (docs/bowling-swing-mechanics.md §5B)
        // throw only if a REAL fist happened (minGrip tight) and you then clearly open it
        if (now - lastThrow > K.COOLDOWN && open && held > K.DWELL && minGrip < K.FIST_CONFIRM) {
          lastThrow = now;
          let dT = theta - gripTheta; while (dT > Math.PI) dT -= 2 * Math.PI; while (dT < -Math.PI) dT += 2 * Math.PI;
          const turnDeg = Math.abs(dT) * DEG;
          const speedMph = clamp(K.MIN_MPH + Math.min(1, peakSpeed / K.SPEED_FULL) * (K.MAX_MPH - K.MIN_MPH), K.MIN_MPH, K.MAX_MPH);
          const rev = clamp(Math.round(100 + turnDeg * K.REV_K), 90, 560);
          const drift = hist.length ? (hx - hist[0].x) : 0;
          const ang = clamp(drift * 12 * -getHand(), -4, 4);
          opts.onThrow && opts.onThrow({ launchBoard: aimAtGrip, launchAngle: ang, speedMph, revRate: rev });
          state = "aim"; aimBase = hx; sawOpen = false; fistCount = 0;
        } else if (open && held > 2.5) { state = "aim"; sawOpen = false; fistCount = 0; }   // bail if it never closed into a real fist
      }
    }
    raf = requestAnimationFrame(loop);
    return {
      stop() { running = false; cancelAnimationFrame(raf); try { video.srcObject && video.srcObject.getTracks().forEach((t) => t.stop()); } catch (_) {} },
      recenter() { aimBase = null; },
      K,
    };
  }

  global.StrikeHands = { start, K };
})(window);
