const CACHE_NAME = "dpc-v2";

// Take over immediately on update so clients stop serving stale pages.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first for page navigations so HTML is always fresh when online;
// fall back to cache only when offline. Other requests: network, cache fallback.
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("/index.html")))
    );
    return;
  }
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
