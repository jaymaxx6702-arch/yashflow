"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import YashFlowIcon, { type YashFlowIconName } from "@/components/YashFlowIcon";
import { createClient } from "@/utils/supabase/client";
import {
  initialiseNativePermissions,
  isNativeYashFlow,
  showNativeYashFlowNotification,
} from "@/utils/native-app";
import {
  disableWebPushSubscription,
  ensureWebPushSubscription,
} from "@/utils/push-client";

type NotificationRow = {
  id: string;
  notification_type: string | null;
  title: string;
  message: string;
  related_type: string | null;
  related_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type Props = {
  employeeId: string;
};

function formatNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function notificationIcon(type: string | null): YashFlowIconName {
  switch (type) {
    case "order_assignment":
    case "order_update":
      return "orders";
    case "task":
    case "task_assignment":
    case "task_update":
      return "task";
    case "leave":
    case "leave_status":
      return "calendar";
    case "attendance":
      return "clock";
    default:
      return "bell";
  }
}

export default function AdminNotificationBell({ employeeId }: Props) {
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [message, setMessage] = useState("");

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrateEnabled, setVibrateEnabled] = useState(false);
  const [vibrationSupported, setVibrationSupported] = useState(false);
  const [closedAppPushEnabled, setClosedAppPushEnabled] = useState(false);
  const [closedAppPushSupported, setClosedAppPushSupported] = useState(false);
  const [pushSetupBusy, setPushSetupBusy] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  useEffect(() => {
    function handleNativeBack(event: Event) {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
    }

    window.addEventListener(
      "yashflow:native-back",
      handleNativeBack as EventListener
    );

    return () => {
      window.removeEventListener(
        "yashflow:native-back",
        handleNativeBack as EventListener
      );
    };
  }, [open]);

  useEffect(() => {
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = 1;
    audioRef.current = audio;

    const unlockAudio = () => {
      const current = audioRef.current;
      if (!current) return;

      const previousVolume = current.volume;
      current.volume = 0;
      current.currentTime = 0;

      void current
        .play()
        .then(() => {
          current.pause();
          current.currentTime = 0;
          current.volume = previousVolume || 1;
        })
        .catch(() => {
          current.volume = previousVolume || 1;
        });
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    window.localStorage.setItem(
      "yashflow-admin-notification-sound-enabled",
      "true"
    );
    setSoundEnabled(true);

    const canVibrate =
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function";

    const savedVibrate =
      canVibrate &&
      window.localStorage.getItem(
        "yashflow-admin-notification-vibrate-enabled"
      ) === "true";

    setVibrationSupported(canVibrate);
    setVibrateEnabled(savedVibrate);

    const nativeApp = isNativeYashFlow();
    const canPush =
      nativeApp ||
      (typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window);

    setClosedAppPushSupported(canPush);

    if (nativeApp) {
      setClosedAppPushEnabled(true);
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "true"
      );
    } else if (canPush) {
      void navigator.serviceWorker.ready
        .then((registration) =>
          registration.pushManager.getSubscription()
        )
        .then((subscription) => {
          const enabled =
            Notification.permission === "granted" &&
            Boolean(subscription);

          setClosedAppPushEnabled(enabled);
          window.localStorage.setItem(
            "yashflow-system-notifications-enabled",
            String(enabled)
          );
        })
        .catch((error) => {
          console.warn("Push subscription status check failed:", error);
          setClosedAppPushEnabled(false);
        });
    }

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const playSound = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;

    try {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
      await audio.play();
      return true;
    } catch (error) {
      console.warn("Notification sound blocked:", error);

      window.localStorage.setItem(
        "yashflow-admin-notification-sound-enabled",
        "true"
      );

      setMessage(
        "Browserએ automatic sound block કર્યો છે. Bell ખોલ્યા પછી Test Alert દબાવો અથવા Site Settings → Sound → Allow કરો. Preference ON જ રાખવામાં આવી છે."
      );

      return false;
    }
  }, []);

  const vibrate = useCallback(() => {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.vibrate !== "function"
    ) {
      return false;
    }

    // One fixed vibration pattern for all YashFlow notifications.
    return navigator.vibrate([180, 90, 180]);
  }, []);

  const runAlert = useCallback(() => {
    if (isNativeYashFlow()) {
      if (vibrateEnabled) {
        vibrate();
      }
      return;
    }

    if (soundEnabled) {
      void playSound();
    }

    if (vibrateEnabled) {
      vibrate();
    }
  }, [playSound, soundEnabled, vibrate, vibrateEnabled]);

  function toggleVibrate() {
    setMessage("");

    if (!vibrationSupported) {
      setMessage(
        "આ browser/device Web Vibration support કરતું નથી. Android Chrome/PWAમાં સામાન્ય રીતે કામ કરે છે."
      );
      return;
    }

    const next = !vibrateEnabled;

    setVibrateEnabled(next);

    window.localStorage.setItem(
      "yashflow-admin-notification-vibrate-enabled",
      String(next)
    );

    if (next) {
      vibrate();
    } else if (typeof navigator.vibrate === "function") {
      navigator.vibrate(0);
    }
  }

  async function testAlert() {
    setMessage("");

    if (isNativeYashFlow()) {
      await initialiseNativePermissions();

      const sent = await showNativeYashFlowNotification({
        title: "YashFlow Test Alert",
        body: "Native notification sound test ✅",
        notificationId: `test-${Date.now()}`,
      });

      setMessage(
        sent
          ? "Native Test Alert મોકલ્યો ✅ Notification + sound હવે આવવો જોઈએ."
          : "Native Test Alert failed. App notification permission/settings ચેક કરો."
      );
      return;
    }

    if (!soundEnabled && !vibrateEnabled) {
      setMessage("Sound અથવા Vibrateમાંથી ઓછામાં ઓછું એક ON કરો.");
      return;
    }

    runAlert();
  }

  async function toggleClosedAppPush() {
    setMessage("");

    if (isNativeYashFlow()) {
      setPushSetupBusy(true);
      try {
        await initialiseNativePermissions();
        setClosedAppPushEnabled(true);
        window.localStorage.setItem(
          "yashflow-system-notifications-enabled",
          "true"
        );
        setMessage("Native Android Notifications ready ✅");
      } finally {
        setPushSetupBusy(false);
      }
      return;
    }

    if (!closedAppPushSupported) {
      setMessage(
        "આ browser/device Closed-App Push support કરતું નથી."
      );
      return;
    }

    setPushSetupBusy(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const existing =
        await registration.pushManager.getSubscription();

      if (
        existing &&
        Notification.permission === "granted"
      ) {
        await disableWebPushSubscription();

        setClosedAppPushEnabled(false);
        window.localStorage.setItem(
          "yashflow-system-notifications-enabled",
          "false"
        );
        setMessage("Closed-App Notifications OFF થયા.");
        return;
      }

      if (Notification.permission === "denied") {
        setClosedAppPushEnabled(false);
        setMessage(
          "Notifications browser/device settingsમાં Block છે. Site/App Settings → Notifications → Allow કરો."
        );
        return;
      }

      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        setClosedAppPushEnabled(false);
        setMessage(
          "Notification permission Allow કરો. Browser/App Settings → Notifications → Allow."
        );
        return;
      }

      setMessage("Closed-App Notifications setup થઈ રહ્યું છે...");

      const subscription = await ensureWebPushSubscription();

      setClosedAppPushEnabled(Boolean(subscription));
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "true"
      );
      setMessage(
        "Closed-App Notifications ON ✅ App બંધ હોય ત્યારે પણ system sound સાથે alert આવશે."
      );
    } catch (error) {
      setClosedAppPushEnabled(false);
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "false"
      );
      setMessage(
        error instanceof Error
          ? `Push Setup Error: ${error.message}`
          : "Closed-App Push setup failed."
      );
    } finally {
      setPushSetupBusy(false);
    }
  }

  const loadNotifications = useCallback(
    async (alertForNew = false) => {
      if (!employeeId) return;

      const supabase = createClient();

      const { data, error } = await supabase
        .from("notifications")
        .select(`
          id,
          notification_type,
          title,
          message,
          related_type,
          related_id,
          is_read,
          read_at,
          created_at
        `)
        .eq("employee_id", employeeId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) {
        setMessage(`Notification Load Error: ${error.message}`);
        setLoading(false);
        return;
      }

      const rows = (data || []) as NotificationRow[];

      if (initializedRef.current && alertForNew) {
        const hasNewUnread = rows.some(
          (item) => !item.is_read && !knownIdsRef.current.has(item.id)
        );

        if (hasNewUnread) {
          runAlert();
          const newest = rows.find(
            (item) => !item.is_read && !knownIdsRef.current.has(item.id)
          );
          if (newest) {
            void showNativeYashFlowNotification({
              title: newest.title || "YashFlow",
              body: newest.message || "New notification",
              notificationId: newest.id,
            });
          }
        }
      }

      rows.forEach((item) => knownIdsRef.current.add(item.id));

      setNotifications(rows);
      initializedRef.current = true;
      setLoading(false);
    },
    [employeeId, runAlert]
  );

  useEffect(() => {
    if (!employeeId) return;

    void loadNotifications(false);

    const pollTimer = window.setInterval(() => {
      void loadNotifications(true);
    }, 20000);

    const supabase = createClient();

    const channel = supabase
      .channel(`admin-notifications-${employeeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `employee_id=eq.${employeeId}`,
        },
        (payload) => {
          const newRow = payload.new as Partial<NotificationRow>;
          const newId = String(newRow.id || "");

          if (newId && !knownIdsRef.current.has(newId)) {
            knownIdsRef.current.add(newId);
            runAlert();
            void showNativeYashFlowNotification({
              title: String(newRow.title || "YashFlow"),
              body: String(newRow.message || "New notification"),
              notificationId: newId,
            });
          }

          void loadNotifications(false);
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [employeeId, loadNotifications, runAlert]);

  async function markRead(notificationId: string) {
    const supabase = createClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: now,
      })
      .eq("id", notificationId)
      .eq("employee_id", employeeId);

    if (error) {
      setMessage(`Read Status Error: ${error.message}`);
      return false;
    }

    setNotifications((current) =>
      current.filter((item) => item.id !== notificationId)
    );

    return true;
  }

  async function markAllRead() {
    if (unreadCount === 0) return;

    setMarkingAll(true);
    setMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: now,
      })
      .eq("employee_id", employeeId)
      .eq("is_read", false);

    if (error) {
      setMessage(`Mark All Read Error: ${error.message}`);
      setMarkingAll(false);
      return;
    }

    setNotifications([]);

    setMarkingAll(false);
  }

  async function openNotification(item: NotificationRow) {
    setMessage("");

    if (!item.is_read) {
      await markRead(item.id);
    }

    setOpen(false);

    switch (item.related_type) {
      case "order":
        router.push("/admin/orders");
        break;

      case "task":
        router.push("/admin/tasks");
        break;

      case "leave":
        router.push("/admin/leave");
        break;

      case "attendance":
      case "manual_attendance_request":
        router.push("/admin/attendance-approval");
        break;

      case "inventory":
        router.push("/admin/inventory");
        break;

      default:
        break;
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setMessage("");
          void loadNotifications(false);
        }}
        className="relative w-11 h-11 rounded-xl bg-white/15 border border-white/20 text-white hover:bg-white/25 transition flex items-center justify-center"
        aria-label="Admin Notifications"
        title="Admin Notifications"
      >
        <YashFlowIcon name="bell" size={21} />

        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 border-2 border-blue-700 text-white text-[11px] font-black flex items-center justify-center shadow">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Close notifications"
          />

          <aside className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-slate-50 shadow-2xl flex flex-col">
            <div className="p-5 bg-gradient-to-r from-blue-700 to-blue-600 text-white">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.15em] text-blue-100">
                    YASHFLOW ADMIN
                  </p>

                  <h2 className="text-2xl font-black mt-1">
                    Notifications
                  </h2>

                  <p className="text-sm font-semibold text-blue-100 mt-1">
                    {unreadCount} unread
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 hover:bg-white/25 font-black"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                <div
                  className="yf-btn yf-btn-success cursor-default"
                  title="Notification sound is always enabled"
                >
                  🔊 Sound Always ON
                </div>

                <button
                  type="button"
                  onClick={toggleVibrate}
                  disabled={!vibrationSupported}
                  className={`yf-btn disabled:opacity-50 ${
                    vibrateEnabled
                      ? "bg-violet-100 text-violet-800 hover:bg-violet-50"
                      : "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  }`}
                >
                  {!vibrationSupported
                    ? "📳 Unsupported"
                    : vibrateEnabled
                    ? "📳 Vibrate ON"
                    : "📴 Vibrate OFF"}
                </button>

                <button
                  type="button"
                  onClick={() => void toggleClosedAppPush()}
                  disabled={!closedAppPushSupported || pushSetupBusy}
                  className={`yf-btn disabled:opacity-50 ${
                    closedAppPushEnabled
                      ? "bg-cyan-100 text-cyan-900"
                      : "bg-white/10 text-white border border-white/20"
                  }`}
                >
                  {!closedAppPushSupported
                    ? "📵 Push Unsupported"
                    : pushSetupBusy
                    ? "⏳ Setting up..."
                    : closedAppPushEnabled
                    ? "📲 Closed-App ON"
                    : "📴 Closed-App OFF"}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={testAlert}
                  className="yf-btn bg-amber-300 text-amber-950 hover:bg-amber-200"
                >
                  Test Alert
                </button>

                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={markingAll || unreadCount === 0}
                  className="yf-btn bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  {markingAll ? "Please Wait..." : "Mark all read"}
                </button>

                <button
                  type="button"
                  onClick={() => void loadNotifications(false)}
                  className="yf-btn bg-blue-800 text-white border border-blue-400/30 hover:bg-blue-900"
                >
                  Refresh
                </button>
              </div>
            </div>

            {message && (
              <div className="m-4 mb-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                {message}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loading ? (
                <div className="py-12 text-center text-slate-500 font-bold">
                  Notifications લોડ થઈ રહ્યા છે...
                </div>
              ) : notifications.length === 0 ? (
                <div className="yf-card p-8 text-center">
                  <div className="text-4xl">🔔</div>
                  <p className="font-black text-slate-800 mt-3">
                    કોઈ notification નથી
                  </p>
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void openNotification(item)}
                    className={`w-full text-left rounded-2xl border p-4 transition hover:shadow-md ${
                      item.is_read
                        ? "bg-white border-slate-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xl ${
                          item.is_read ? "bg-slate-100" : "bg-blue-100"
                        }`}
                      >
                        <YashFlowIcon
                          name={notificationIcon(item.notification_type)}
                          size={20}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-black text-slate-900">
                            {item.title}
                          </p>

                          {!item.is_read && (
                            <span className="mt-1 w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                          )}
                        </div>

                        <p className="text-sm text-slate-600 font-medium mt-1 leading-5">
                          {item.message}
                        </p>

                        <p className="text-xs font-bold text-slate-400 mt-2">
                          {formatNotificationTime(item.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="border-t border-slate-200 bg-white px-5 py-3">
              <p className="text-xs font-semibold text-slate-400 text-center">
                One fixed sound + optional vibration
              </p>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
