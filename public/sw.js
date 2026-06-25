// Service worker for offline support.
//
// Strategy:
//  - Navigations (the HTML app shell): network-first, so a fresh deploy shows
//    its newest features immediately when online; falls back to cache offline.
//  - Same-origin assets (JS/CSS/fonts): stale-while-revalidate for speed.
//  - Supabase Storage images (cross-origin): cache-first, so product images
//    stay visible offline after they have been loaded once.
//  - Everything else cross-origin (API/auth calls): passed through, never cached.
const CACHE = "xinventory-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// True for Supabase Storage image requests (public URLs we want available offline).
function isStorageImage(url) {
  return url.pathname.includes("/storage/v1/object/");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) App shell / navigations: network-first so new features appear without a
  //    manual refresh; fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match(req)) || (await cache.match("/")) || Response.error();
        }),
    );
    return;
  }

  // 2) Cross-origin: only cache Supabase Storage images (cache-first for offline).
  if (!sameOrigin) {
    if (isStorageImage(url)) {
      event.respondWith(
        caches.open(CACHE).then(async (cache) => {
          const cached = await cache.match(req);
          if (cached) return cached;
          try {
            const res = await fetch(req);
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          } catch {
            return cached || Response.error();
          }
        }),
      );
    }
    return; // other cross-origin (API/auth): let it hit the network directly
  }

  // 3) Same-origin assets: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
