const PREFIX = `nightweave-app:${self.registration.scope}:`;
const CACHE = PREFIX + "1.4.1";
const APP = new URL("nightweave-offline.html", self.registration.scope).href;
const FILES = ["nightweave-offline.html", "manifest.webmanifest", "assets/app-icon-192.png", "assets/app-icon-512.png"]
  .map(path => new URL(path, self.registration.scope).href);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = ""; url.hash = "";
  if (!FILES.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (!response.ok || response.redirected || !/text\/html/.test(response.headers.get("content-type") || "") && url.href === APP) throw new Error("App unavailable");
      await cache.put(url.href, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(url.href);
      if (saved) return saved;
      throw error;
    }
  })());
});
