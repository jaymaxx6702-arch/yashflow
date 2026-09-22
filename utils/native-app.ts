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
    // Create the Android channel first so YashFlow Alerts + sound already exist
    // in App Notification Settings as soon as the app opens for the first time.
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


export async function registerNativeBackHandler() {
  const cap = bridge();
  if (!cap?.nativeCallback || !cap.nativePromise) {
    return { native: Boolean(cap), registered: false };
  }

  const callbackId = cap.nativeCallback(
    "App",
    "addListener",
    { eventName: "backButton" },
    () => {
      // Give the currently visible modal/drawer first chance to consume Back.
      // Any overlay can listen for this event, call preventDefault(), and close
      // itself without forcing a route change.
      const backEvent = new CustomEvent("yashflow:native-back", {
        cancelable: true,
      });
      window.dispatchEvent(backEvent);
      if (backEvent.defaultPrevented) return;

      const path = window.location.pathname;

      // Root screens stay inside YashFlow instead of closing the Android app.
      if (path === "/" || path === "/admin" || path === "/dashboard") {
        return;
      }

      // Prefer browser history only when YashFlow has created an in-app entry.
      // Otherwise use deterministic parent routes so Back never escapes the
      // remote WebView to an external/blank screen.
      if (
        window.history.length > 1 &&
        (window.history.state?.yfEmployeeDrawer ||
          window.history.state?.yfYashFlowRoute)
      ) {
        window.history.back();
        return;
      }

      let target = "/";

      if (/^\/admin\/orders\/[^/]+/.test(path)) {
        target = "/admin/orders";
      } else if (/^\/dashboard\/orders\/[^/]+/.test(path)) {
        target = "/dashboard/orders";
      } else if (path.startsWith("/admin/")) {
        target = "/admin";
      } else if (path.startsWith("/dashboard/manage/")) {
        target = "/dashboard/manage";
      } else if (path.startsWith("/dashboard/")) {
        target = "/dashboard";
      } else if (path === "/completed-tasks") {
        target = "/admin";
      } else if (path === "/register" || path === "/install") {
        target = "/";
      }

      window.location.assign(target);
    }
  );

  return {
    native: true,
    registered: true,
    remove: async () => {
      if (!callbackId) return;
      try {
        await nativeCall("App", "removeListener", {
          eventName: "backButton",
          callbackId,
        });
      } catch {
        // Best-effort cleanup.
      }
    },
  };
}
