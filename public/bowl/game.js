/* StrikeCast — TV game engine: pairing, 10-pin scoring, 2.5D lane, physics, sfx. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const screens = { setup: $("#setup"), pair: $("#pair"), game: $("#game") };
  const show = (name) => Object.entries(screens).forEach(([k, el]) => el.classList.toggle("show", k === name));

  // ---------------------------------------------------------------- sound
  const SFX = (() => {
    let ac;
    const ctx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
    const env = (g, a, d, peak) => { const t = ac.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    let rollNode;
    return {
      resume() { try { ctx(); if (ac.state === "suspended") ac.resume(); } catch (_) {} },
      roll(dur) {
        try {
          ctx(); const buf = ac.createBuffer(1, ac.sampleRate * Math.max(.3, dur), ac.sampleRate);
          const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
          const src = ac.createBufferSource(); src.buffer = buf;
          const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220;
          const g = ac.createGain(); g.gain.value = 0.0; src.connect(f).connect(g).connect(ac.destination);
          const t = ac.currentTime; g.gain.linearRampToValueAtTime(0.25, t + .1); g.gain.setValueAtTime(0.25, t + dur - .1); g.gain.linearRampToValueAtTime(0, t + dur);
          src.start(); src.stop(t + dur); rollNode = { src };
        } catch (_) {}
      },
      crash(n) {
        try {
          ctx(); const g = ac.createGain(); g.connect(ac.destination);
          const buf = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate);
          const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.3));
          const src = ac.createBufferSource(); src.buffer = buf;
          const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1200 + n * 120;
          src.connect(f).connect(g); env(g, .005, .35, Math.min(.5, .12 + n * .04)); src.start();
        } catch (_) {}
      },
      cheer() {
        try {
          ctx(); [523, 659, 784, 1047].forEach((hz, i) => {
            const o = ac.createOscillator(), g = ac.createGain(); o.type = "triangle"; o.frequency.value = hz;
            o.connect(g).connect(ac.destination); const t = ac.currentTime + i * .07; g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(.18, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + .5); o.start(t); o.stop(t + .5);
          });
        } catch (_) {}
      },
    };
  })();

  // ---------------------------------------------------------------- setup
  let playerCount = 1, net = null, local = false;
  $("#count").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#count button").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel"); playerCount = +b.dataset.n;
  });
  $("#toPair").addEventListener("click", () => { SFX.resume(); openLane(); });
  $("#backSetup").addEventListener("click", () => { if (net) net.destroy(); net = null; show("setup"); });
  $("#skipPair").addEventListener("click", () => { local = true; if (net) net.destroy(); startGame(); });

  function openLane() {
    show("pair");
    const joinBase = location.origin + "/bowl/play.html";
    net = StrikeNet.host();
    net.on("code", (code) => {
      $("#codeOut").textContent = code;
      $("#joinHost").textContent = joinBase.replace(/^https?:\/\//, "");
      const url = joinBase + "#" + code;
      $("#qr").innerHTML = "";
      try { new QRCode($("#qr"), { text: url, width: 168, height: 168, colorDark: "#0a0c12", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
      $("#pairDot").className = "dot wait"; $("#pairMsg").textContent = "Waiting for a phone…";
    });
    net.on("paired", () => { net.send({ t: "hello", role: "tv" }); startGame(); });
    net.on("message", onPhoneMessage);
    net.on("dropped", () => { setGameStatus("off", "controller lost"); });
    net.on("error", () => { $("#pairDot").className = "dot off"; $("#pairMsg").textContent = "Couldn't open a lane — try Practice mode below."; });
  }

  // ---------------------------------------------------------------- scoring
  let players = [], cur = { p: 0, f: 0 }, standing = [], gameOver = false;
  const PINCOUNT = 10;

  function makePlayers(n) {
    players = []; for (let i = 0; i < n; i++) players.push({ name: "Player " + (i + 1), frames: Array.from({ length: 10 }, () => ({ rolls: [] })) });
  }
  function resetPins() { standing = new Array(PINCOUNT).fill(true); }
  const standingCount = () => standing.filter(Boolean).length;

  // bonus-aware 10-frame totals
  function computeTotals(pl) {
    const flat = []; pl.frames.forEach((f) => f.rolls.forEach((r) => flat.push(r)));
    const totals = []; let idx = 0, sum = 0;
    for (let f = 0; f < 10; f++) {
      const r = pl.frames[f].rolls; if (r.length === 0) { totals.push(null); continue; }
      if (f < 9) {
        if (r[0] === 10) { if (flat[idx + 1] == null || flat[idx + 2] == null) { totals.push(null); idx += 1; continue; } sum += 10 + flat[idx + 1] + flat[idx + 2]; idx += 1; }
        else if (r[0] + (r[1] || 0) === 10 && r.length >= 2) { if (flat[idx + 2] == null) { totals.push(null); idx += 2; continue; } sum += 10 + flat[idx + 2]; idx += 2; }
        else { if (r.length < 2) { totals.push(null); idx += r.length; continue; } sum += r[0] + r[1]; idx += 2; }
      } else { sum += r.reduce((a, b) => a + b, 0); idx += r.length; }
      totals.push(sum);
    }
    return totals;
  }

  // after a ball of `knocked` pins, advance turn state
  function advance(knocked) {
    const fr = players[cur.p].frames[cur.f];
    fr.rolls.push(knocked);
    renderBoard();
    const last = cur.f === 9;
    if (!last) {
      const strike = fr.rolls.length === 1 && fr.rolls[0] === 10;
      if (strike || fr.rolls.length === 2) { nextTurn(); } else { resumeBall(); } // ball 2, pins stay
    } else {
      const r = fr.rolls, n = r.length, s = r.reduce((a, b) => a + b, 0);
      if (n === 1) { if (r[0] === 10) resetPins(); resumeBall(); }
      else if (n === 2) {
        const bonus = r[0] === 10 || r[0] + r[1] === 10;
        // 3rd ball gets a fresh rack only if the 2nd cleared the deck (spare or strike);
        // after e.g. X then 5, the 3rd ball is thrown at the remaining pins.
        if (bonus) { if (standingCount() === 0) resetPins(); resumeBall(); }
        else nextTurn();
      } else { nextTurn(); } // 3 balls done
    }
  }

  function nextTurn() {
    cur.p++;
    if (cur.p >= players.length) { cur.p = 0; cur.f++; }
    if (cur.f > 9) { endGame(); return; }
    resetPins(); readyTurn();
  }
  function resumeBall() { readyTurn(); }

  function readyTurn() {
    const fr = players[cur.p].frames[cur.f];
    $("#whoUp").textContent = players[cur.p].name;
    $("#frameNo").textContent = "Frame " + (cur.f + 1) + " · Ball " + (fr.rolls.length + 1);
    renderBoard();
    ball.live = false; draw();
    if (net) net.send({ t: "turn", player: players[cur.p].name, frame: cur.f + 1, ball: fr.rolls.length + 1, standing: standingCount() });
  }

  function endGame() {
    gameOver = true;
    const ranked = players.map((p) => ({ name: p.name, score: computeTotals(p).filter((x) => x != null).pop() || 0 })).sort((a, b) => b.score - a.score);
    toast(ranked[0].name + " wins — " + ranked[0].score, "", 4000);
    SFX.cheer();
    if (net) net.send({ t: "gameover", winner: ranked[0].name, score: ranked[0].score });
  }

  // ---------------------------------------------------------------- pins / knockdown
  // lane-x in [-1,1]; pins occupy ~[-0.51,0.51]; y = row depth 0(front)..3(back)
  const PINS = [
    { x: 0.00, y: 0 },
    { x: -0.17, y: 1 }, { x: 0.17, y: 1 },
    { x: -0.34, y: 2 }, { x: 0.00, y: 2 }, { x: 0.34, y: 2 },
    { x: -0.51, y: 3 }, { x: -0.17, y: 3 }, { x: 0.17, y: 3 }, { x: 0.51, y: 3 },
  ];
  function knockdown(bx, power) {
    const before = standing.slice();
    const fall = new Array(PINCOUNT).fill(false);
    const HIT = 0.12 + power * 0.03;
    for (let i = 0; i < PINCOUNT; i++) if (standing[i] && Math.abs(PINS[i].x - bx) < HIT && PINS[i].y <= (power > 0.35 ? 3 : 1)) fall[i] = true;
    // spread energy back through the rack
    const spreadP = Math.min(0.96, 0.42 + power * 0.62);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < PINCOUNT; i++) {
        if (!standing[i] || fall[i]) continue;
        for (let j = 0; j < PINCOUNT; j++) {
          if (!fall[j]) continue;
          const dx = PINS[i].x - PINS[j].x, dy = (PINS[i].y - PINS[j].y) * 0.17;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.26 && Math.random() < spreadP - dist) { fall[i] = true; break; }
        }
      }
    }
    let knocked = 0;
    for (let i = 0; i < PINCOUNT; i++) if (fall[i] && standing[i]) { standing[i] = false; knocked++; }
    return { knocked, fell: before.map((b, i) => b && !standing[i]) };
  }

  // ---------------------------------------------------------------- render (2.5D)
  const cv = $("#lane"), g = cv.getContext("2d");
  let W = 0, H = 0, geo = {};
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    geo = { cx: W / 2, topY: H * 0.14, botY: H * 0.99, nearHalf: Math.min(W * 0.46, 420), farHalf: Math.min(W * 0.14, 120) };
  }
  window.addEventListener("resize", () => { resize(); draw(); });

  const half = (ly) => geo.nearHalf + (geo.farHalf - geo.nearHalf) * ly;
  const sy = (ly) => geo.botY + (geo.topY - geo.botY) * ly;
  const sx = (lx, ly) => geo.cx + lx * half(ly);
  const scl = (ly) => 1 - 0.66 * ly;

  // pin deck at ly ~ 0.78..0.96 (front..back). map pin row y(0..3) → ly
  const pinLy = (row) => 0.80 + row * 0.052;

  function drawPin(lx, row, state) {
    const ly = pinLy(row), x = sx(lx, ly), y = sy(ly), s = scl(ly) * 26;
    g.save(); g.translate(x, y);
    if (state && state.t > 0) { g.rotate((state.dir * Math.min(1, state.t) * 1.4)); g.globalAlpha = Math.max(0, 1 - state.t); }
    g.beginPath();
    g.moveTo(-s * 0.18, 0); g.quadraticCurveTo(-s * 0.3, -s * 0.5, -s * 0.12, -s * 0.72);
    g.quadraticCurveTo(-s * 0.26, -s, 0, -s); g.quadraticCurveTo(s * 0.26, -s, s * 0.12, -s * 0.72);
    g.quadraticCurveTo(s * 0.3, -s * 0.5, s * 0.18, 0); g.closePath();
    g.fillStyle = "#f6f1e7"; g.fill();
    g.fillStyle = "#ff5a2c"; g.fillRect(-s * 0.2, -s * 0.74, s * 0.4, s * 0.1);
    g.restore();
  }

  const ball = { live: false, x: 0, ly: 0, vy: 0, spin: 0, dur: 2, t: 0, aim: 0, startAim: 0, done: null };
  let pinAnim = [];

  function draw() {
    if (!W) resize();
    g.clearRect(0, 0, W, H);
    // backdrop pin-deck wall
    g.fillStyle = "#0b0f19"; g.fillRect(sx(-1, 1), 0, sx(1, 1) - sx(-1, 1), sy(0.96));
    // gutters
    g.fillStyle = "#05070c";
    g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(-1.28, 0), sy(0)); g.lineTo(sx(-1.08, 1), sy(1)); g.lineTo(sx(-1, 1), sy(1)); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(sx(1, 0), sy(0)); g.lineTo(sx(1.28, 0), sy(0)); g.lineTo(sx(1.08, 1), sy(1)); g.lineTo(sx(1, 1), sy(1)); g.closePath(); g.fill();
    // lane wood
    const grd = g.createLinearGradient(0, sy(1), 0, sy(0));
    grd.addColorStop(0, "#c88f44"); grd.addColorStop(1, "#e4ad5c");
    g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(1, 0), sy(0)); g.lineTo(sx(1, 1), sy(1)); g.lineTo(sx(-1, 1), sy(1)); g.closePath();
    g.fillStyle = grd; g.fill();
    // boards
    g.strokeStyle = "rgba(90,55,15,.35)"; g.lineWidth = 1;
    for (let b = -0.9; b <= 0.9; b += 0.2) { g.beginPath(); g.moveTo(sx(b, 0), sy(0)); g.lineTo(sx(b, 1), sy(1)); g.stroke(); }
    // aiming arrows
    for (const ax of [-0.45, -0.22, 0, 0.22, 0.45]) {
      const ly = 0.42, x = sx(ax, ly), y = sy(ly), s = scl(ly) * 14;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x - s * 0.5, y); g.lineTo(x + s * 0.5, y); g.closePath();
      g.fillStyle = "rgba(90,55,15,.5)"; g.fill();
    }
    // foul line
    g.strokeStyle = "rgba(255,90,44,.6)"; g.lineWidth = 3; g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(1, 0), sy(0)); g.stroke();

    // pins (back rows first)
    const order = [6, 7, 8, 9, 3, 4, 5, 1, 2, 0];
    for (const i of order) {
      const a = pinAnim[i];
      if (standing[i]) drawPin(PINS[i].x, PINS[i].y, null);
      else if (a && a.t < 1) drawPin(PINS[i].x, PINS[i].y, a);
    }

    // ball
    if (ball.live || ball.showRest) {
      const ly = ball.live ? ball.ly : 0.02;
      const bx = ball.live ? ball.x : ball.aim;
      const x = sx(bx, ly), y = sy(ly), r = scl(ly) * 30;
      const bg = g.createRadialGradient(x - r * .35, y - r * .4, r * .2, x, y, r);
      bg.addColorStop(0, "#ff9a72"); bg.addColorStop(1, "#d63c12");
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = bg; g.fill();
      g.fillStyle = "rgba(0,0,0,.5)";
      [[-.3, -.25], [.15, -.3], [-.05, -.05]].forEach(([ox, oy]) => { g.beginPath(); g.arc(x + ox * r, y + oy * r, r * .09, 0, 7); g.fill(); });
    }
  }

  let raf = 0, last = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    let animating = false;
    if (ball.live) {
      ball.t += dt; const p = Math.min(1, ball.t / ball.dur);
      ball.ly = p;
      // hook: lateral drift grows toward the back third
      const curve = Math.pow(p, 2.2);
      ball.x = ball.startAim + ball.spin * curve;
      if (Math.abs(ball.x) > 1.02) { // gutter
        ball.live = false; ball.x = Math.sign(ball.x) * 1.04; arrive(0, true); animating = false;
      } else if (p >= 1) { ball.live = false; arrive(ball.x, false); }
      else animating = true;
    }
    pinAnim.forEach((a) => { if (a && a.t < 1) { a.t += dt * 2.2; animating = true; } });
    draw();
    if (animating || ball.live) raf = requestAnimationFrame(loop); else raf = 0;
  }
  const run = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  function arrive(bx, gutter) {
    let knocked = 0;
    if (!gutter) {
      const res = knockdown(bx, ball.power);
      knocked = res.knocked;
      res.fell.forEach((f, i) => { if (f) pinAnim[i] = { t: 0.001, dir: (PINS[i].x < bx ? -1 : 1) * (0.6 + Math.random()) }; });
      if (knocked) SFX.crash(knocked);
    }
    const fr = players[cur.p].frames[cur.f];
    const firstBall = fr.rolls.length === 0;
    setTimeout(() => {
      if (!gutter && firstBall && knocked === 10) toast("STRIKE!", "");
      else if (!firstBall && standingCount() === 0 && knocked > 0) toast("SPARE!", "spare");
      else if (gutter) toast("Gutter", "spare", 900);
    }, 220);
    if (net) net.send({ t: "result", knocked: knocked, standing: standingCount(), gutter: gutter });
    setTimeout(() => { if (!gameOver) advance(knocked); }, 1300);
    run();
  }

  // the one entry point for a throw, from phone OR local control
  function throwBall(sw) {
    if (ball.live || gameOver) return;
    ball.power = clamp(sw.power, 0.08, 1);
    ball.aim = clamp(sw.aim, -0.82, 0.82);
    ball.startAim = ball.aim;
    ball.spin = clamp(sw.spin, -0.6, 0.6);
    ball.dur = 2.5 - ball.power * 1.1; // faster = higher power
    ball.t = 0; ball.ly = 0; ball.x = ball.aim; ball.live = true; ball.showRest = true;
    SFX.roll(ball.dur);
    run();
    if (net) net.send({ t: "rolling" });
  }

  // ---------------------------------------------------------------- scoreboard
  function renderBoard() {
    const tb = $("#board");
    let head = "<tr><th class='pname'>Bowler</th>";
    for (let f = 1; f <= 10; f++) head += "<th class='" + (f === 10 ? "f10" : "") + "'>" + f + "</th>";
    head += "</tr>";
    let rows = "";
    players.forEach((p, pi) => {
      const totals = computeTotals(p);
      rows += "<tr class='" + (pi === cur.p && !gameOver ? "active" : "") + "'><td class='pname'>" + esc(p.name) + "</td>";
      p.frames.forEach((fr, fi) => {
        const marks = ballMarks(fr.rolls, fi);
        rows += "<td class='frame " + (fi === 9 ? "f10" : "") + "'><span class='balls'>" + marks +
          "</span><span class='total'>" + (totals[fi] != null ? totals[fi] : "") + "</span></td>";
      });
      rows += "</tr>";
    });
    tb.innerHTML = head + rows;
  }
  function ballMarks(rolls, fi) {
    const cell = (c, cls) => "<span class='" + (cls || "") + "'>" + c + "</span>";
    if (fi < 9) {
      if (rolls.length === 1 && rolls[0] === 10) return cell("", "") + cell("X", "x");
      let out = "";
      if (rolls.length >= 1) out += cell(rolls[0] === 0 ? "-" : rolls[0]);
      if (rolls.length >= 2) out += cell(rolls[0] + rolls[1] === 10 ? "/" : (rolls[1] === 0 ? "-" : rolls[1]), rolls[0] + rolls[1] === 10 ? "sp" : "");
      return out;
    }
    // 10th frame, up to 3
    let out = "", prev = 0;
    rolls.forEach((r, i) => {
      if (r === 10) out += cell("X", "x");
      else if (i > 0 && prev + r === 10 && prev !== 10) out += cell("/", "sp");
      else out += cell(r === 0 ? "-" : r);
      prev = (prev === 10 || (i > 0 && prev + r === 10)) ? 0 : r;
    });
    return out;
  }

  // ---------------------------------------------------------------- toast
  let toastTimer;
  function toast(text, cls, ms) {
    const t = $("#toast"); t.textContent = text; t.className = "toast " + (cls || "");
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms || 1600);
  }
  function setGameStatus(dot, msg) { $("#gameDot").className = "dot " + dot; $("#gameMsg").textContent = msg; }

  // ---------------------------------------------------------------- phone msgs
  function onPhoneMessage(d) {
    if (!d || typeof d !== "object") return;
    if (d.t === "swing") throwBall({ power: d.power, spin: d.spin, aim: d.aim });
    else if (d.t === "hello") setGameStatus("on", "phone connected");
  }

  // ---------------------------------------------------------------- start
  function startGame() {
    makePlayers(playerCount); cur = { p: 0, f: 0 }; gameOver = false;
    pinAnim = new Array(PINCOUNT).fill(null); resetPins();
    show("game");
    setGameStatus(local ? "wait" : "on", local ? "practice mode" : "phone connected");
    readyTurn();
    // size the canvas once the scoreboard has taken its space, then paint
    requestAnimationFrame(() => { resize(); draw(); });
    if (local) enableLocalControl();
  }

  // local practice: swipe up on the lane to bowl (y=power, x-start=aim, x-drift=spin)
  function enableLocalControl() {
    let s = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); const c = e.touches ? e.touches[0] : e; return { x: (c.clientX - r.left) / r.width, y: (c.clientY - r.top) / r.height, time: performance.now() }; };
    cv.addEventListener("pointerdown", (e) => { s = pt(e); ball.aim = (s.x - 0.5) * 1.6; ball.showRest = true; draw(); });
    cv.addEventListener("pointermove", (e) => { if (s) { const p = pt(e); ball.aim = (p.x - 0.5) * 1.6; draw(); } });
    cv.addEventListener("pointerup", (e) => {
      if (!s) return; const p = pt(e); const dt = (p.time - s.time) / 1000 || 0.3;
      const dy = s.y - p.y; const dx = p.x - s.x;
      const power = clamp((dy / dt) * 0.9 + 0.2, 0.15, 1);
      throwBall({ power, aim: (s.x - 0.5) * 1.6, spin: dx * 2.2 }); s = null;
    });
  }

  // ---------------------------------------------------------------- utils
  function clamp(v, a, b) { v = +v || 0; return v < a ? a : v > b ? b : v; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  resize();

  // --- tv.html#demo : start a local game with a believable board (screenshots + smoke test) ---
  if (/demo/.test(location.hash)) {
    playerCount = 3; local = true; startGame();
    const seeds = [
      [[10], [9, 1], [8, 0], [10], [7, 2], [10], [9, 0], [8, 1], [10], [7, 2, 10]],
      [[9, 1], [8, 1], [10], [7, 2], [9, 0], [10], [8, 1], [9, 1], [7, 2], [8, 1]],
      [[7, 2], [10], [9, 1], [8, 0], [], [], [], [], [], []],
    ];
    seeds.forEach((frames, pi) => { if (players[pi]) players[pi].frames = frames.map((r) => ({ rolls: r })); });
    cur = { p: 2, f: 4 };
    standing = [false, true, false, true, true, false, true, false, true, true];
    pinAnim[0] = { t: 0.6, dir: 0.9 }; pinAnim[2] = { t: 0.75, dir: -0.8 }; pinAnim[5] = { t: 0.5, dir: 0.7 }; pinAnim[7] = { t: 0.65, dir: -1 };
    ball.showRest = true; ball.aim = 0.1; ball.live = false;
    $("#whoUp").textContent = players[2].name; $("#frameNo").textContent = "Frame 5 · Ball 2";
    setGameStatus("on", "phone connected");
    renderBoard();
    requestAnimationFrame(() => { resize(); draw(); });
  }
})();
