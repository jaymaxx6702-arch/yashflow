"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then(async (registration) => {
        if (cancelled) return;

        try {
          await registration.update();
        } catch (error) {
          console.warn("Service Worker update check failed:", error);
        }
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
