/*
 * StrikeCast bowling physics — a skid / hook / roll ball-motion model.
 *
 * Normalized lane: ly 0 (foul line) .. 1 (head pin) == 60 ft. lx in [-1, 1]
 * across 39 boards, +lx = bowler's right. Pocket is ~board 17.5, so lx ~ 0.13
 * on the bowler's hand side. A right-hander (hand +1) hooks the ball toward -lx.
 *
 * The ball skids through the oil up front (low friction, little hook), grips and
 * hooks as it reaches the drier back end, then "rolls out" and sets on a line.
 * Break point, entry board and entry angle all fall out of the simulation.
 */
(function (global) {
  // -------- arsenal (archetypes, not real brands) --------
  const BALLS = [
    { id: "spare", name: "Clear Strike", type: "Plastic",         color: "#dfe8f5", rim: "#95a8c4", hook: 0.18, length: 0.80, backend: 0.50, note: "Straight — your spare & single-pin ball" },
    { id: "ure",   name: "Night Owl",    type: "Urethane",        color: "#6a4bd0", rim: "#32227a", hook: 0.62, length: 0.52, backend: 0.62, note: "Smooth, predictable, controllable arc" },
    { id: "pearl", name: "Phaze",        type: "Reactive Pearl",  color: "#17a2c4", rim: "#0b3e4e", hook: 0.24, length: 0.66, backend: 1.00, note: "Saves length, then a sharp flip" },
    { id: "solid", name: "Hammer",       type: "Reactive Solid",  color: "#14161c", rim: "#ff5a2c", hook: 0.31, length: 0.46, backend: 1.00, note: "Reads early, strong continuous backend" },
    { id: "asym",  name: "Verdict",      type: "Asym Solid",      color: "#b01030", rim: "#58101f", hook: 0.40, length: 0.44, backend: 1.00, note: "Maximum hook for heavy oil" },
  ];

  // -------- oil patterns --------  length = how far down the lane the oil runs (ly);
  // edge = how much drier the outside boards are (a house shot funnels to the pocket).
  const OILS = {
    house: { id: "house", name: "House Shot",   length: 0.60, edge: 0.95, note: "Forgiving — oil in the middle, dry outside" },
    sport: { id: "sport", name: "Sport / Flat", length: 0.58, edge: 0.10, note: "Flat — no bailout, pure accuracy" },
    dry:   { id: "dry",   name: "Dry / Burnt",  length: 0.34, edge: 0.35, note: "Short oil — hooks early and a lot" },
    heavy: { id: "heavy", name: "Heavy Oil",    length: 0.82, edge: 0.25, note: "Oil way down lane — the ball barely grips" },
  };

  // -------- tunables --------
  const K = {
    HOOK: 9.5,        // overall hook strength (normalized lateral accel)
    GRIP_SKID: 0.26,  // base friction needed before a ball grips (scaled by ball.length)
    SET: 2.8,         // how fast gripping spends the ball's rev energy (then it rolls/holds)
    SPEED0: 0.455,    // down-lane speed (lane-units/s) at 16 mph
    DECAY: 0.5,       // speed loss from friction
    REV0: 330,        // rev rate that reads as "1.0"
    VXMAX: 1.35,       // cap on lateral speed — real balls don't snap 20 boards in 5 ft
    REVFADE: 0.07,    // revs bleed off slowly down the whole lane (tames deep end-snaps)
  };
  const LANE_HALF_FT = 1.729, LANE_LEN_FT = 60;

  // board numbering follows a right-hander: board 1 = right gutter (+lx),
  // board 20 = center (lx 0), board 39 = left gutter (-lx).
  const boardToLx = (b) => (20 - b) / 19;
  const lxToBoard = (x) => Math.round(20 - x * 19);
  const POCKET_LX = (hand) => 0.13 * hand;          // ~board 17.5 on the hand side
  const POCKET_BOARD = (hand) => lxToBoard(POCKET_LX(hand));

  // friction along the lane: the ball slides on the oil up front, then grips once
  // it runs past the end of the oil; a house shot is drier (grippier) outside.
  function friction(ly, lx, oil) {
    const dry = Math.max(0, (ly - oil.length) / (1 - oil.length)); // 0 in the oil, 1 at the pins
    const grip = 0.13 + 1.05 * Math.pow(dry, 1.25);
    const edge = 1 + oil.edge * Math.pow(Math.abs(lx), 2.0);
    return grip * edge;
  }

  // simulate a shot -> full path + telemetry
  function simulate(input, ball, oil) {
    const hand = input.hand || 1;
    const dt = 0.0045;
    let lx = boardToLx(input.launchBoard);
    let ly = 0;
    const speed0 = K.SPEED0 * (input.speedMph / 16);
    let speed = speed0;
    // initial lateral velocity from the release angle (degrees; + = toward +lx/right).
    // tan(angle) * downlane-speed, converted from feet back into lane-x units.
    const launchAngle = input.launchAngle || 0;
    let vx = Math.tan(launchAngle * Math.PI / 180) * speed * (LANE_LEN_FT / LANE_HALF_FT);
    const revN = input.revRate / K.REV0;
    const skidThresh = K.GRIP_SKID + ball.length * 0.30;
    let revsLeft = revN;                                  // the ball's "hook energy"
    const skidLx = lx;                                    // where it crosses the foul line (unused but handy)

    let broke = false, breakLy = 0, breakBoard = input.launchBoard;
    const path = [{ lx, ly }];

    for (let i = 0; i < 2600 && ly < 1.0; i++) {
      const fr = friction(ly, lx, oil);
      const grip = Math.max(0, fr - skidThresh);
      if (grip > 0 && revsLeft > 0.002) {
        // the drier the boards (more grip), the harder it digs AND the faster it
        // spends its revs — so dry lanes break earlier and flip sharper.
        if (!broke) { broke = true; breakLy = ly; breakBoard = lxToBoard(lx); }
        const hookA = K.HOOK * ball.hook * ball.backend * grip * revsLeft / (speed / K.SPEED0);
        vx += -hand * hookA * dt;                          // RH (+1) hooks toward -lx
        if (vx > K.VXMAX) vx = K.VXMAX; else if (vx < -K.VXMAX) vx = -K.VXMAX;
        revsLeft -= grip * dt * K.SET;                     // spend rev energy; then it rolls/holds its line
      }
      revsLeft -= dt * K.REVFADE;                          // revs fade down the lane regardless
      speed -= fr * K.DECAY * dt * speed;
      ly += speed * dt;
      lx += vx * dt;
      if (Math.abs(lx) > 1.02) {                          // gutter
        path.push({ lx: Math.sign(lx) * 1.03, ly });
        return { path, gutter: true, ball, oil, speedMph: input.speedMph, revRate: input.revRate, launchBoard: input.launchBoard, hand };
      }
      if (i % 3 === 0) path.push({ lx, ly });
    }
    path.push({ lx, ly: 1 });

    // entry angle & board from the last ~3 ft of travel.
    // lane is 60 ft long but only ~3.46 ft wide, so lx and ly must be put back
    // into real feet before taking the angle (half-width = 1.729 ft at |lx|=1).
    const n = path.length;
    const a = path[Math.max(0, n - 7)], b = path[n - 1];
    const dLatFt = (b.lx - a.lx) * 1.729;
    const dDownFt = ((b.ly - a.ly) || 1e-3) * 60;
    const entryAngle = Math.abs(Math.atan2(dLatFt, dDownFt) * 180 / Math.PI);
    return {
      path, gutter: false, ball, oil, hand,
      entryLx: b.lx,
      entryBoard: lxToBoard(b.lx),
      entryAngle,
      breakBoard, breakFeet: Math.round(breakLy * 60),
      speedMph: input.speedMph, revRate: input.revRate,
      launchBoard: input.launchBoard,
    };
  }

  // pin positions (index 0 = head pin). +x = right.
  const PINS = [
    { x: 0.00, y: 0 },
    { x: -0.17, y: 1 }, { x: 0.17, y: 1 },
    { x: -0.34, y: 2 }, { x: 0.00, y: 2 }, { x: 0.34, y: 2 },
    { x: -0.51, y: 3 }, { x: -0.17, y: 3 }, { x: 0.17, y: 3 }, { x: 0.51, y: 3 },
  ];

  // carry: given the entry, decide which standing pins fall. Pins the ball drives
  // through fall directly; a knocked pin scatters its neighbours (messengers), and
  // the ball DEFLECTS off an imperfect hit so the signature pins survive:
  //  light (right of pocket) -> 10 / 2-4-5 / 3-6-10;  high (into the nose) -> splits;
  //  a flat (low-angle) hit leaves corner pins. Flush + angle carries ~75%.
  // pin indices: 0=1 1=2 2=3 3=4 4=5 5=6 6=7 7=8 8=9 9=10
  function carry(result, standing, rnd) {
    rnd = rnd || Math.random;
    const fell = new Array(10).fill(false);
    if (result.gutter) return { fell, count: 0 };

    const n = result.path.length;
    const p1 = result.path[Math.max(0, n - 6)], p2 = result.path[n - 1];
    const slope = (p2.lx - p1.lx) / ((p2.ly - p1.ly) || 1e-3);
    const ballXat = (row) => p2.lx + slope * (row * 0.055);

    const speed = result.speedMph / 16, rev = result.revRate / 350;
    const energy = speed * (0.62 + rev * 0.38);
    const angleN = Math.min(1.25, result.entryAngle / 5.5);
    const hand = result.hand || 1;
    const pocketErr = (result.entryBoard - 17.5) * hand; // + = high/nose side, - = light/outside

    // direct contact
    for (let i = 0; i < 10; i++) {
      if (!standing[i]) continue;
      if (Math.abs(PINS[i].x - ballXat(PINS[i].y)) < 0.11 + energy * 0.02) fell[i] = true;
    }
    // messengers — energy and entry angle drive how far the mix spreads
    const spread = 0.30 + energy * 0.22 + angleN * 0.20;
    for (let pass = 0; pass < 5; pass++) {
      for (let i = 0; i < 10; i++) {
        if (!standing[i] || fell[i]) continue;
        for (let j = 0; j < 10; j++) {
          if (!fell[j]) continue;
          const dx = PINS[i].x - PINS[j].x, dy = (PINS[i].y - PINS[j].y) * 0.17;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.28 && rnd() < (spread - dist) * (1 + angleN * 0.4)) { fell[i] = true; break; }
        }
      }
    }
    // deflection survivors — the ball can't carry the whole rack off a poor hit
    const stand = (idx, prob) => idx.forEach((i) => { if (fell[i] && standing[i] && rnd() < prob) fell[i] = false; });
    const lo = hand > 0 ? { ten: 9, six: 5, three: 2, four: 3, seven: 6 } : { ten: 6, six: 3, three: 1, four: 5, seven: 9 };
    if (pocketErr < -2.0) stand([lo.ten, lo.six, lo.three], 0.25 + Math.min(0.55, (-pocketErr - 2.0) * 0.14));  // light
    if (pocketErr > 2.0) stand([lo.four, lo.seven, 1], 0.22 + Math.min(0.55, (pocketErr - 2.0) * 0.14));         // high/nose -> splits
    if (result.entryAngle < 2.3) stand([lo.ten, lo.seven], 0.28);                                                // flat -> corners
    // even a flush shot doesn't carry every time
    if (Math.abs(pocketErr) <= 2.0 && result.entryAngle >= 2.3) stand([lo.ten], 0.16);

    let count = 0;
    for (let i = 0; i < 10; i++) if (fell[i] && standing[i]) count++;
    return { fell, count };
  }

  global.StrikeBowl = { BALLS, OILS, simulate, carry, friction, boardToLx, lxToBoard, POCKET_LX, POCKET_BOARD, PINS, K };
})(typeof window !== "undefined" ? window : globalThis);
