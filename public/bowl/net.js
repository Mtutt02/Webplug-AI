/*
 * StrikeCast pairing layer — phone (controller) ↔ TV (screen) over WebRTC.
 *
 * Uses PeerJS's free public broker only for the handshake; once paired, swing
 * data goes peer-to-peer. No account, no key, no server of our own. The TV is
 * the host and owns a short room code; the phone joins by that code.
 *
 * Room code is a 4-char base32 (no vowels, no look-alikes) namespaced under a
 * fixed prefix so phone and TV agree on the broker id without a lookup.
 */
(function (global) {
  const PREFIX = "strikecast-v1-";
  const ALPHABET = "23456789CFGHJMPQRVWX"; // no 0/O/1/I/L, no vowels (no accidental words)

  function newCode() {
    let s = "";
    const r = crypto.getRandomValues(new Uint32Array(4));
    for (let i = 0; i < 4; i++) s += ALPHABET[r[i] % ALPHABET.length];
    return s;
  }

  function emitter() {
    const map = new Map();
    return {
      on(ev, fn) { (map.get(ev) || map.set(ev, []).get(ev)).push(fn); return this; },
      emit(ev, ...a) { (map.get(ev) || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }); },
    };
  }

  // ---- TV side: open a room, wait for one controller ----------------------
  function host() {
    const bus = emitter();
    let code, peer, conn, tries = 0;

    function open() {
      code = newCode();
      peer = new Peer(PREFIX + code, { debug: 1 });
      peer.on("open", () => bus.emit("code", code));
      peer.on("connection", (c) => {
        conn = c;
        c.on("open", () => bus.emit("paired"));
        c.on("data", (d) => bus.emit("message", d));
        c.on("close", () => bus.emit("dropped"));
        c.on("error", () => bus.emit("dropped"));
      });
      peer.on("error", (err) => {
        // taken id / network: regenerate the code a couple of times, then surface
        if ((err.type === "unavailable-id" || err.type === "network") && tries++ < 4) {
          try { peer.destroy(); } catch (_) {}
          setTimeout(open, 400);
        } else {
          bus.emit("error", err);
        }
      });
    }
    open();

    return Object.assign(bus, {
      get code() { return code; },
      send(obj) { if (conn && conn.open) conn.send(obj); },
      destroy() { try { peer && peer.destroy(); } catch (_) {} },
    });
  }

  // ---- Phone side: join a room by code ------------------------------------
  function join(code) {
    const bus = emitter();
    code = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const peer = new Peer({ debug: 1 });
    let conn;

    peer.on("open", () => {
      conn = peer.connect(PREFIX + code, { reliable: false }); // unreliable = lower latency for a stream of swings
      conn.on("open", () => bus.emit("paired"));
      conn.on("data", (d) => bus.emit("message", d));
      conn.on("close", () => bus.emit("dropped"));
      conn.on("error", (e) => bus.emit("error", e));
    });
    peer.on("error", (err) => bus.emit("error", err));

    return Object.assign(bus, {
      code,
      send(obj) { if (conn && conn.open) conn.send(obj); },
      destroy() { try { peer.destroy(); } catch (_) {} },
    });
  }

  global.StrikeNet = { host, join, newCode };
})(window);
