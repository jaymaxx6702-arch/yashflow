"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import YashFlowIcon from "@/components/YashFlowIcon";
import { ensureWebPushSubscription } from "@/utils/push-client";

export default function PushSubscriptionManager() {
  const pathname = usePathname();
  const [permission, setPermission] =
    useState<NotificationPermission | "unsupported">(() => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        return "unsupported";
      }

      return Notification.permission;
    });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return;
    }

    const current = Notification.permission;

    if (current !== "granted") {
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "false"
      );
      return;
    }

    window.localStorage.setItem(
      "yashflow-system-notifications-enabled",
      "true"
    );

    void ensureWebPushSubscription().catch((error) => {
      console.warn("Background push subscription refresh failed:", error);
    });
  }, [pathname]);

  async function enableNotifications() {
    if (
      typeof window === "undefined" ||
      !("Notification" in window)
    ) {
      setPermission("unsupported");
      return;
    }

    setBusy(true);
    setMessage("");

    if (Notification.permission === "denied") {
      setPermission("denied");
      setMessage(
        "Notifications browser/device settingsમાં Block છે. YashFlow → Site/App Settings → Notifications → Allow કરો."
      );
      setBusy(false);
      return;
    }

    const nextPermission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();

    setPermission(nextPermission);

    if (nextPermission !== "granted") {
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "false"
      );
      setMessage("Notifications Allow થયા નથી.");
      setBusy(false);
      return;
    }

    try {
      await ensureWebPushSubscription();
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "true"
      );
      setMessage("Notifications ON ✅ App બંધ હોય ત્યારે પણ alert મળશે.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Push subscription setup failed."
      );
    }

    setBusy(false);
  }

  const appScreen =
    pathname !== "/" &&
    pathname !== "/register";

  if (!appScreen || permission === "granted" || permission === "unsupported") {
    return null;
  }

  return (
    <div className="fixed top-3 left-3 right-3 z-[130] mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-amber-900 flex items-center gap-2">
            <YashFlowIcon name="bell" size={17} />
            Mobile Notifications OFF
          </p>
          <p className="text-[11px] font-semibold text-amber-800 mt-1">
            App બંધ હોય ત્યારે પણ Order/Task alerts મેળવવા Notifications Allow કરો.
          </p>
          {message && (
            <p className="text-[11px] font-bold text-red-700 mt-1">
              {message}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void enableNotifications()}
          disabled={busy}
          className="yf-btn yf-btn-warning yf-btn-sm shrink-0 disabled:opacity-50"
        >
          {busy
            ? "Please Wait..."
            : permission === "denied"
            ? "How to Allow"
            : "Allow"}
        </button>
      </div>
    </div>
  );
}
