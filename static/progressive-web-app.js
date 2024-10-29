const cacheName = "pwacache-v4"; // Increment this when files change
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "/dist/src/home/home.js",
  "/style/style.css",
  "/style/inverted-style.css",
  "/style/fonts/ubiquity-nova-standard.woff",
  "/style/special.css",
  "/favicon.svg",
];

// Install event (caches all necessary files)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
      .catch((error) => console.error("[Service Worker] Cache failed:", error))
  );
  self.skipWaiting(); // activate the new worker immediately
});

// Activate event (deletes old caches when updated)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== cacheName) {
              return caches.delete(name);
            }
          })
        );
      })
      .catch((error) => console.error("[Service Worker] Error during activation:", error))
  );
  self.clients.claim(); // Take control of all pages immediately
});

// Fetch event: Cache first approach but update cache anyways
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Ignore non-HTTP(S) requests (like 'chrome-extension://')
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return;
  }

  // If the request has query parameters, bypass the cache
  if (url.search) { 
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Clone the network response to avoid using the body twice
          const responseClone = networkResponse.clone();

          // If the network response is valid, update the cache
          if (networkResponse.ok) {
            caches.open(cacheName).then((cache) =>
              cache.put(event.request, responseClone)
            );
          }
          return networkResponse;
        })
        .catch((error) => {
          console.error("[Service Worker] Network request failed:", error);
          return cachedResponse || new Response("Offline content unavailable", {
            status: 503,
            statusText: "Service Unavailable",
          });
        });

      // Serve from cache first, but update the cache in the background
      return cachedResponse || fetchPromise;
    })
  );
});