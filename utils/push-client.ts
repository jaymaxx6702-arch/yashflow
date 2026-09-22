import { createClient } from "@/utils/supabase/client";

function base64UrlToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }

  return bytes;
}

async function waitForGrantedNotificationPermission() {
  if (
    typeof window === "undefined" ||
    !("Notification" in window)
  ) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  // Chromium/PWA can resolve requestPermission("granted") a fraction
  // before Notification.permission reflects the new value.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 150));

    if (Notification.permission === "granted") {
      return true;
    }
  }

  return false;
}

async function accessToken() {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Login session મળ્યો નથી.");
  }

  return session.access_token;
}

export async function ensureWebPushSubscription() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    throw new Error("આ browser/device Closed-App Push support કરતું નથી.");
  }

  const permissionReady =
    await waitForGrantedNotificationPermission();

  if (!permissionReady) {
    throw new Error(
      `Notification permission હજી ${Notification.permission} છે. Browser/App Settings → Notifications → Allow કરો અને app ફરી open કરો.`
    );
  }

  const token = await accessToken();

  const configResponse = await fetch("/api/push/config", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const config = (await configResponse.json()) as {
    error?: string;
    code?: string;
    publicKey?: string;
  };

  if (!configResponse.ok || !config.publicKey) {
    const prefix = config.code ? `[${config.code}] ` : "";
    throw new Error(
      `${prefix}${config.error || "Push configuration મળ્યું નથી."}`
    );
  }

  const registration = await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.publicKey),
    });
  }

  const json = subscription.toJSON();

  const saveResponse = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: json.keys || {},
      userAgent: navigator.userAgent,
    }),
  });

  const saved = (await saveResponse.json()) as {
    error?: string;
    code?: string;
  };

  if (!saveResponse.ok) {
    const prefix = saved.code ? `[${saved.code}] ` : "";
    throw new Error(
      `${prefix}${saved.error || "Push subscription save failed."}`
    );
  }

  return subscription;
}

export async function disableWebPushSubscription() {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  try {
    const token = await accessToken();

    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
      }),
    });
  } finally {
    await subscription.unsubscribe().catch(() => false);
  }
}
