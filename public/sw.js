const CACHE_PREFIX = "yashflow-";
const CACHE_NAME = "yashflow-v4";
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

  const isCodeAsset = /\.(?:css|js)$/i.test(url.pathname);
  const isCacheableStaticAsset =
    /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|wav)$/i.test(url.pathname) ||
    url.pathname === "/manifest.webmanifest";

  if (!isCodeAsset && !isCacheableStaticAsset) return;

  if (isCodeAsset) {
    // UI code/styles should be network-first so a newly deployed YashFlow
    // does not keep showing an older cached interface on employee phones.
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);

          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }

          return response;
        } catch {
          return (
            (await caches.match(request)) ||
            new Response("", { status: 504 })
          );
        }
      })()
    );
    return;
  }

  // Images/fonts/manifest can stay fast from cache while refreshing behind
  // the scenes.
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

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        title: "YashFlow",
        body: "નવું work update આવ્યું છે.",
        url: "/dashboard",
        tag: "yashflow-background",
      };

      try {
        const subscription =
          await self.registration.pushManager.getSubscription();

        if (subscription?.endpoint) {
          const response = await fetch("/api/push/latest", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              endpoint: subscription.endpoint,
            }),
          });

          if (response.ok) {
            payload = {
              ...payload,
              ...(await response.json()),
            };
          }
        }
      } catch (error) {
        console.warn("Background push payload fetch failed:", error);
      }

      await self.registration.showNotification(
        payload.title || "YashFlow",
        {
          body: payload.body || "New notification",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: payload.tag || "yashflow-background",
          renotify: true,
          silent: false,
          vibrate: [180, 90, 180],
          data: {
            url: payload.url || "/dashboard",
          },
        }
      );
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url || "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();

          if ("navigate" in client) {
            await client.navigate(targetUrl);
          }

          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
