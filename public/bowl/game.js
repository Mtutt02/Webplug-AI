/* StrikeCast TV — lane render, shot pipeline (balls.js physics), practice + game modes. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const SB = window.StrikeBowl;
  const screens = { home: $("#home"), opt: $("#opt"), pair: $("#pair"), lane: $("#laneScreen") };
  const show = (n) => Object.entries(screens).forEach(([k, el]) => el.classList.toggle("show", k === n));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------------------------------------------------------------- sound
  const SFX = (() => {
    let ac; const ctx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
    return {
      resume() { try { ctx(); if (ac.state === "suspended") ac.resume(); } catch (_) {} },
      roll(dur) { try { ctx(); const b = ac.createBuffer(1, ac.sampleRate * Math.max(.3, dur), ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5; const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 190; const g = ac.createGain(); g.gain.value = 0; s.connect(f).connect(g).connect(ac.destination); const t = ac.currentTime; g.gain.linearRampToValueAtTime(.22, t + .12); g.gain.setValueAtTime(.22, t + dur - .12); g.gain.linearRampToValueAtTime(0, t + dur); s.start(); s.stop(t + dur); } catch (_) {} },
      crash(n) { try { ctx(); const g = ac.createGain(); g.connect(ac.destination); const b = ac.createBuffer(1, ac.sampleRate * .45, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * .28)); const s = ac.createBufferSource(); s.buffer = b; const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 900 + n * 110; s.connect(f).connect(g); const t = ac.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.min(.5, .12 + n * .04), t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + .4); s.start(); } catch (_) {} },
      cheer() { try { ctx(); [523, 659, 784, 1047].forEach((hz, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "triangle"; o.frequency.value = hz; o.connect(g).connect(ac.destination); const t = ac.currentTime + i * .07; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + .5); o.start(t); o.stop(t + .5); }); } catch (_) {} },
    };
  })();

  // ---------------------------------------------------------------- settings/state
  let mode = "practice", oilId = "house", playerCount = 1;
  let net = null, local = false;
  let bowler = { ballId: "solid", hand: 1 };                 // last reported from the phone
  const ballOf = (id) => SB.BALLS.find((b) => b.id === id) || SB.BALLS[3];

  // practice stats
  let stats = null;
  const resetStats = () => (stats = { shots: 0, strikes: 0, spares: 0, pocket: 0, sumBoard: 0, sumAngle: 0, sumMph: 0, sumRev: 0, standing: new Array(10).fill(true) });

  // game (10-frame) state
  let players = [], cur = { p: 0, f: 0 }, standing = new Array(10).fill(true), gameOver = false, busy = false;

  // ---------------------------------------------------------------- home UI
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; SFX.resume(); openOptions(); }));
  function openOptions() {
    $("#optMode").textContent = mode === "practice" ? "Practice" : "Game";
    $("#gameOpts").hidden = mode !== "game";
    show("opt");
  }
  // oil + (game) players chosen on the options screen
  document.querySelectorAll("#oilPick [data-oil]").forEach((b) => b.addEventListener("click", () => { oilId = b.dataset.oil; syncPills("#oilPick", b); }));
  document.querySelectorAll("#countPick [data-n]").forEach((b) => b.addEventListener("click", () => { playerCount = +b.dataset.n; syncPills("#countPick", b); }));
  function syncPills(sel, el) { document.querySelectorAll(sel + " button").forEach((x) => x.classList.toggle("sel", x === el)); }
  $("#optBack") && $("#optBack").addEventListener("click", () => show("home"));
  $("#optGo") && $("#optGo").addEventListener("click", () => { SFX.resume(); openLane(); });

  // ---------------------------------------------------------------- pairing
  function openLane() {
    show("pair");
    const joinBase = location.origin + "/bowl/play.html";
    net = SB && window.StrikeNet ? window.StrikeNet.host() : null;
    if (!net) { startLane(); return; }
    net.on("code", (code) => {
      $("#codeOut").textContent = code;
      $("#joinHost").textContent = joinBase.replace(/^https?:\/\//, "");
      $("#qr").innerHTML = ""; try { new QRCode($("#qr"), { text: joinBase + "#" + code, width: 168, height: 168, colorDark: "#0a0c12", colorLight: "#fff", correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
      $("#pairDot").className = "dot wait"; $("#pairMsg").textContent = "Waiting for a phone…";
    });
    net.on("paired", () => { net.send({ t: "hello", role: "tv", mode: mode, oil: oilId }); startLane(); });
    net.on("message", onPhoneMessage);
    net.on("dropped", () => setStatus("off", "controller lost"));
    net.on("error", () => { $("#pairDot").className = "dot off"; $("#pairMsg").textContent = "Couldn't open a lane — try Practice-local below."; });
  }
  $("#backHome2") && $("#backHome2").addEventListener("click", () => { if (net) net.destroy(); net = null; show("opt"); });
  $("#skipPair") && $("#skipPair").addEventListener("click", () => { local = true; if (net) net.destroy(); startLane(); });

  // ---------------------------------------------------------------- lane geometry (2.5D)
  const cv = $("#lane"), g = cv.getContext("2d");
  let W = 0, H = 0, geo = {};
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    geo = { cx: W / 2, topY: H * 0.12, botY: H * 0.99, nearHalf: Math.min(W * 0.44, 440), farHalf: Math.min(W * 0.13, 128) };
  }
  window.addEventListener("resize", () => { resize(); draw(); });
  const half = (ly) => geo.nearHalf + (geo.farHalf - geo.nearHalf) * ly;
  const sy = (ly) => geo.botY + (geo.topY - geo.botY) * ly;
  const sx = (lx, ly) => geo.cx + lx * half(ly);
  const scl = (ly) => 1 - 0.66 * ly;
  const pinLy = (row) => 0.80 + row * 0.052;                 // pin rows in lane-ly

  // ---------------------------------------------------------------- render
  const ball = { live: false, path: null, i: 0, t: 0, dur: 2, color: "#d63c12", rolled: false };
  let pinAnim = new Array(10).fill(null);
  let trail = [];

  function drawLaneWood() {
    // pin-deck wall
    g.fillStyle = "#0b0f19"; g.fillRect(sx(-1, 1), 0, sx(1, 1) - sx(-1, 1), sy(0.96));
    // gutters
    g.fillStyle = "#05070c";
    g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(-1.3, 0), sy(0)); g.lineTo(sx(-1.09, 1), sy(1)); g.lineTo(sx(-1, 1), sy(1)); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(sx(1, 0), sy(0)); g.lineTo(sx(1.3, 0), sy(0)); g.lineTo(sx(1.09, 1), sy(1)); g.lineTo(sx(1, 1), sy(1)); g.closePath(); g.fill();
    // wood
    const grd = g.createLinearGradient(0, sy(1), 0, sy(0)); grd.addColorStop(0, "#c88f44"); grd.addColorStop(1, "#e7b060");
    g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(1, 0), sy(0)); g.lineTo(sx(1, 1), sy(1)); g.lineTo(sx(-1, 1), sy(1)); g.closePath(); g.fillStyle = grd; g.fill();
    // boards
    g.strokeStyle = "rgba(90,55,15,.3)"; g.lineWidth = 1;
    for (let b = -0.9; b <= 0.9; b += 0.1) { g.beginPath(); g.moveTo(sx(b, 0), sy(0)); g.lineTo(sx(b, 1), sy(1)); g.stroke(); }
    // oil sheen — translucent bluish over the oiled length; house has a drier (clearer) outside
    const oil = SB.OILS[oilId]; const oilTop = oil.length;
    const og = g.createLinearGradient(0, sy(0), 0, sy(oilTop)); og.addColorStop(0, "rgba(70,150,210,.16)"); og.addColorStop(1, "rgba(70,150,210,.015)");
    g.save(); g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(1, 0), sy(0)); g.lineTo(sx(1, oilTop), sy(oilTop)); g.lineTo(sx(-1, oilTop), sy(oilTop)); g.closePath(); g.clip();
    g.fillStyle = og; g.fillRect(0, 0, W, H);
    if (oil.edge > 0.5) { g.fillStyle = "rgba(10,12,18,.0)"; const mid = g.createLinearGradient(sx(-1, .3), 0, sx(1, .3), 0); mid.addColorStop(0, "rgba(70,150,210,0)"); mid.addColorStop(.5, "rgba(70,150,210,.10)"); mid.addColorStop(1, "rgba(70,150,210,0)"); g.fillStyle = mid; g.fillRect(0, 0, W, H); }
    g.restore();
    // arrows (~15ft, ly .25)
    for (const ax of [-0.53, -0.26, 0, 0.26, 0.53]) { const ly = 0.26, x = sx(ax, ly), y = sy(ly), s = scl(ly) * 13; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x - s * .5, y); g.lineTo(x + s * .5, y); g.closePath(); g.fillStyle = "rgba(85,52,16,.55)"; g.fill(); }
    // foul line
    g.strokeStyle = "rgba(255,90,44,.55)"; g.lineWidth = 3; g.beginPath(); g.moveTo(sx(-1, 0), sy(0)); g.lineTo(sx(1, 0), sy(0)); g.stroke();
  }

  function drawPin(lx, row, a) {
    const ly = pinLy(row); let x = sx(lx, ly), y = sy(ly); const s = scl(ly) * 30;
    g.save();
    if (a) { x += a.dx * s * 2.4; y += a.dy * s; g.translate(x, y); g.rotate(a.dir * Math.min(1, a.t) * 1.5); g.globalAlpha = Math.max(0, 1 - a.t * 0.9); }
    else g.translate(x, y);
    // body
    g.beginPath();
    g.moveTo(-s * .17, 0); g.quadraticCurveTo(-s * .30, -s * .48, -s * .11, -s * .70);
    g.quadraticCurveTo(-s * .25, -s, 0, -s); g.quadraticCurveTo(s * .25, -s, s * .11, -s * .70);
    g.quadraticCurveTo(s * .30, -s * .48, s * .17, 0); g.closePath();
    const pg = g.createLinearGradient(-s * .3, 0, s * .3, 0); pg.addColorStop(0, "#cfc7b6"); pg.addColorStop(.4, "#f8f3ea"); pg.addColorStop(1, "#b6ae9d");
    g.fillStyle = pg; g.fill();
    g.fillStyle = "#ff5a2c"; g.fillRect(-s * .19, -s * .74, s * .38, s * .09); g.fillRect(-s * .22, -s * .55, s * .44, s * .055);
    g.restore();
  }

  function drawBallAt(lx, ly, color) {
    const x = sx(lx, ly), y = sy(ly), r = scl(ly) * 30;
    g.beginPath(); g.ellipse(x, y + r * .5, r * .85, r * .3, 0, 0, 7); g.fillStyle = "rgba(0,0,0,.28)"; g.fill(); // shadow
    const bg = g.createRadialGradient(x - r * .35, y - r * .4, r * .15, x, y, r);
    const c = color || "#d63c12"; bg.addColorStop(0, shade(c, 60)); bg.addColorStop(1, shade(c, -30));
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = bg; g.fill();
    // spinning finger holes
    const spin = ball.live ? ball.t * 8 : 0;
    g.fillStyle = "rgba(0,0,0,.5)";
    [[0, -.32], [.26, -.12], [-.26, -.12]].forEach(([ox, oy]) => { const a = Math.atan2(oy, ox) + spin, rad = Math.hypot(ox, oy) * r; g.beginPath(); g.arc(x + Math.cos(a) * rad, y + Math.sin(a) * rad, r * .1, 0, 7); g.fill(); });
  }
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + amt, gg = ((n >> 8) & 255) + amt, b = (n & 255) + amt; r = clamp(r, 0, 255); gg = clamp(gg, 0, 255); b = clamp(b, 0, 255); return `rgb(${r},${gg},${b})`; }

  function draw() {
    if (!W) resize();
    g.clearRect(0, 0, W, H);
    drawLaneWood();
    // hook trail
    if (trail.length > 1) {
      g.lineWidth = 4; g.lineCap = "round";
      for (let i = 1; i < trail.length; i++) { const a = trail[i - 1], b = trail[i]; g.strokeStyle = `rgba(255,90,44,${(i / trail.length) * .5})`; g.beginPath(); g.moveTo(sx(a.lx, a.ly), sy(a.ly)); g.lineTo(sx(b.lx, b.ly), sy(b.ly)); g.stroke(); }
    }
    // pins (back rows first)
    const order = [6, 7, 8, 9, 3, 4, 5, 1, 2, 0];
    for (const i of order) { const a = pinAnim[i]; if (standing[i]) drawPin(SB.PINS[i].x, SB.PINS[i].y, null); else if (a && a.t < 1.1) drawPin(SB.PINS[i].x, SB.PINS[i].y, a); }
    // ball
    if (ball.live && ball.path) { const p = ball.path[ball.i]; drawBallAt(p.lx, p.ly, ball.color); }
    else if (ball.rest) drawBallAt(ball.restLx, 0.02, ball.color);
  }

  // ---------------------------------------------------------------- shot pipeline
  let raf = 0, lastT = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
    let anim = false;
    if (ball.live && ball.path) {
      ball.t += dt; const prog = Math.min(1, ball.t / ball.dur);
      // index along path by progress (path is ordered foul->pins)
      ball.i = Math.min(ball.path.length - 1, Math.max(0, Math.floor(prog * (ball.path.length - 1))));
      const cp = ball.path[ball.i];
      if (!cp) { console.log("BAD idx", ball.i, "len", ball.path && ball.path.length, "prog", prog, "t", ball.t, "dur", ball.dur); ball.live = false; onArrive(); return; }
      trail.push({ lx: cp.lx, ly: cp.ly }); if (trail.length > 80) trail.shift();
      if (prog >= 1) { ball.live = false; onArrive(); } else anim = true;
    }
    pinAnim.forEach((a) => { if (a && a.t < 1.1) { a.t += dt * 2.0; anim = true; } });
    draw();
    raf = (anim || ball.live) ? requestAnimationFrame(loop) : 0;
  }
  const run = () => { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } };

  let lastResult = null;
  function throwShot(input) {
    if (busy) return; busy = true;
    const b = ballOf(input.ballId || bowler.ballId);
    bowler = { ballId: b.id, hand: input.hand || bowler.hand };
    const r = SB.simulate({ hand: input.hand || 1, speedMph: input.speedMph, revRate: input.revRate, launchBoard: input.launchBoard, launchAngle: input.launchAngle || 0 }, b, SB.OILS[oilId]);
    lastResult = r;
    ball.path = r.path; ball.i = 0; ball.t = 0; ball.color = b.color; ball.live = true; ball.rest = false;
    ball.dur = 2.7 - (input.speedMph - 12) / 8 * 1.1; trail = [];
    SFX.roll(ball.dur); run();
    if (net) net.send({ t: "rolling" });
  }

  function onArrive() {
    const r = lastResult;
    const res = SB.carry(r, standing.slice());
    res.fell.forEach((f, i) => { if (f && standing[i]) { standing[i] = false; const sidePush = SB.PINS[i].x < r.entryLx ? -1 : 1; pinAnim[i] = { t: 0.001, dir: sidePush * (0.5 + Math.random()), dx: sidePush * (0.2 + Math.random() * 0.5), dy: -(0.3 + Math.random() * 0.4) }; } });
    if (res.count) SFX.crash(res.count);
    const leave = standing.map((s, i) => s ? i + 1 : null).filter((x) => x);
    run();
    setTimeout(() => finishShot(r, res, leave), 1100);
  }

  function finishShot(r, res, leave) {
    if (mode === "practice") {
      stats.shots++; stats.sumBoard += r.entryBoard; stats.sumAngle += r.entryAngle; stats.sumMph += r.speedMph; stats.sumRev += r.revRate;
      const firstBallFresh = leave.length + res.count === 10;
      const pocket = Math.abs(r.entryBoard - (r.hand > 0 ? 18 : 22)) <= 2 && !r.gutter;
      if (pocket) stats.pocket++;
      if (res.count === 10 && firstBallFresh) stats.strikes++;
      updateTelemetry(r, res, leave, pocket);
      renderPracticeStats();
      if (res.count === 10 && firstBallFresh) { toast("STRIKE!", ""); SFX.cheer(); } else if (r.gutter) toast("Gutter", "spare", 900);
      // auto reset the rack after a moment; ball returns
      setTimeout(() => { if (mode === "practice") { standing = new Array(10).fill(true); pinAnim = new Array(10).fill(null); ballReturn(); } }, 1700);
    } else {
      advanceGame(res.count, leave);
    }
    busy = false;
  }

  function ballReturn() {
    const b = ballOf(bowler.ballId);
    ball.rest = true; ball.restLx = 0; ball.color = b.color; trail = []; draw();
    setGrab(true);
    if (net) net.send({ t: "grab", ball: b.id });
  }
  function setGrab(on) { setStatus(on ? "wait" : "on", on ? "grab your ball" : "rolling…"); }

  // ---------------------------------------------------------------- telemetry (practice)
  function updateTelemetry(r, res, leave, pocket) {
    const pins = r.gutter ? "Gutter" : (res.count === 10 ? "STRIKE" : (leave.length ? leave.join("-") : (res.count + " down")));
    const rows = [
      ["Ball speed", r.speedMph.toFixed(1) + " mph"],
      ["Rev rate", Math.round(r.revRate) + " rpm"],
      ["Launch", "board " + r.launchBoard],
      ["Break point", r.gutter ? "—" : ("board " + r.breakBoard + " @ " + r.breakFeet + "ft")],
      ["Entry board", r.gutter ? "gutter" : ("board " + r.entryBoard + (pocket ? " ✓ pocket" : ""))],
      ["Entry angle", r.gutter ? "—" : (r.entryAngle.toFixed(1) + "°")],
      ["Result", pins],
    ];
    $("#telemetry").innerHTML = rows.map(([k, v]) => `<div class="trow"><span class="tk">${k}</span><span class="tv ${k === 'Result' ? 'res' : ''}">${esc(v)}</span></div>`).join("");
  }
  function renderPracticeStats() {
    const s = stats; if (!s.shots) return;
    $("#pstats").innerHTML = [
      ["Shots", s.shots], ["Strikes", Math.round(s.strikes / s.shots * 100) + "%"],
      ["Pocket", Math.round(s.pocket / s.shots * 100) + "%"], ["Avg entry", (s.sumBoard / s.shots).toFixed(1) + " bd"],
      ["Avg angle", (s.sumAngle / s.shots).toFixed(1) + "°"], ["Avg speed", (s.sumMph / s.shots).toFixed(1) + " mph"],
    ].map(([k, v]) => `<div class="stat"><div class="sv">${v}</div><div class="sk">${k}</div></div>`).join("");
  }

  // ---------------------------------------------------------------- 10-frame scoring (game)
  function makePlayers(n) { players = []; for (let i = 0; i < n; i++) players.push({ name: "Player " + (i + 1), frames: Array.from({ length: 10 }, () => ({ rolls: [] })) }); }
  const standingCount = () => standing.filter(Boolean).length;
  function computeTotals(pl) {
    const flat = []; pl.frames.forEach((f) => f.rolls.forEach((r) => flat.push(r)));
    const totals = []; let idx = 0, sum = 0;
    for (let f = 0; f < 10; f++) { const r = pl.frames[f].rolls; if (!r.length) { totals.push(null); continue; }
      if (f < 9) { if (r[0] === 10) { if (flat[idx + 1] == null || flat[idx + 2] == null) { totals.push(null); idx++; continue; } sum += 10 + flat[idx + 1] + flat[idx + 2]; idx++; }
        else if (r[0] + (r[1] || 0) === 10 && r.length >= 2) { if (flat[idx + 2] == null) { totals.push(null); idx += 2; continue; } sum += 10 + flat[idx + 2]; idx += 2; }
        else { if (r.length < 2) { totals.push(null); idx += r.length; continue; } sum += r[0] + r[1]; idx += 2; } }
      else { sum += r.reduce((a, b) => a + b, 0); idx += r.length; }
      totals.push(sum); }
    return totals;
  }
  function advanceGame(knocked) {
    const fr = players[cur.p].frames[cur.f]; fr.rolls.push(knocked); renderBoard();
    const last = cur.f === 9;
    if (!last) { const strike = fr.rolls.length === 1 && fr.rolls[0] === 10; if (strike || fr.rolls.length === 2) nextTurn(); else readyTurn(); }
    else { const r = fr.rolls, n = r.length;
      if (n === 1) { if (r[0] === 10) standing = new Array(10).fill(true); readyTurn(); }
      else if (n === 2) { const bonus = r[0] === 10 || r[0] + r[1] === 10; if (bonus) { if (standingCount() === 0) standing = new Array(10).fill(true); readyTurn(); } else nextTurn(); }
      else nextTurn(); }
  }
  function nextTurn() { cur.p++; if (cur.p >= players.length) { cur.p = 0; cur.f++; } if (cur.f > 9) { endGame(); return; } standing = new Array(10).fill(true); readyTurn(); }
  function readyTurn() {
    const fr = players[cur.p].frames[cur.f];
    $("#whoUp").textContent = players[cur.p].name;
    $("#frameNo").textContent = "Frame " + (cur.f + 1) + " · Ball " + (fr.rolls.length + 1);
    pinAnim = new Array(10).fill(null); renderBoard(); ballReturn();
    if (net) net.send({ t: "turn", player: players[cur.p].name, frame: cur.f + 1, ball: fr.rolls.length + 1 });
  }
  function endGame() { gameOver = true; const ranked = players.map((p) => ({ name: p.name, score: (computeTotals(p).filter((x) => x != null).pop()) || 0 })).sort((a, b) => b.score - a.score); toast(ranked[0].name + " wins — " + ranked[0].score, "", 4000); SFX.cheer(); if (net) net.send({ t: "gameover", winner: ranked[0].name, score: ranked[0].score }); }
  function renderBoard() {
    const tb = $("#board"); if (!tb) return;
    let head = "<tr><th class='pname'>Bowler</th>"; for (let f = 1; f <= 10; f++) head += "<th>" + f + "</th>"; head += "</tr>";
    let rows = "";
    players.forEach((p, pi) => { const totals = computeTotals(p);
      rows += "<tr class='" + (pi === cur.p && !gameOver ? "active" : "") + "'><td class='pname'>" + esc(p.name) + "</td>";
      p.frames.forEach((fr, fi) => { rows += "<td class='frame'><span class='balls'>" + marks(fr.rolls, fi) + "</span><span class='total'>" + (totals[fi] != null ? totals[fi] : "") + "</span></td>"; });
      rows += "</tr>"; });
    tb.innerHTML = head + rows;
  }
  function marks(rolls, fi) {
    const c = (x, cls) => "<span class='" + (cls || "") + "'>" + x + "</span>";
    if (fi < 9) { if (rolls.length === 1 && rolls[0] === 10) return c("", "") + c("X", "x"); let o = ""; if (rolls.length >= 1) o += c(rolls[0] === 0 ? "-" : rolls[0]); if (rolls.length >= 2) o += c(rolls[0] + rolls[1] === 10 ? "/" : (rolls[1] === 0 ? "-" : rolls[1]), rolls[0] + rolls[1] === 10 ? "sp" : ""); return o; }
    let o = "", prev = 0; rolls.forEach((r, i) => { if (r === 10) o += c("X", "x"); else if (i > 0 && prev + r === 10 && prev !== 10) o += c("/", "sp"); else o += c(r === 0 ? "-" : r); prev = (prev === 10 || (i > 0 && prev + r === 10)) ? 0 : r; }); return o;
  }

  // ---------------------------------------------------------------- toast/status
  let tt; function toast(text, cls, ms) { const t = $("#toast"); t.textContent = text; t.className = "toast " + (cls || ""); requestAnimationFrame(() => t.classList.add("show")); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), ms || 1600); }
  function setStatus(dot, msg) { $("#laneDot").className = "dot " + dot; $("#laneMsg").textContent = msg; }

  // ---------------------------------------------------------------- phone msgs
  function onPhoneMessage(d) {
    if (!d || typeof d !== "object") return;
    if (d.t === "hello") { setStatus("on", "phone connected"); if (net) net.send({ t: "config", mode, oil: oilId }); }
    else if (d.t === "settings") { bowler = { ballId: d.ballId || bowler.ballId, hand: d.hand || bowler.hand }; showBowler(); }
    else if (d.t === "shot") throwShot(d);
  }
  function showBowler() { const b = ballOf(bowler.ballId); $("#ballName").textContent = b.name; $("#ballName").style.color = b.color; $("#handName").textContent = bowler.hand > 0 ? "RH" : "LH"; }

  // ---------------------------------------------------------------- start lane
  function startLane() {
    show("lane"); resize();
    $("#modeTag").textContent = mode === "practice" ? "Practice" : "Game";
    $("#oilTag").textContent = SB.OILS[oilId].name;
    $("#practicePanel").hidden = mode !== "practice";
    $("#boardWrap").hidden = mode !== "game";
    $("#whoUp").hidden = mode !== "game";
    $("#frameNo").hidden = mode !== "game";
    setStatus(local ? "wait" : "on", local ? "local practice" : "phone connected");
    showBowler();
    standing = new Array(10).fill(true); pinAnim = new Array(10).fill(null); gameOver = false; busy = false;
    if (mode === "practice") { resetStats(); $("#telemetry").innerHTML = emptyTelemetry(); $("#pstats").innerHTML = ""; }
    else { makePlayers(playerCount); cur = { p: 0, f: 0 }; }
    requestAnimationFrame(() => { resize(); if (mode === "game") readyTurn(); else ballReturn(); draw(); });
    if (local) enableLocal();
  }
  function emptyTelemetry() { return ["Ball speed", "Rev rate", "Launch", "Break point", "Entry board", "Entry angle", "Result"].map((k) => `<div class="trow"><span class="tk">${k}</span><span class="tv">—</span></div>`).join(""); }

  // local practice (no phone): click lane to set launch board, drag up to swing
  function enableLocal() {
    let s = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); const c = e.touches ? e.touches[0] : e; return { x: (c.clientX - r.left) / r.width, y: (c.clientY - r.top) / r.height, t: performance.now() }; };
    cv.addEventListener("pointerdown", (e) => { s = pt(e); });
    cv.addEventListener("pointerup", (e) => { if (!s || busy) { s = null; return; } const p = pt(e); const dt = (p.t - s.t) / 1000 || .3; const dy = s.y - p.y; const launchBoard = Math.round(clamp(20 - (s.x - .5) * 2 * 19, 2, 38)); const speedMph = clamp((dy / dt) * 6 + 13, 12, 20); const revRate = clamp(220 + (p.x - s.x) * 900, 60, 520); throwShot({ ballId: bowler.ballId, hand: bowler.hand, launchBoard, launchAngle: (p.x - s.x) * 4, speedMph, revRate }); s = null; });
  }

  // ---------------------------------------------------------------- demo (#demo screenshots/smoke)
  if (/demo/.test(location.hash)) {
    mode = "practice"; oilId = "house"; local = true; startLane();
    setTimeout(() => { bowler = { ballId: "solid", hand: 1 }; showBowler(); throwShot({ ballId: "solid", hand: 1, launchBoard: 14, launchAngle: 0, speedMph: 16, revRate: 350 }); }, 300);
  }

  resize();
})();
