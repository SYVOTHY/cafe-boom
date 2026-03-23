// ═══════════════════════════════════════════════════════════════════
//  Cafe Bloom POS — Service Worker (PWA)
//  Strategy:
//    • App Shell (HTML/JS/CSS) → Cache-first (instant load)
//    • /api/*                  → Network-first  (always fresh data)
//    • Images / fonts          → Cache-first with background refresh
//  Place this file at: public/sw.js
// ═══════════════════════════════════════════════════════════════════

const CACHE_NAME    = "cafe-bloom-v1";
const SHELL_ASSETS  = [
  "/",
  "/index.html",
  "/manifest.json",
  // Add your built JS/CSS bundle paths here, e.g.:
  // "/assets/index-abc123.js",
  // "/assets/index-abc123.css",
];

// ── Install: pre-cache app shell ─────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ───────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // 1. Skip non-GET and chrome-extension requests
  if (e.request.method !== "GET") return;
  if (url.protocol === "chrome-extension:") return;

  // 2. API calls → Network-first (never serve stale API data)
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // 3. Socket.io polling → always network (never cache)
  if (url.pathname.startsWith("/socket.io/")) return;

  // 4. App shell + assets → Cache-first
  e.respondWith(cacheFirst(e.request));
});

// ── Cache-first strategy ──────────────────────────────────────────
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback: return cached index.html for navigation requests
    if (request.mode === "navigate") {
      const fallback = await caches.match("/index.html");
      if (fallback) return fallback;
    }
    return new Response("Offline — please reconnect", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// ── Network-first strategy ────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
