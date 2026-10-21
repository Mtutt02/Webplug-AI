/*
 * Webplug Arena — match networking over Supabase Realtime.
 *
 * Prototype model (peer / shooter-authoritative): every browser in a match is an
 * equal client. Presence tracks who's in the room; each client broadcasts its own
 * position at ~18 Hz and claims its own hits. Not cheat-proof — that's the job of
 * the authoritative Coolify server later — but it proves the loop with zero infra.
 *
 * Channel = "arena-<CODE>". Events: state (pose), shot (tracer viz), hit, died,
 * respawn, chat. Same public Supabase project/key as StrikeCast (ephemeral only).
 */
(function (global) {
  const SB_URL = "https://ubqtmlgvcyqjvdzljslh.supabase.co";
  const SB_KEY = "sb_publishable_xKiQciToM95bDLTwRZz-uQ_Kbgu_-z9";
  const ALPHABET = "23456789CFGHJMPQRVWX";

  function newCode() { let s = ""; const r = crypto.getRandomValues(new Uint32Array(4)); for (let i = 0; i < 4; i++) s += ALPHABET[r[i] % ALPHABET.length]; return s; }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function emitter() { const m = new Map(); return { on(e, f) { (m.get(e) || m.set(e, []).get(e)).push(f); return this; }, emit(e, ...a) { (m.get(e) || []).forEach((f) => { try { f(...a); } catch (x) { console.error(x); } }); } }; }

  let _client;
  const client = () => (_client = _client || global.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 40 } } }));

  // join (or create) a match room
  function join(code, me) {
    const bus = emitter();
    code = (code || newCode()).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    me = Object.assign({ id: uid() }, me);
    const ch = client().channel("arena-" + code, { config: { broadcast: { self: false }, presence: { key: me.id } } });

    const players = new Map();                                   // id -> {id, name, ...}
    function syncPlayers() {
      const st = ch.presenceState(); players.clear();
      Object.values(st).forEach((arr) => arr.forEach((p) => players.set(p.id, p)));
      bus.emit("players", Array.from(players.values()));
    }
    ch.on("presence", { event: "sync" }, syncPlayers)
      .on("presence", { event: "join" }, syncPlayers)
      .on("presence", { event: "leave" }, syncPlayers);

    ["state", "shot", "hit", "died", "respawn", "chat"].forEach((ev) =>
      ch.on("broadcast", { event: ev }, ({ payload }) => bus.emit(ev, payload)));

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") { await ch.track({ id: me.id, name: me.name }); bus.emit("ready", code, me.id); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") bus.emit("error", status);
    });

    return Object.assign(bus, {
      code, id: me.id,
      send(ev, payload) { ch.send({ type: "broadcast", event: ev, payload: Object.assign({ from: me.id }, payload) }); },
      updatePresence(extra) { ch.track(Object.assign({ id: me.id, name: me.name }, extra)); },
      leave() { try { ch.untrack(); client().removeChannel(ch); } catch (_) {} },
    });
  }

  global.ArenaNet = { join, newCode, uid };
})(window);
