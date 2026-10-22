/* StrikeCast TV — shot pipeline (balls.js physics) → 3D lane (render3d.js), practice + game modes. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const SB = window.StrikeBowl, A3D = window.Arena3D;
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
  let bowler = { ballId: "solid", hand: 1 };
  const ballOf = (id) => SB.BALLS.find((b) => b.id === id) || SB.BALLS[3];
  let stats = null;
  const resetStats = () => (stats = { shots: 0, strikes: 0, spares: 0, pocket: 0, sumBoard: 0, sumAngle: 0, sumMph: 0, sumRev: 0 });
  let players = [], cur = { p: 0, f: 0 }, standing = new Array(10).fill(true), gameOver = false, busy = false;
  let streak = 0;   // strikes in a row — a double, then a turkey, then you're bagging them

  // the call a bowler actually makes, by how hot you are
  function strikeCall() {
    streak++;
    if (streak === 1) return "FLUSH IN THE POCKET";
    if (streak === 2) return "DOUBLE";
    if (streak === 3) return "TURKEY 🦃";
    if (streak === 4) return "FOUR-BAGGER";
    if (streak === 5) return "FIVE-BAGGER";
    if (streak >= 6) return streak + " IN A ROW — WHO IS THIS";
    return "STRIKE";
  }

  // ---------------------------------------------------------------- home / options UI
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; SFX.resume(); openOptions(); }));
  function openOptions() { $("#optMode").textContent = mode === "practice" ? "Practice" : "Game"; $("#gameOpts").hidden = mode !== "game"; show("opt"); }
  document.querySelectorAll("#oilPick [data-oil]").forEach((b) => b.addEventListener("click", () => { oilId = b.dataset.oil; syncPills("#oilPick", b); }));
  document.querySelectorAll("#countPick [data-n]").forEach((b) => b.addEventListener("click", () => { playerCount = +b.dataset.n; syncPills("#countPick", b); }));
  function syncPills(sel, el) { document.querySelectorAll(sel + " button").forEach((x) => x.classList.toggle("sel", x === el)); }
  $("#optBack") && $("#optBack").addEventListener("click", () => show("home"));
  $("#optGo") && $("#optGo").addEventListener("click", () => { SFX.resume(); openLane(); });

  // ---------------------------------------------------------------- pairing
  function openLane() {
    show("pair");
    const joinBase = location.origin + "/bowl/play.html";
    net = window.StrikeNet ? window.StrikeNet.host() : null;
    if (!net) { startLane(); return; }
    net.on("code", (code) => {
      $("#codeOut").textContent = code; $("#joinHost").textContent = joinBase.replace(/^https?:\/\//, "");
      const camHost = $("#camHost"); if (camHost) camHost.textContent = (location.origin + "/bowl/camera").replace(/^https?:\/\//, "");
      $("#qr").innerHTML = ""; try { new QRCode($("#qr"), { text: joinBase + "#" + code, width: 168, height: 168, colorDark: "#0a0c12", colorLight: "#fff", correctLevel: QRCode.CorrectLevel.M }); } catch (_) {}
      $("#pairDot").className = "dot wait"; $("#pairMsg").textContent = "Grab your phone — that's the ball";
    });
    net.on("paired", () => { net.send({ t: "hello", role: "tv", mode: mode, oil: oilId }); startLane(); });
    net.on("message", onPhoneMessage);
    net.on("dropped", () => setStatus("off", "lost the phone"));
    net.on("error", () => { $("#pairDot").className = "dot off"; $("#pairMsg").textContent = "Couldn't reach the lane. Throw solo instead?"; });
  }
  $("#backHome2") && $("#backHome2").addEventListener("click", () => { if (net) net.destroy(); net = null; show("opt"); });
  $("#skipPair") && $("#skipPair").addEventListener("click", () => { local = true; if (net) net.destroy(); startLane(); });

  // ---------------------------------------------------------------- 3D lane glue + shot pipeline
  let laneReady = false;
  function initLane() { if (!laneReady) { A3D.init($("#lane3d")); laneReady = true; } A3D.resetRack(); }
  function refreshRack() { if (standing.every(Boolean)) A3D.resetRack(); else A3D.setStanding(standing); }

  let lastResult = null;
  function throwShot(input) {
    if (busy) return; busy = true;
    const b = ballOf(input.ballId || bowler.ballId);
    bowler = { ballId: b.id, hand: input.hand || bowler.hand };
    const r = SB.simulate({ hand: input.hand || 1, speedMph: input.speedMph, revRate: input.revRate, launchBoard: input.launchBoard, launchAngle: input.launchAngle || 0 }, b, SB.OILS[oilId]);
    lastResult = r;
    const dur = 2.7 - (input.speedMph - 12) / 8 * 1.1;
    setGrab(false); SFX.roll(dur);
    A3D.rollBall(r.path, b.color, dur, onArrive);
    if (net) net.send({ t: "rolling" });
  }

  function onArrive() {
    const r = lastResult;
    const res = SB.carry(r, standing.slice());
    res.fell.forEach((f, i) => { if (f && standing[i]) standing[i] = false; });
    A3D.tumble(res.fell, r.entryLx || 0);
    if (res.count) SFX.crash(res.count);
    const leave = standing.map((s, i) => s ? i + 1 : null).filter((x) => x);
    setTimeout(() => finishShot(r, res, leave), 1300);
  }

  function finishShot(r, res, leave) {
    if (mode === "practice") {
      stats.shots++; stats.sumBoard += r.entryBoard; stats.sumAngle += r.entryAngle; stats.sumMph += r.speedMph; stats.sumRev += r.revRate;
      const firstBallFresh = leave.length + res.count === 10;
      const pocket = Math.abs(r.entryBoard - (r.hand > 0 ? 18 : 22)) <= 2 && !r.gutter;
      if (pocket) stats.pocket++;
      if (res.count === 10 && firstBallFresh) stats.strikes++;
      updateTelemetry(r, res, leave, pocket); renderPracticeStats();
      if (res.count === 10 && firstBallFresh) { toast(strikeCall(), ""); SFX.cheer(); A3D.cheer(); }
      else { streak = 0; if (r.gutter) toast("Straight in the ditch", "spare", 1100); }
      setTimeout(() => { if (mode === "practice") { standing = new Array(10).fill(true); ballReturn(); } }, 1800);
    } else advanceGame(res.count, leave);
    busy = false;
  }

  // ball return + grab-your-ball
  function ballReturn() {
    refreshRack();
    const b = ballOf(bowler.ballId);
    A3D.deliverBall(b.color, () => {});           // roll a fresh ball up the return to the foul line
    setGrab(true);
    if (net) net.send({ t: "grab", ball: b.id });
  }
  function setGrab(on) { setStatus(on ? "wait" : "on", on ? "grab your ball" : "rolling…"); }

  // ---------------------------------------------------------------- telemetry (practice)
  // style bands + a coach cue, grounded in docs/bowling-swing-mechanics.md §3/§6
  function coach(speed, rev) {
    const ratio = rev / Math.max(1, speed);
    const style = rev < 200 ? "Soft roll" : rev < 300 ? "Stroker" : rev < 400 ? "Tweener" : "Cranker";
    let cue;
    if (rev < 200) cue = "Lift up through the ball — flick your fingers at the bottom for more revs.";
    else if (ratio > 25) cue = "Rev-dominant — a touch more speed would match your hook.";
    else if (ratio < 20) cue = "Speed-dominant — ease off a hair or add lift for more hook.";
    else cue = "Balanced release — speed and revs are matched. Stay with it.";
    return { style, cue };
  }
  function updateTelemetry(r, res, leave, pocket) {
    const pins = r.gutter ? "In the ditch" : (res.count === 10 ? "Flush — all ten" : (leave.length ? "left the " + leave.join("-") : (res.count + " down")));
    const c = coach(r.speedMph, r.revRate);
    const rows = [["Ball speed", r.speedMph.toFixed(1) + " mph"], ["Rev rate", Math.round(r.revRate) + " rpm"], ["Style", r.gutter ? "—" : c.style], ["Launch", "board " + r.launchBoard],
      ["Break point", r.gutter ? "—" : ("board " + r.breakBoard + " @ " + r.breakFeet + "ft")], ["Entry board", r.gutter ? "gutter" : ("board " + r.entryBoard + (pocket ? " ✓ pocket" : ""))],
      ["Entry angle", r.gutter ? "—" : (r.entryAngle.toFixed(1) + "°")], ["Result", pins]];
    $("#telemetry").innerHTML = rows.map(([k, v]) => `<div class="trow"><span class="tk">${k}</span><span class="tv ${k === 'Result' ? 'res' : ''}">${esc(v)}</span></div>`).join("")
      + (r.gutter ? "" : `<div class="coach">${esc(c.cue)}</div>`);
  }
  function renderPracticeStats() {
    const s = stats; if (!s.shots) return;
    $("#pstats").innerHTML = [["Shots", s.shots], ["Strikes", Math.round(s.strikes / s.shots * 100) + "%"], ["Pocket", Math.round(s.pocket / s.shots * 100) + "%"],
      ["Avg entry", (s.sumBoard / s.shots).toFixed(1) + " bd"], ["Avg angle", (s.sumAngle / s.shots).toFixed(1) + "°"], ["Avg speed", (s.sumMph / s.shots).toFixed(1) + " mph"]]
      .map(([k, v]) => `<div class="stat"><div class="sv">${v}</div><div class="sk">${k}</div></div>`).join("");
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
    const rr = fr.rolls, rn = rr.length;
    if (knocked === 10 && (rn === 1 || cur.f === 9)) { toast(strikeCall(), ""); SFX.cheer(); A3D.cheer(); }
    else if (rn >= 2 && rr[rn - 2] + rr[rn - 1] === 10 && rr[rn - 2] !== 10) { streak = 0; toast("Picked it clean", "spare"); SFX.cheer(); A3D.cheer(); }
    else if (knocked !== 10) streak = 0;
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
    renderBoard(); ballReturn();
    if (net) net.send({ t: "turn", player: players[cur.p].name, frame: cur.f + 1, ball: fr.rolls.length + 1 });
  }
  function endGame() { gameOver = true; const ranked = players.map((p) => ({ name: p.name, score: (computeTotals(p).filter((x) => x != null).pop()) || 0 })).sort((a, b) => b.score - a.score); toast(ranked[0].name + " takes the house — " + ranked[0].score, "", 4000); SFX.cheer(); A3D.cheer(); if (net) net.send({ t: "gameover", winner: ranked[0].name, score: ranked[0].score }); }
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
    if (d.t === "hello") { setStatus("on", "phone's on — wind up"); if (net) net.send({ t: "config", mode, oil: oilId }); }
    else if (d.t === "settings") { bowler = { ballId: d.ballId || bowler.ballId, hand: d.hand || bowler.hand }; showBowler(); }
    else if (d.t === "stance") { if (!busy) A3D.aimBall((20 - d.board) / 19); }
    else if (d.t === "shot") throwShot(d);
  }
  function showBowler() { const b = ballOf(bowler.ballId); $("#ballName").textContent = b.name; $("#ballName").style.color = b.color; $("#handName").textContent = bowler.hand > 0 ? "RH" : "LH"; }

  // ---------------------------------------------------------------- start lane
  function startLane() {
    show("lane");
    $("#modeTag").textContent = mode === "practice" ? "Practice" : "Game";
    $("#oilTag").textContent = SB.OILS[oilId].name;
    $("#practicePanel").hidden = mode !== "practice";
    $("#boardWrap").hidden = mode !== "game";
    $("#whoUp").hidden = mode !== "game";
    $("#frameNo").hidden = mode !== "game";
    setStatus(local ? "wait" : "on", local ? "throwing solo" : "phone's on — wind up");
    showBowler();
    standing = new Array(10).fill(true); gameOver = false; busy = false;
    if (mode === "practice") { resetStats(); $("#telemetry").innerHTML = emptyTelemetry(); $("#pstats").innerHTML = ""; }
    else { makePlayers(playerCount); cur = { p: 0, f: 0 }; }
    requestAnimationFrame(() => { initLane(); A3D.resize(); if (mode === "game") readyTurn(); else ballReturn(); });
    if (local) enableLocal();
  }
  function emptyTelemetry() { return ["Ball speed", "Rev rate", "Launch", "Break point", "Entry board", "Entry angle", "Result"].map((k) => `<div class="trow"><span class="tk">${k}</span><span class="tv">—</span></div>`).join(""); }

  // local practice (no phone): drag on the lane — start x = board, drag up = speed, drag sideways = revs
  let localBound = false;
  function enableLocal() {
    if (localBound) return; localBound = true;
    const el = $("#lane3d"); let s = null;
    const pt = (e) => { const r = el.getBoundingClientRect(); const c = e.touches ? e.touches[0] : e; return { x: (c.clientX - r.left) / r.width, y: (c.clientY - r.top) / r.height, t: performance.now() }; };
    el.addEventListener("pointerdown", (e) => { s = pt(e); });
    el.addEventListener("pointerup", (e) => { if (!s || busy) { s = null; return; } const p = pt(e); const dt = (p.t - s.t) / 1000 || .3; const dy = s.y - p.y; const launchBoard = Math.round(clamp(20 - (s.x - .5) * 2 * 19, 2, 38)); const speedMph = clamp((dy / dt) * 6 + 13, 12, 20); const revRate = clamp(260 + (p.x - s.x) * 1100, 60, 540); throwShot({ ballId: bowler.ballId, hand: bowler.hand, launchBoard, launchAngle: (p.x - s.x) * 4, speedMph, revRate }); s = null; });
  }

  // ---------------------------------------------------------------- demo (#demo smoke/screenshot)
  if (/demo/.test(location.hash)) {
    mode = "practice"; oilId = "house"; local = true; startLane();
    setTimeout(() => { bowler = { ballId: "solid", hand: 1 }; showBowler(); throwShot({ ballId: "solid", hand: 1, launchBoard: 14, launchAngle: 0, speedMph: 16, revRate: 350 }); }, 900);
  }
})();
