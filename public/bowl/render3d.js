/*
 * StrikeCast — 3D lane renderer (Three.js). View layer only: it draws whatever
 * the physics engine (balls.js) produces. rollBall() animates along a simulated
 * path; tumble() topples the pins carry() chose. Camera goes low behind the ball
 * (ball big in frame), follows it down, then cuts to a pin-cam on impact.
 */
(function (global) {
  const T = global.THREE;
  const LANE_LEN = 60, LANE_HW = 2.1, BR = 0.46, GUT = 0.5;
  const PINSCALE = 1.5, PINROW = 1.05;
  const lerp = (a, b, t) => a + (b - a) * t;
  const PINS = [
    { x: 0.00, y: 0 }, { x: -0.17, y: 1 }, { x: 0.17, y: 1 },
    { x: -0.34, y: 2 }, { x: 0.00, y: 2 }, { x: 0.34, y: 2 },
    { x: -0.51, y: 3 }, { x: -0.17, y: 3 }, { x: 0.17, y: 3 }, { x: 0.51, y: 3 },
  ];

  let renderer, scene, cam, ball, pins = [], pinAnim = [], laneMat, raf = 0, lastT = 0;
  let camMode = "ready", camTarget = new T.Vector3(), rollState = null, deliverState = null, returnBall = null;
  let crowd = null;

  // ---- lane texture (wood + boards + arrows + foul line + oil sheen) ----
  function laneTexture() {
    const c = document.createElement("canvas"); c.width = 256; c.height = 2048; const x = c.getContext("2d");
    const grd = x.createLinearGradient(0, 0, 0, c.height); grd.addColorStop(0, "#e7b265"); grd.addColorStop(1, "#c6893f");
    x.fillStyle = grd; x.fillRect(0, 0, c.width, c.height);
    // boards
    x.strokeStyle = "rgba(120,78,30,.35)"; x.lineWidth = 1;
    for (let i = 1; i < 39; i++) { const px = i / 39 * c.width; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, c.height); x.stroke(); }
    // subtle grain
    x.strokeStyle = "rgba(150,100,45,.10)";
    for (let i = 0; i < 260; i++) { const px = Math.random() * c.width, len = 40 + Math.random() * 120, py = Math.random() * c.height; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py + len); x.stroke(); }
    // oil sheen (top ~60% nearer the foul line = bottom of texture)
    const og = x.createLinearGradient(0, c.height, 0, c.height * 0.4); og.addColorStop(0, "rgba(90,150,210,.12)"); og.addColorStop(1, "rgba(90,150,210,0)");
    x.fillStyle = og; x.fillRect(0, c.height * 0.4, c.width, c.height * 0.6);
    // arrows (~15ft from foul => 25% up from bottom)
    const ay = c.height * 0.76; x.fillStyle = "rgba(95,60,22,.8)";
    [-.53, -.26, 0, .26, .53].forEach((b) => { const ax = (0.5 - b * 0.5) * c.width; x.beginPath(); x.moveTo(ax, ay - 22); x.lineTo(ax - 10, ay); x.lineTo(ax + 10, ay); x.closePath(); x.fill(); });
    // foul line (bottom)
    x.fillStyle = "#b23a1a"; x.fillRect(0, c.height - 8, c.width, 8);
    const tex = new T.CanvasTexture(c); tex.anisotropy = 4; tex.colorSpace = T.SRGBColorSpace; return tex;
  }

  function pinGeom() {
    const pts = [[0.02, 0], [0.19, 0.02], [0.2, 0.12], [0.17, 0.32], [0.1, 0.52], [0.064, 0.64], [0.086, 0.74], [0.11, 0.83], [0.098, 0.96], [0.055, 1.06], [0.03, 1.12]]
      .map((p) => new T.Vector2(p[0] * PINSCALE, p[1] * PINSCALE));
    return new T.LatheGeometry(pts, 24);
  }

  function makePin() {
    const grp = new T.Group();
    const body = new T.Mesh(pinGeom(), new T.MeshStandardMaterial({ color: 0xf6f1e7, roughness: 0.5, metalness: 0.05 }));
    body.castShadow = true; grp.add(body);
    const ring = new T.Mesh(new T.CylinderGeometry(0.17 * PINSCALE, 0.17 * PINSCALE, 0.07 * PINSCALE, 24, 1, true), new T.MeshStandardMaterial({ color: 0xff5a2c, roughness: 0.5 }));
    ring.position.y = 0.78 * PINSCALE; grp.add(ring);
    return grp;
  }

  // ---- the alley around the lane (other lanes, pin housing, ceiling, crowd) ----
  const LANE_PITCH = LANE_HW * 2 + GUT * 2 + 0.3;
  function maskingUnit(emissive) {
    const m = new T.Mesh(new T.BoxGeometry(LANE_HW * 2 + GUT, 3.2, 0.5), new T.MeshStandardMaterial({ color: 0x1b2742, emissive: emissive || 0x0a1024, emissiveIntensity: 0.6, roughness: 0.6 }));
    m.position.set(0, 3.4, -LANE_LEN - 4.8); return m;
  }
  function sideLane(offset) {
    const g = new T.Group(); g.position.x = offset;
    const l = new T.Mesh(new T.BoxGeometry(LANE_HW * 2, 0.3, LANE_LEN + 8), new T.MeshStandardMaterial({ map: laneMat.map, roughness: 0.4, metalness: 0.1 }));
    l.position.set(0, -0.15, -LANE_LEN / 2 + 1); l.receiveShadow = true; g.add(l);
    [-1, 1].forEach((s) => { const gg = new T.Mesh(new T.BoxGeometry(GUT, 0.5, LANE_LEN + 8), new T.MeshStandardMaterial({ color: 0x05070c })); gg.position.set(s * (LANE_HW + GUT / 2), -0.35, -LANE_LEN / 2 + 1); g.add(gg); });
    for (let i = 0; i < 10; i++) { const pin = makePin(); pin.position.set(PINS[i].x * LANE_HW, 0, -LANE_LEN - PINS[i].y * PINROW); g.add(pin); }
    g.add(maskingUnit(0x0a1024));
    return g;
  }
  const SKIN = [0x8d5a3c, 0x6b4226, 0xc69a74, 0x9c6b4a, 0x5a3a24, 0xe0b48f, 0x7a4e30, 0xb07c54];
  const CLOTH = [0x9a3b3b, 0x2f5fae, 0x2f8a55, 0xb8863a, 0x6a3a8a, 0x3a4a6a, 0xb04a6a, 0x3a7a8a, 0xa5a5a5, 0xd0732a];
  const HAIR = [0x15100c, 0x241a12, 0x0a0a0a, 0x3a2a1a, 0x4a3520, 0x20232a];
  const pick = (a) => a[(Math.random() * a.length) | 0];
  // a single low-poly seated person (shoulders, head, hair) — used for the judges
  function seatedPerson(cloth, skin, hair) {
    const g = new T.Group();
    const t = new T.Mesh(new T.CylinderGeometry(0.27, 0.2, 0.62, 10), new T.MeshStandardMaterial({ color: cloth, roughness: 0.8 })); t.position.y = 0.55; t.castShadow = true; g.add(t);
    const sh = new T.Mesh(new T.SphereGeometry(0.27, 10, 8), new T.MeshStandardMaterial({ color: cloth, roughness: 0.8 })); sh.position.y = 0.82; sh.scale.set(1, 0.5, 0.8); g.add(sh);
    const h = new T.Mesh(new T.SphereGeometry(0.17, 12, 10), new T.MeshStandardMaterial({ color: skin, roughness: 0.75 })); h.position.y = 1.02; g.add(h);
    const hr = new T.Mesh(new T.SphereGeometry(0.185, 12, 8), new T.MeshStandardMaterial({ color: hair, roughness: 0.95 })); hr.position.y = 1.07; hr.scale.y = 0.72; g.add(hr);
    return g;
  }
  function textTexture(txt) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128; const x = c.getContext("2d");
    x.fillStyle = "rgba(0,0,0,0)"; x.fillRect(0, 0, 512, 128);
    x.font = "bold 86px Anton, Arial Narrow, sans-serif"; x.fillStyle = "#32e0cf"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(txt, 256, 70); const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; return tex;
  }
  // instanced crowd (torso + head + hair), seated in tiers both sides, with a living bob
  function buildCrowd() {
    const seats = [];
    for (const side of [-1, 1]) for (let row = 0; row < 5; row++) for (let seat = 0; seat < 13; seat++) {
      if (Math.random() < 0.08) continue;                        // a few empty seats
      seats.push({ x: side * (8.2 + row * 1.2) + (Math.random() - .5) * .35, y: 0.55 + row * 0.8, z: 10 - seat * 1.5 + (Math.random() - .5) * .35, rot: (side > 0 ? -1.35 : 1.35) + (Math.random() - .5) * .4, s: 1.0 + Math.random() * 0.35, phase: Math.random() * 7 });
    }
    const N = seats.length;
    const torso = new T.InstancedMesh(new T.CylinderGeometry(0.27, 0.2, 0.62, 8), new T.MeshStandardMaterial({ roughness: 0.82 }), N);
    const head = new T.InstancedMesh(new T.SphereGeometry(0.17, 10, 8), new T.MeshStandardMaterial({ roughness: 0.75 }), N);
    const hair = new T.InstancedMesh(new T.SphereGeometry(0.185, 10, 7), new T.MeshStandardMaterial({ roughness: 0.95 }), N);
    torso.castShadow = true;
    seats.forEach((d, i) => { torso.setColorAt(i, new T.Color(pick(CLOTH))); head.setColorAt(i, new T.Color(pick(SKIN))); hair.setColorAt(i, new T.Color(pick(HAIR))); });
    crowd = { torso, head, hair, data: seats, excite: 0, d3: new T.Object3D() };
    updateCrowd(0);
    scene.add(torso, head, hair);
    // benches
    for (const side of [-1, 1]) for (let row = 0; row < 5; row++) { const p = new T.Mesh(new T.BoxGeometry(2.6, 0.5, 21), new T.MeshStandardMaterial({ color: 0x12151d, roughness: 0.9 })); p.position.set(side * (8.2 + row * 1.2), row * 0.8, 1); scene.add(p); }
  }
  function updateCrowd(t) {
    if (!crowd) return; const d3 = crowd.d3;
    crowd.data.forEach((d, i) => {
      const bob = Math.sin(t * 2.2 + d.phase) * (0.02 + crowd.excite * 0.45);
      d3.position.set(d.x, d.y + bob, d.z); d3.rotation.set(0, d.rot, 0); d3.scale.setScalar(d.s); d3.updateMatrix(); crowd.torso.setMatrixAt(i, d3.matrix);
      d3.position.y += d.s * 0.52; d3.updateMatrix(); crowd.head.setMatrixAt(i, d3.matrix);
      d3.position.y += d.s * 0.1; d3.updateMatrix(); crowd.hair.setMatrixAt(i, d3.matrix);
    });
    crowd.torso.instanceMatrix.needsUpdate = crowd.head.instanceMatrix.needsUpdate = crowd.hair.instanceMatrix.needsUpdate = true;
    if (crowd.excite > 0) crowd.excite = Math.max(0, crowd.excite - 0.012);
  }
  function cheer() { if (crowd) crowd.excite = 1; }
  // a scorer's / judges' table off to the side of the approach
  function buildJudges() {
    const g = new T.Group(); g.position.set(-5.4, 0, 4.2); g.rotation.y = 1.15;
    const top = new T.Mesh(new T.BoxGeometry(3.6, 0.12, 1.15), new T.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.5, metalness: 0.1 })); top.position.y = 0.98; top.castShadow = true; g.add(top);
    const skirt = new T.Mesh(new T.BoxGeometry(3.6, 0.92, 0.06), new T.MeshStandardMaterial({ color: 0x1b2740, emissive: 0x0a1430, emissiveIntensity: 0.4, roughness: 0.6 })); skirt.position.set(0, 0.5, 0.56); g.add(skirt);
    const sign = new T.Mesh(new T.PlaneGeometry(1.9, 0.48), new T.MeshBasicMaterial({ map: textTexture("JUDGES"), transparent: true })); sign.position.set(0, 0.6, 0.58); g.add(sign);
    for (const jx of [-1.0, 0, 1.0]) { const j = seatedPerson(pick(CLOTH), pick(SKIN), pick(HAIR)); j.position.set(jx, 0.05, -0.5); j.scale.setScalar(1.15); g.add(j); }
    for (const mx of [-0.8, 0.8]) { const mon = new T.Mesh(new T.BoxGeometry(0.72, 0.44, 0.05), new T.MeshStandardMaterial({ color: 0x0a0e18, emissive: 0x123a52, emissiveIntensity: 0.7, roughness: 0.3 })); mon.position.set(mx, 1.28, 0.0); mon.rotation.x = -0.22; g.add(mon); }
    scene.add(g);
  }
  function buildEnv() {
    // concourse / settee floor
    const floor = new T.Mesh(new T.BoxGeometry(70, 0.2, 34), new T.MeshStandardMaterial({ color: 0x12151d, roughness: 0.95 }));
    floor.position.set(0, -0.55, 8); floor.receiveShadow = true; scene.add(floor);
    // approach wood behind the foul line
    const appr = new T.Mesh(new T.BoxGeometry(LANE_HW * 2 + GUT * 2, 0.26, 9), new T.MeshStandardMaterial({ color: 0x6e4a24, roughness: 0.6 }));
    appr.position.set(0, -0.13, 5.5); scene.add(appr);
    // adjacent lanes
    [-2, -1, 1, 2].forEach((o) => scene.add(sideLane(o * LANE_PITCH)));
    // this lane's masking unit (brighter)
    scene.add(maskingUnit(0x2a0f04));
    // ceiling + light strips
    const ceil = new T.Mesh(new T.BoxGeometry(70, 0.3, LANE_LEN + 50), new T.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.95 }));
    ceil.position.set(0, 9.2, -LANE_LEN / 2 + 5); scene.add(ceil);
    for (let z = 2; z > -LANE_LEN; z -= 11) { const strip = new T.Mesh(new T.BoxGeometry(58, 0.1, 1.3), new T.MeshBasicMaterial({ color: 0x2c3a58 })); strip.position.set(0, 9.0, z); scene.add(strip); }
    // side walls
    [-1, 1].forEach((s) => { const w = new T.Mesh(new T.BoxGeometry(0.5, 11, LANE_LEN + 50), new T.MeshStandardMaterial({ color: 0x0f1219, roughness: 0.95 })); w.position.set(s * 24, 4.5, -LANE_LEN / 2 + 5); scene.add(w); });
    // back wall behind the gallery
    const back = new T.Mesh(new T.BoxGeometry(70, 11, 0.5), new T.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.95 })); back.position.set(0, 4.5, 16); scene.add(back);
    buildCrowd();
    buildJudges();
  }

  function init(container) {
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    scene = new T.Scene(); scene.background = new T.Color(0x06080d); scene.fog = new T.Fog(0x06080d, 40, 95);
    cam = new T.PerspectiveCamera(55, 1, 0.1, 200);

    scene.add(new T.AmbientLight(0x9fb0d0, 0.72));
    const key = new T.DirectionalLight(0xfff0e0, 1.15); key.position.set(4, 16, 10); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 6; key.shadow.camera.bottom = -70; key.shadow.camera.far = 120;
    scene.add(key);
    const fill = new T.DirectionalLight(0xbfd0ff, 0.35); fill.position.set(-6, 8, 6); scene.add(fill);
    const p1 = new T.PointLight(0xff5a2c, 34, 46); p1.position.set(-9, 7, -16); scene.add(p1);
    const p2 = new T.PointLight(0x32e0cf, 32, 55); p2.position.set(9, 7, -44); scene.add(p2);

    // lane
    laneMat = new T.MeshStandardMaterial({ map: laneTexture(), roughness: 0.35, metalness: 0.15 });
    const lane = new T.Mesh(new T.BoxGeometry(LANE_HW * 2, 0.3, LANE_LEN + 8), laneMat);
    lane.position.set(0, -0.15, -LANE_LEN / 2 + 1); lane.receiveShadow = true; scene.add(lane);
    // gutters
    const gm = new T.MeshStandardMaterial({ color: 0x05070c, roughness: 0.8 });
    [-1, 1].forEach((s) => { const g = new T.Mesh(new T.BoxGeometry(GUT, 0.5, LANE_LEN + 8), gm); g.position.set(s * (LANE_HW + GUT / 2), -0.35, -LANE_LEN / 2 + 1); scene.add(g); });
    // pin deck + back wall
    const deck = new T.Mesh(new T.BoxGeometry(LANE_HW * 2 + GUT * 2, 0.3, 6), new T.MeshStandardMaterial({ color: 0x14202e, roughness: 0.6 }));
    deck.position.set(0, -0.15, -LANE_LEN - 2.5); deck.receiveShadow = true; scene.add(deck);
    const wall = new T.Mesh(new T.BoxGeometry(LANE_HW * 2 + GUT * 2, 7, 0.4), new T.MeshStandardMaterial({ color: 0x0b1017, roughness: 0.9 }));
    wall.position.set(0, 3, -LANE_LEN - 5); scene.add(wall);

    // ball
    ball = new T.Mesh(new T.SphereGeometry(BR, 40, 40), new T.MeshStandardMaterial({ color: 0xd63c12, roughness: 0.22, metalness: 0.35 }));
    ball.castShadow = true; ball.position.set(0, BR, 0); scene.add(ball);
    // finger holes (3 small dark discs)
    const holeMat = new T.MeshStandardMaterial({ color: 0x05060a, roughness: 0.9 });
    const holes = new T.Group();
    [[-0.1, 0.14], [0.1, 0.14], [0, -0.02]].forEach(([hx, hy]) => { const h = new T.Mesh(new T.CircleGeometry(0.055, 16), holeMat); h.position.set(hx, hy, BR - 0.001); holes.add(h); });
    ball.add(holes);

    // pins
    for (let i = 0; i < 10; i++) { const pin = makePin(); scene.add(pin); pins.push(pin); }
    resetRack();

    // ball return rack (right side, near foul line)
    const rack = new T.Group();
    const rm = new T.MeshStandardMaterial({ color: 0x171b26, roughness: 0.5, metalness: 0.4 });
    const base = new T.Mesh(new T.BoxGeometry(1.1, 0.5, 1.6), rm); base.position.set(0, 0.25, 0); rack.add(base);
    returnBall = new T.Mesh(new T.SphereGeometry(BR * 0.9, 24, 24), new T.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.3, metalness: 0.4 }));
    returnBall.position.set(0, 0.65, 0.2); rack.add(returnBall);
    rack.position.set(LANE_HW + GUT + 0.9, 0, 1.8); scene.add(rack);

    buildEnv();
    camSet("establish", 0, true);
    resize();
    global.addEventListener("resize", resize);
    loop();
  }

  function resetRack() {
    pinAnim = pins.map(() => null);
    pins.forEach((pin, i) => { pin.visible = true; pin.position.set(PINS[i].x * LANE_HW, 0, -LANE_LEN - PINS[i].y * PINROW); pin.rotation.set(0, 0, 0); });
  }
  function setStanding(standing) { pins.forEach((pin, i) => { if (!standing[i] && !pinAnim[i]) pin.visible = false; }); }

  function placeBall(lx, hex) {
    ball.material.color.set(hex || 0xd63c12);
    ball.position.set((lx || 0) * LANE_HW, BR, 0.2); ball.rotation.set(0, 0, 0);
    camSet("ready", 0, true);
  }

  // camera presets
  function camSet(mode, lx, snap) {
    camMode = mode;
    let pos, look;
    if (mode === "ready") { pos = new T.Vector3((lx || 0) * LANE_HW * 0.6, 1.6, 6.0); look = new T.Vector3(0, 0.7, -18); }
    else if (mode === "establish") { pos = new T.Vector3(0, 5.2, 12.5); look = new T.Vector3(0, 1.4, -22); }   // wide: shows the alley + crowd
    else if (mode === "pins") { pos = new T.Vector3(0, 2.4, -LANE_LEN + 7); look = new T.Vector3(0, 0.6, -LANE_LEN - 1); }
    else { pos = new T.Vector3(0, 1.6, 6.0); look = new T.Vector3(0, 0.7, -18); }
    camTarget.copy(pos); cam.userData.look = look;
    if (snap) { cam.position.copy(pos); cam.lookAt(look); }
  }

  function rollBall(path, hex, durSec, onArrive) {
    ball.material.color.set(hex || 0xd63c12);
    const pts = path.map((p) => ({ x: p.lx * LANE_HW, z: -p.ly * LANE_LEN }));
    rollState = { pts, t: 0, dur: durSec || 2.2, onArrive, lastX: pts[0].x, lastZ: 0 };
    ball.position.set(pts[0].x, BR, pts[0].z);
    camSet("follow");
  }

  function tumble(fell, entryLx) {
    const ex = (entryLx || 0) * LANE_HW;
    fell.forEach((f, i) => {
      if (f && pins[i].visible && !pinAnim[i]) {
        const side = pins[i].position.x < ex ? -1 : 1;
        pinAnim[i] = { t: 0, ax: (Math.random() - 0.5) * 2, az: side * (0.6 + Math.random()), vx: side * (0.4 + Math.random() * 0.8), vz: -(0.3 + Math.random() * 0.9), spin: (Math.random() - 0.5) * 6 };
      }
    });
    camSet("pins");
  }

  // deliver a fresh ball: it rolls up the return and over to the foul line (the "grab" moment)
  function deliverBall(hex, onReady) {
    ball.material.color.set(hex || 0xd63c12);
    const from = new T.Vector3(LANE_HW + GUT + 0.6, BR, 2.0);
    const to = new T.Vector3(0.0, BR, 0.35);
    ball.position.copy(from); ball.rotation.set(0, 0, 0);
    deliverState = { from, to, t: 0, dur: 1.1, onReady };
    camSet("establish", 0);                     // wide alley shot while the ball comes up
  }
  // move the resting ball sideways to show the bowler's stance as they tilt to aim
  function aimBall(lx) { if (!ball || rollState || deliverState) return; ball.position.x = (lx || 0) * LANE_HW; ball.position.z = 0.35; camSet("ready", lx || 0); }
  function showReturn(on) { if (returnBall) returnBall.visible = on !== false; }

  function resize() {
    if (!renderer) return;
    const el = renderer.domElement.parentElement; const w = el.clientWidth, h = el.clientHeight;
    renderer.setSize(w, h, false); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix();
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0); lastT = ts;
    updateCrowd(ts / 1000);
    // ball roll
    if (rollState) {
      rollState.t += dt; const prog = Math.min(1, rollState.t / rollState.dur);
      const n = rollState.pts.length, fi = prog * (n - 1), i0 = Math.floor(fi), i1 = Math.min(n - 1, i0 + 1), f = fi - i0;
      const px = lerp(rollState.pts[i0].x, rollState.pts[i1].x, f), pz = lerp(rollState.pts[i0].z, rollState.pts[i1].z, f);
      const dx = px - rollState.lastX, dz = pz - rollState.lastZ; rollState.lastX = px; rollState.lastZ = pz;
      ball.position.set(px, BR, pz);
      ball.rotateOnWorldAxis(new T.Vector3(1, 0, 0), -dz / BR); // roll forward
      ball.rotateOnWorldAxis(new T.Vector3(0, 0, 1), -dx / BR);
      if (prog >= 1) { const cb = rollState.onArrive; rollState = null; if (cb) cb(); }
    }
    // ball delivery (grab)
    if (deliverState) {
      deliverState.t += dt; const p = Math.min(1, deliverState.t / deliverState.dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
      const np = deliverState.from.clone().lerp(deliverState.to, e);
      const dz = np.z - ball.position.z, dx = np.x - ball.position.x;
      ball.position.copy(np); ball.rotateOnWorldAxis(new T.Vector3(1, 0, 0), -dz / BR); ball.rotateOnWorldAxis(new T.Vector3(0, 0, 1), -dx / BR);
      if (p >= 1) { const cb = deliverState.onReady; deliverState = null; camSet("ready", 0); if (cb) cb(); }
    }
    // pin tumble
    for (let i = 0; i < pins.length; i++) {
      const a = pinAnim[i]; if (!a) continue;
      a.t += dt; const pin = pins[i];
      pin.position.x += a.vx * dt; pin.position.z += a.vz * dt; pin.position.y = Math.max(-1, pin.position.y - a.t * a.t * 2.2 * dt);
      pin.rotation.x += a.ax * a.spin * 0 + a.ax * dt * 3; pin.rotation.z += a.az * dt * 3;
      if (a.t > 1.4) { pin.visible = false; pinAnim[i] = null; }
    }
    // camera follow / ease
    if (camMode === "follow" && rollState) { const bz = ball.position.z; camTarget.set(ball.position.x * 0.5, 1.2, bz + 4.5); cam.userData.look = new T.Vector3(ball.position.x * 0.4, 0.3, bz - 10); }
    cam.position.lerp(camTarget, 0.08);
    if (cam.userData.look) { const cur = new T.Vector3(); cam.getWorldDirection(cur); const want = cam.userData.look.clone().sub(cam.position).normalize(); const blend = cur.lerp(want, 0.1).add(cam.position); cam.lookAt(blend); }
    renderer.render(scene, cam);
  }

  global.Arena3D = { init, resetRack, setStanding, placeBall, deliverBall, aimBall, rollBall, tumble, showReturn, resize, camSet, cheer, PINS };
})(window);
