"use client";

import { useEffect } from "react";
import { ensureWebPushSubscription } from "@/utils/push-client";

export default function PushSubscriptionManager() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    // Permission is the user's consent. Once granted, keep the device
    // subscribed automatically so closed-app notifications do not depend
    // on opening the Bell and manually toggling a localStorage flag.
    void ensureWebPushSubscription()
      .then(() => {
        window.localStorage.setItem(
          "yashflow-system-notifications-enabled",
          "true"
        );
      })
      .catch((error) => {
        console.warn("Background push subscription refresh failed:", error);
      });
  }, []);

  return null;
}
