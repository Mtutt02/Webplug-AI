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

The phone and TV pair over **WebRTC** using a short room code (PeerJS's free
public broker handles only the handshake — no account, no key, no server of our
own). Once paired, swing data goes directly phone → TV.

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

## Upgrade path
The public WebRTC broker is great for same-wifi living-room play. For a more
robust production transport (cross-network, reconnection), swap the handshake in
`net.js` for **Supabase Realtime broadcast** (the webplug Supabase project) —
same message shape, no gameplay changes.
