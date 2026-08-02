// Service worker for offline support.
//
// Strategy:
//  - Navigations (the HTML app shell): network-first, so a fresh deploy shows
//    its newest features immediately when online; falls back to cache offline.
//  - Same-origin assets (JS/CSS/fonts): stale-while-revalidate for speed.
//  - Supabase Storage images (cross-origin): cache-first, so product images
//    stay visible offline after they have been loaded once.
//  - Everything else cross-origin (API/auth calls): passed through, never cached.
//
// The cache name carries the build id, passed as ?v= when main.tsx registers
// this file. A fixed name meant a deploy kept serving the previous build's
// hashed JS chunks: the new index.html asked for filenames the old cache did
// not have, the lazy route imports rejected, and the screen went blank. A new
// build gets a new cache, and activate below deletes the old ones.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `xinventory-${VERSION}`;

// A freshly activated worker starts with an EMPTY cache: on a first visit the
// page fetched its own assets before this worker controlled anything, and on a
// deploy activate below deletes the previous build's cache. An SPA makes no
// further navigations, so nothing repopulates it until the next cold load: the
// seller closes the app, goes offline, reopens, and gets a blank screen. For a
// POS that is the whole product failing, so the shell is fetched here instead.
//
// The asset filenames are hashed per build and these are per-client builds with
// no manifest to read, so they are taken from the HTML itself: entry script,
// modulepreloads, stylesheet, icons. Lazy route chunks are not listed there and
// still load on first visit while online.
async function precacheShell() {
  const cache = await caches.open(CACHE);
  // `reload` so the HTTP cache cannot hand back the previous build's HTML.
  const res = await fetch("/", { cache: "reload" });
  // Throwing fails the install, which is the safe outcome: the previous worker
  // stays in control with its populated cache instead of this empty one
  // activating, and the browser retries the update on the next load.
  if (!res.ok) throw new Error(`shell ${res.status}`);
  const html = await res.clone().text();
  await cache.put("/", res);

  const urls = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  // One by one: a single missing file must not fail the install, or the app
  // never updates again.
  await Promise.all(
    urls.map((u) =>
      fetch(u)
        .then((r) => (r.ok ? cache.put(u, r) : null))
        .catch(() => {}),
    ),
  );
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(precacheShell());
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

  // Same-origin API routes (e.g. /api/usdt-rate): always network, never cached.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  // 1) App shell / navigations: network-first so new features appear without a
  //    manual refresh; fall back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only a good response replaces the cached shell. A 500 or an error
          // page from a deploy hiccup would otherwise become what every later
          // offline launch serves.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
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
