"use client";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  nativePromise?: (
    pluginName: string,
    methodName: string,
    options?: Record<string, unknown>
  ) => Promise<unknown>;
  nativeCallback?: (
    pluginName: string,
    methodName: string,
    options: Record<string, unknown>,
    callback: (data: unknown, error?: unknown) => void
  ) => string | null;
};

type NativePosition = {
  coords?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
};

const CHANNEL_ID = "yashflow_alerts_v2";
const SOUND_FILE = "yashflow_notification.wav";

function bridge(): CapacitorBridge | null {
  if (typeof window === "undefined") return null;

  const cap = (window as unknown as {
    Capacitor?: CapacitorBridge;
  }).Capacitor;

  const native =
    cap?.isNativePlatform?.() === true ||
    (cap?.getPlatform?.() && cap.getPlatform?.() !== "web");

  return native && typeof cap?.nativePromise === "function"
    ? cap
    : null;
}

async function nativeCall<T = unknown>(
  pluginName: string,
  methodName: string,
  options: Record<string, unknown> = {}
): Promise<T> {
  const cap = bridge();
  if (!cap?.nativePromise) {
    throw new Error("YashFlow native bridge is unavailable.");
  }

  return (await cap.nativePromise(
    pluginName,
    methodName,
    options
  )) as T;
}

export function isNativeYashFlow() {
  return Boolean(bridge());
}

export async function initialiseNativePermissions() {
  const cap = bridge();
  if (!cap) return { native: false, location: "unavailable" };

  let notificationPermission: unknown = null;
  let locationPermission: unknown = null;

  try {
    notificationPermission = await nativeCall(
      "LocalNotifications",
      "requestPermissions"
    );
  } catch (error) {
    console.warn("Native local notification permission failed", error);
  }

  try {
    await nativeCall("PushNotifications", "requestPermissions");
  } catch (error) {
    console.warn("Native push notification permission failed", error);
  }

  try {
    locationPermission = await nativeCall(
      "Geolocation",
      "requestPermissions"
    );
  } catch (error) {
    console.warn("Native location permission request failed", error);
  }

  try {
    // Android notification-channel sound is effectively immutable.
    // v2 guarantees a fresh channel after older silent test builds.
    await nativeCall("LocalNotifications", "createChannel", {
      id: CHANNEL_ID,
      name: "YashFlow Alerts",
      description: "Orders, tasks, attendance and workflow alerts",
      importance: 5,
      visibility: 1,
      sound: SOUND_FILE,
      vibration: true,
      lights: true,
    });
  } catch (error) {
    console.warn("Native notification channel setup failed", error);
  }

  return {
    native: true,
    notificationPermission,
    locationPermission,
  };
}

export async function getNativeCurrentPosition(options?: {
  timeout?: number;
  maximumAge?: number;
  enableHighAccuracy?: boolean;
}) {
  if (!bridge()) return null;

  try {
    const permission = await nativeCall<Record<string, string>>(
      "Geolocation",
      "checkPermissions"
    );

    const allowed =
      permission.location === "granted" ||
      permission.coarseLocation === "granted";

    if (!allowed) {
      const requested = await nativeCall<Record<string, string>>(
        "Geolocation",
        "requestPermissions"
      );

      const granted =
        requested.location === "granted" ||
        requested.coarseLocation === "granted";

      if (!granted) {
        throw new Error(
          "Location Permission denied છે. Android App Info → Permissions → Location → Allow while using app અને Precise Location ON કરો."
        );
      }
    }

    const position = await nativeCall<NativePosition>(
      "Geolocation",
      "getCurrentPosition",
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 12000,
        maximumAge: options?.maximumAge ?? 0,
      }
    );

    const latitude = Number(position.coords?.latitude);
    const longitude = Number(position.coords?.longitude);
    const accuracy = Number(position.coords?.accuracy);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      throw new Error(
        "GPS Location મળ્યું નથી. Phone Location ON છે કે નહીં ચેક કરીને ફરી Try કરો."
      );
    }

    return {
      latitude,
      longitude,
      accuracy: Number.isFinite(accuracy) ? accuracy : 9999,
    };
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(
      "GPS Location મળ્યું નથી. Phone Location ON છે કે નહીં ચેક કરીને ફરી Try કરો."
    );
  }
}

export async function showNativeYashFlowNotification(options: {
  title: string;
  body: string;
  notificationId?: string;
}) {
  if (!bridge()) return false;

  const idSource = options.notificationId || String(Date.now());
  let numericId = 0;
  for (let i = 0; i < idSource.length; i += 1) {
    numericId = (numericId * 31 + idSource.charCodeAt(i)) >>> 0;
  }
  numericId = (numericId % 2147483000) + 1;

  try {
    await nativeCall("LocalNotifications", "schedule", {
      notifications: [
        {
          id: numericId,
          title: options.title || "YashFlow",
          body: options.body || "New notification",
          channelId: CHANNEL_ID,
          schedule: { at: new Date(Date.now() + 150).toISOString() },
          sound: SOUND_FILE,
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
  const cap = bridge();
  if (!cap?.nativeCallback || !cap.nativePromise) {
    return { native: Boolean(cap), registered: false };
  }


  try {
    const permission = await nativeCall<Record<string, string>>(
      "PushNotifications",
      "requestPermissions"
    );

    if (permission.receive !== "granted") {
      return { native: true, registered: false };
    }

    const callbackId = cap.nativeCallback(
      "PushNotifications",
      "addListener",
      { eventName: "registration" },
      (payload, error) => {
        if (error) {
          console.warn("Native FCM registration listener failed", error);
          return;
        }

        const token =
          payload &&
          typeof payload === "object" &&
          "value" in payload &&
          typeof (payload as { value?: unknown }).value === "string"
            ? (payload as { value: string }).value.trim()
            : "";

        if (token) {
          void onToken(token);
        }
      }
    );

    await nativeCall("PushNotifications", "register");

    return {
      native: true,
      registered: true,
      remove: async () => {
        if (!callbackId) return;
        try {
          await nativeCall("PushNotifications", "removeListener", {
            eventName: "registration",
            callbackId,
          });
        } catch {
          // Listener cleanup is best-effort only.
        }
      },
    };
  } catch (error) {
    console.warn("Native FCM registration failed", error);
    return { native: true, registered: false };
  }
}
