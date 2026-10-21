# Webplug Arena — online FPS spec (v0.1 draft)

> Working title: **Arena** · codename **WP-FPS**. Final name TBD — run it through
> the trademark clearance workflow (Attorney Jenkins / TradeMaker) before locking,
> and avoid real game names (Call of Duty, Crossfire, Breach, Overwatch are taken).

Status: **draft for Kennedy's review.** Decisions marked ❓ need a call before build.

---

## 1. Honest scope (read this first)

Kennedy's ask: "first person, Call of Duty style… people could play with each
other hooked in the same session over the internet."

What's realistic on a web + Webplug stack, and still genuinely fun:

- ✅ A **fast, stylized, low-poly online arena shooter** that runs in any browser
  with **no download** — join a match by code, shoot, respawn. Reference class:
  *Krunker.io, Venge.io, Shell Shockers* (web FPS that real players love).
- ✅ Real **online multiplayer** — several people in the same match over the
  internet, not just same-wifi.
- ✅ The **Webplug twist**: optional **phone-as-controller / cast-to-TV** mode
  (gyro aim + touch move), the same innovation StrikeCast proved.
- ❌ NOT photoreal AAA (COD-grade graphics, destruction, 100-player maps,
  anti-cheat, voice). That's a studio-scale, multi-year budget. We borrow COD's
  *feel* (snappy gunplay, killfeed, loadouts, TTK), not its production scale.

Framing it this way keeps the project shippable and the expectations honest. The
rest of this spec assumes the stylized-web-FPS target.

---

## 2. Vision

A drop-in, 5-minute-match arena shooter you open from a link. Bright, readable,
stylized art (not gritty-realistic — stylized reads better at low poly and runs
on weak devices). Three ways to play, same match:

1. **Desktop** — keyboard + mouse (the real FPS experience).
2. **Mobile** — dual touch sticks (standard mobile shooter).
3. **Cast mode (signature)** — game on the TV/laptop, **phone is the gun**:
   gyro to aim, left thumb to move, tap/trigger to fire. The Webplug identity.

All three play in the **same online match** together.

---

## 3. Core gameplay (MVP scope)

- **Mode:** Free-for-all Deathmatch (first to N kills, or most kills in 5 min).
  (Team Deathmatch is a fast follow once FFA netcode is solid.)
- **Players:** 2–8 per match for MVP (scales with server budget).
- **Map:** one small, symmetric arena (think a single COD "Shipment/Nuketown"-size
  box) — a few cover walls, two levels, clear sightlines. Small maps = fast action
  and cheaper to build/sync.
- **Movement:** run, strafe, jump, sprint. (Slide/mantle later.) No fall damage MVP.
- **Weapons (MVP: 2–3, hitscan):**
  - *Rifle* — balanced, medium fire rate.
  - *SMG* — fast, short range.
  - *Shotgun* — burst, close range.
  Hitscan (instant ray) not projectiles = simpler netcode + easier to hit.
- **Combat:** health 100, regen after delay, headshot multiplier, simple spread +
  recoil. Short TTK (COD feel), fast respawn (~3s) at spawn points.
- **HUD:** crosshair, health, ammo/reload, killfeed, scoreboard (Tab), timer.
- **Audio:** shots, hitmarker, reload, kill chime, footsteps (procedural/cheap).
- **Session flow:** Home → Create match (get a **room code**) OR Join by code →
  Lobby (see players, pick loadout, pick control scheme) → Match → Results → rematch.

### Later / V1+
Team modes, more maps + weapons, loadouts/attachments, progression & cosmetics,
ranked/matchmaking, kill streaks, spectator, party/invite links.

---

## 4. Controls ❓ (recommend: all three, desktop-first for MVP)

| Platform | Move | Aim | Fire | Notes |
|---|---|---|---|---|
| Desktop | WASD | mouse (pointer-lock) | click | best feel; **build this first** |
| Mobile browser | left stick | right stick / drag | fire button | standard mobile FPS |
| Cast-to-TV (phone pad) | left thumb stick | **phone gyro** | trigger button/tap | the signature mode; build after desktop |

❓ **Decision:** MVP control target — desktop-only first (fastest to a real FPS
feel), or desktop + cast-mode together (more work, but it's the Webplug hook)?

Recommendation: **desktop first** to validate gunplay + netcode, then layer the
phone/cast controller (we already have the pairing + motion stack from StrikeCast).

---

## 5. Online multiplayer architecture (the hard part)

A fast shooter needs low latency and must resist cheating, so the model matters.

### Transport & authority ❓
Two realistic options:

**A. Authoritative game server (recommended for a real FPS).**
- A **Node game server** runs the match at a fixed tick (e.g. 30 Hz): it owns
  positions, health, hit validation, spawns. Clients send inputs, receive state.
- Client-side **prediction + reconciliation + interpolation** hides latency.
- Transport: **WebSocket** (or WebTransport) client↔server; state over a compact
  binary protocol.
- Hosting: the **Coolify server** already on the roadmap (Agent Hub task #97) — a
  persistent Node process, which Vercel's serverless can't be. One server process
  can host many match rooms.
- Pros: correct, cheat-resistant, scales to real play. Cons: needs the standing
  server + more netcode.

**B. Host-authoritative over Supabase Realtime (fast MVP / prototype).**
- Reuse the StrikeCast transport: players join a Realtime **channel = room code**;
  one client is the "host" simulating the match and broadcasting state; others send
  inputs. Presence tracks who's in.
- Pros: **zero new infra**, ships this week, proves the fun. Cons: host advantage,
  trivially cheatable, host-migration pain — fine for a prototype/friends, not for
  public ranked play.

Recommendation: **prototype on B** (reuse StrikeCast's Supabase stack to prove the
loop), then move the authoritative sim to **A on Coolify** for the real release.
The game-logic layer is written server-authoritative from day one so the swap is
just "where does the sim run."

### Netcode checklist (COD-feel on the web)
- Fixed server tick; inputs timestamped.
- Client prediction for your own movement; reconcile on server correction.
- Entity interpolation (~100 ms buffer) for other players.
- Lag compensation / server-side hit rewind for hitscan fairness.
- Snapshot delta-compression; only send what changed.
- Basic sanity checks server-side (speed, fire rate, position deltas) = anti-cheat v0.

### Lobbies, accounts, persistence
- **Rooms:** join-by-code (StrikeCast-style) for MVP; matchmaking later.
- **Identity:** guest handle for MVP; later tie to **Webplug accounts** (Supabase
  Auth, shared with Plug/Cofounder-HQ) for progression + cosmetics.
- **Persistence:** Supabase Postgres for profiles, stats, unlocks, match history.

---

## 6. Tech stack (proposed)

| Layer | Choice | Why |
|---|---|---|
| Rendering | **Three.js** (WebGL) | mature, runs everywhere, low-poly friendly |
| Physics/collision | **Rapier** (wasm) or hand-rolled AABB/ray | Rapier is fast + deterministic-ish; raycast hits are cheap |
| Client bundle | Vite + TypeScript | fast builds, typed netcode |
| Realtime (proto) | **Supabase Realtime** | already wired, keyless for players |
| Game server (v1) | **Node + ws** on **Coolify** | persistent authoritative sim |
| State DB / auth | **Supabase** (Postgres + Auth) | shared with the Webplug ecosystem |
| Assets | low-poly kits (Kenney/CC0) + custom | cheap, legally clean, stylized |
| Delivery | **Webplug App Store** PWA (`apps.webplug.co`) | same install-free path as StrikeCast |
| Phone controller | StrikeCast pairing + DeviceMotion | reuse the proven module |

Performance targets: 60 fps on a mid laptop, 30 fps on phones/smart-TV browsers;
< ~5 MB initial load; playable at 80–120 ms ping.

---

## 7. What we reuse from StrikeCast

- **Pairing layer** (`net.js`) — phone↔screen over Supabase Realtime, by room code.
- **DeviceMotion / gyro** capture — becomes aim instead of a bowling swing.
- **PWA packaging** to the **Web Plug Standard** (manifest, icons, scoped SW).
- **Vercel + Supabase deploy** workflow and the melivate→webplug move path.
- The whole "open a link, play in seconds, no download" product philosophy.

So this isn't a from-scratch project — it's the StrikeCast platform pointed at a
new game, plus a 3D renderer and an authoritative netcode layer.

---

## 8. Milestones

- **M0 — Greybox single-player (1–2 wks of focused build):** Three.js arena, WASD +
  mouse, one hitscan gun, shootable target dummies, HUD. Proves the feel. No net.
- **M1 — 2-player online (prototype, Supabase host-auth):** join by code, see each
  other move, shoot each other, killfeed, respawn. Proves the loop is fun online.
- **M2 — Authoritative server on Coolify:** move the sim server-side, prediction +
  interpolation + lag comp, 4–8 players, scoreboard, match timer. The real MVP.
- **M3 — Cast mode + mobile:** phone-as-gun gyro controller, touch sticks, cast to TV.
- **M4 — Content + accounts:** 2nd–3rd map, team mode, Webplug login, stats/unlocks,
  list on apps.webplug.co.

---

## 9. Open decisions for Kennedy ❓

1. **Scope confirm:** OK to target a stylized web arena FPS (Krunker-class), not
   photoreal COD? (Strongly recommend yes — it's the only shippable path.)
2. **Control target for MVP:** desktop-first, or desktop + phone-cast together?
3. **Netcode path:** prototype on Supabase first (ship fast, prove fun) then move to
   a Coolify authoritative server — agree? Or stand up the server first?
4. **Art direction:** bright/arcade stylized, or darker/military stylized?
5. **Identity:** guest-only for MVP, or wire Webplug accounts from the start?
6. **Name:** needs picking + a trademark clearance pass.

---

*Generated as a working draft. The engine, netcode, and controller all build on the
StrikeCast platform already live in this repo.*
