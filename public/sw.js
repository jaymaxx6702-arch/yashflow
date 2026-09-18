const CACHE_PREFIX = "yashflow-";
const CACHE_NAME = "yashflow-v3";
const CORE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/yashflow-logo.png",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      await Promise.allSettled(
        CORE_ASSETS.map(async (asset) => {
          const response = await fetch(asset, { cache: "reload" });

          if (response.ok) {
            await cache.put(asset, response.clone());
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        return (
          (await caches.match("/offline.html")) ||
          new Response("YashFlow is offline.", {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
            },
          })
        );
      })
    );
    return;
  }

  const isStaticAsset =
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|wav|css|js)$/i.test(
      url.pathname
    ) || url.pathname === "/manifest.webmanifest";

  if (!isStaticAsset) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);

      const networkPromise = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }

          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(networkPromise);
        return cached;
      }

      const network = await networkPromise;

      return network || new Response("", { status: 504 });
    })()
  );
});
