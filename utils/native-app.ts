"use client";

type NativePlugins = {
  Geolocation?: {
    checkPermissions?: () => Promise<Record<string, string>>;
    requestPermissions?: () => Promise<Record<string, string>>;
  };
  LocalNotifications?: {
    checkPermissions?: () => Promise<{ display?: string }>;
    requestPermissions?: () => Promise<{ display?: string }>;
    createChannel?: (options: Record<string, unknown>) => Promise<void>;
    schedule?: (options: Record<string, unknown>) => Promise<void>;
  };
};

function plugins(): NativePlugins | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
      Plugins?: NativePlugins;
    };
  }).Capacitor;

  const native =
    cap?.isNativePlatform?.() === true ||
    (cap?.getPlatform?.() && cap.getPlatform?.() !== "web");

  return native ? cap?.Plugins || null : null;
}

export function isNativeYashFlow() {
  return Boolean(plugins());
}

export async function initialiseNativePermissions() {
  const native = plugins();
  if (!native) return { native: false };

  try {
    await native.LocalNotifications?.requestPermissions?.();
  } catch (error) {
    console.warn("Native notification permission request failed", error);
  }

  try {
    await native.Geolocation?.requestPermissions?.();
  } catch (error) {
    console.warn("Native location permission request failed", error);
  }

  try {
    await native.LocalNotifications?.createChannel?.({
      id: "yashflow_alerts",
      name: "YashFlow Alerts",
      description: "Orders, tasks, attendance and workflow alerts",
      importance: 5,
      visibility: 1,
      sound: "yashflow_notification.wav",
      vibration: true,
      lights: true,
    });
  } catch (error) {
    console.warn("Native notification channel setup failed", error);
  }

  return { native: true };
}

export async function showNativeYashFlowNotification(options: {
  title: string;
  body: string;
  notificationId?: string;
}) {
  const native = plugins();
  if (!native?.LocalNotifications?.schedule) return false;

  const idSource = options.notificationId || String(Date.now());
  let numericId = 0;
  for (let i = 0; i < idSource.length; i += 1) {
    numericId = (numericId * 31 + idSource.charCodeAt(i)) >>> 0;
  }
  numericId = (numericId % 2147483000) + 1;

  try {
    await native.LocalNotifications.schedule({
      notifications: [
        {
          id: numericId,
          title: options.title || "YashFlow",
          body: options.body || "New notification",
          channelId: "yashflow_alerts",
          schedule: { at: new Date(Date.now() + 150) },
          sound: "yashflow_notification.wav",
        },
      ],
    });
    return true;
  } catch (error) {
    console.warn("Native local notification failed", error);
    return false;
  }
}
