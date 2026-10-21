# StrikeCast

**Your phone is the ball.** A motion bowling game you play by swinging your
phone — the swing casts straight onto any TV or iPad. No console, no Wiimote,
no app to download. Pair in seconds and bowl a full 10-frame game.

Built for **The Web Plug App Store** ([apps.webplug.co](https://apps.webplug.co))
to the Web Plug Standard for installable apps.

## How it works

Two web pages that talk to each other peer-to-peer:

| Page | Role |
|------|------|
| `public/bowl/tv.html` | **The lane** — the big screen. Renders the 2.5-D alley, ball physics, pins, and the scoreboard. Shows a room code + QR to pair. |
| `public/bowl/play.html` | **The controller** — your phone. Reads motion (accelerometer + gyroscope), turns a swing into power / aim / hook, and sends it to the lane. |
| `public/bowl/index.html` | Role chooser (TV vs. controller). |

The phone and TV pair over **Supabase Realtime (broadcast)** using a short room
code as the channel name. Because messages relay through Supabase's servers
(not peer-to-peer), it works across **any** network — phone on cellular, TV on
Wi-Fi, guest networks — with no NAT/TURN headaches. No player account, and
nothing is stored in a database: broadcast is ephemeral pub/sub. The transport
config (project URL + a public *publishable* key) lives in `net.js`.

### The swing
- **Motion mode** (phones): hold the pad, swing your arm, let go. Peak
  acceleration → power, phone tilt → aim, wrist twist → hook. iOS asks for
  motion permission on the first tap.
- **Swipe mode** (any device, incl. desktop): flick upward to bowl; where you
  start = aim, flick speed = power, horizontal drift = hook. Auto-selected when
  motion isn't available.

## Run it locally

```bash
cd public && python3 -m http.server 8099
# TV:     http://localhost:8099/bowl/tv.html
# Phone:  http://localhost:8099/bowl/play.html
# Demo:   http://localhost:8099/bowl/tv.html#demo   (local practice, no phone)
```

Open `tv.html` on one screen, scan/enter the code on `play.html` on your phone.
No phone handy? Open `tv.html` and hit **Practice without a phone** (or use
`#demo`) to bowl with touch/mouse.

## App Store packaging (Web Plug Standard)

`public/bowl/` is a self-contained installable PWA:
- `manifest.webmanifest` — scoped to `/bowl/`, `display: standalone`, 192 / 512 /
  maskable-512 icons, apple-touch-icon, labelled narrow + wide screenshots.
- `sw.js` — scoped service worker; never caches `/api/`, only ever deletes its
  own (`strikecast`) caches, caches the shell so the installed icon opens
  offline.
- Icons and screenshots are generated, not hand-placed (see repo history).

To list it on apps.webplug.co it ships as its own deploy (HTTPS) or drops into
`public/bowl/` of the main `mtutt02/webplug` site, then is submitted at
`apps.webplug.co/submit`.

## Transport notes
Pairing runs through **Supabase Realtime** on the `munch` project
(`ubqtmlgvcyqjvdzljslh`) using a public publishable key — chosen because this
session could reach that project. It can be repointed to the webplug Supabase
project by changing `SB_URL` / `SB_KEY` at the top of `net.js`; the message
shape is identical, so nothing else changes. Only ephemeral broadcast is used —
no tables, no stored data.
