/*
 * StrikeCast pairing layer — phone (controller) ↔ TV (screen).
 *
 * Transport: Supabase Realtime "broadcast". Both devices join a channel named
 * after the room code and exchange messages through Supabase's servers. Because
 * it relays through a server (not peer-to-peer), it works across ANY network —
 * phone on cellular, TV on Wi-Fi, guest networks, all fine. No account for the
 * player, nothing stored in a database: broadcast is ephemeral pub/sub.
 *
 * The room code is a 4-char base32 (no vowels, no look-alikes) and is simply the
 * channel name both sides agree on. Handshake: the phone broadcasts `join`, the
 * TV answers `ack`; after that, gameplay messages ride the `msg` event.
 *
 * Config below is a Supabase project URL + publishable key — a public client
 * key, safe to ship in the page (that is what publishable keys are for).
 */
(function (global) {
  const SB_URL = "https://ubqtmlgvcyqjvdzljslh.supabase.co";
  const SB_KEY = "sb_publishable_xKiQciToM95bDLTwRZz-uQ_Kbgu_-z9";
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

  const chanName = (code) => "strikecast-" + code;
  let _client;
  function client() {
    if (!_client) _client = global.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 30 } } });
    return _client;
  }

  // ---- TV side: open a room, wait for one controller ----------------------
  function host() {
    const bus = emitter();
    const code = newCode();
    let paired = false;
    const ch = client().channel(chanName(code), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "join" }, () => {
        ch.send({ type: "broadcast", event: "ack" });          // answer every join (covers retries / lost acks)
        if (!paired) { paired = true; bus.emit("paired"); }     // but pair only once
      })
      .on("broadcast", { event: "msg" }, ({ payload }) => bus.emit("message", payload))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") bus.emit("code", code);
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") bus.emit("error", status);
        else if (status === "CLOSED" && paired) bus.emit("dropped");
      });
    return Object.assign(bus, {
      get code() { return code; },
      send(obj) { ch.send({ type: "broadcast", event: "msg", payload: obj }); },
      destroy() { try { client().removeChannel(ch); } catch (_) {} },
    });
  }

  // ---- Phone side: join a room by code ------------------------------------
  function join(code) {
    const bus = emitter();
    code = (code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    let acked = false, joinTimer = null, tries = 0;
    const ch = client().channel(chanName(code), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "ack" }, () => { if (!acked) { acked = true; clearInterval(joinTimer); bus.emit("paired"); } })
      .on("broadcast", { event: "msg" }, ({ payload }) => bus.emit("message", payload))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const sendJoin = () => ch.send({ type: "broadcast", event: "join" });
          sendJoin();                                           // say hello…
          joinTimer = setInterval(() => {                       // …and keep saying it until the TV acks
            if (acked || tries++ > 10) { clearInterval(joinTimer); return; }
            sendJoin();
          }, 900);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") bus.emit("error", status);
        else if (status === "CLOSED" && acked) bus.emit("dropped");
      });
    return Object.assign(bus, {
      code,
      send(obj) { ch.send({ type: "broadcast", event: "msg", payload: obj }); },
      destroy() { try { clearInterval(joinTimer); client().removeChannel(ch); } catch (_) {} },
    });
  }

  global.StrikeNet = { host, join, newCode };
})(window);
