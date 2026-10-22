/*
 * StrikeCast service worker — scoped to /bowl/ (served from /bowl/sw.js so it
 * needs no Service-Worker-Allowed header). It keeps the app's shell openable
 * with no signal, and plays by the Web Plug Standard rules:
 *   - the API is never cached, in either direction;
 *   - the Cache API is shared by the whole origin, so this worker only ever
 *     deletes caches whose name contains "strikecast".
 * The live game itself needs a connection (it is realtime); the shell cache is
 * so the installed icon opens to a real screen instead of a browser error.
 */
const VERSION = "strikecast-v7";
const SHELL = `shell-${VERSION}`;
const CORE = [
  "/bowl/",
  "/bowl/index.html",
  "/bowl/tv.html",
  "/bowl/play.html",
  "/bowl/camera.html",
  "/bowl/app.css",
  "/bowl/net.js",
  "/bowl/balls.js",
  "/bowl/render3d.js",
  "/bowl/three.min.js",
  "/bowl/game.js",
  "/bowl/manifest.webmanifest",
  "/bowl/icon-192.png",
  "/bowl/icon-512.png",
  "/bowl/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(CORE)).catch(() => null).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.includes("strikecast") && n !== SHELL).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // the WebRTC broker etc. is somebody else's problem
  if (url.pathname.startsWith("/api/")) return;         // never cache the API
  if (!url.pathname.startsWith("/bowl/")) return;       // stay in our lane

  // app shell: network first (so updates land), fall back to cache when offline
  event.respondWith(
    fetch(req)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("/bowl/index.html")))
  );
});
