"use client";

import { useEffect } from "react";
import { ensureWebPushSubscription } from "@/utils/push-client";

export default function PushSubscriptionManager() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      window.localStorage.getItem(
        "yashflow-system-notifications-enabled"
      ) !== "true"
    ) {
      return;
    }

    void ensureWebPushSubscription().catch((error) => {
      console.warn("Background push subscription refresh failed:", error);
    });
  }, []);

  return null;
}
