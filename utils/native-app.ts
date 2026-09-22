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
  PushNotifications?: {
    checkPermissions?: () => Promise<{ receive?: string }>;
    requestPermissions?: () => Promise<{ receive?: string }>;
    register?: () => Promise<void>;
    addListener?: (
      eventName: string,
      listener: (payload: Record<string, unknown>) => void
    ) => Promise<{ remove?: () => Promise<void> }> | { remove?: () => Promise<void> };
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
    await native.PushNotifications?.requestPermissions?.();
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

export async function registerNativeFcmToken(
  onToken: (token: string) => void | Promise<void>
) {
  const native = plugins();
  const push = native?.PushNotifications;

  if (!push?.register || !push.addListener) {
    return { native: Boolean(native), registered: false };
  }

  let registrationHandle:
    | { remove?: () => Promise<void> }
    | undefined;

  const listener = (payload: Record<string, unknown>) => {
    const value = payload.value;
    if (typeof value === "string" && value.trim()) {
      void onToken(value.trim());
    }
  };

  try {
    const maybeHandle = await push.addListener("registration", listener);
    registrationHandle = maybeHandle || undefined;

    await push.register();

    return {
      native: true,
      registered: true,
      remove: async () => {
        await registrationHandle?.remove?.();
      },
    };
  } catch (error) {
    console.warn("Native FCM registration failed", error);
    await registrationHandle?.remove?.();
    return { native: true, registered: false };
  }
}
