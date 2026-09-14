"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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

function notificationIcon(type: string | null) {
  switch (type) {
    case "order_assignment":
      return "📦";
    case "task_assignment":
      return "📋";
    case "leave":
    case "leave_status":
      return "🗓️";
    case "attendance":
      return "🕘";
    default:
      return "🔔";
  }
}

export default function NotificationBell({ employeeId }: Props) {
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [message, setMessage] = useState("");

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [vibrateEnabled, setVibrateEnabled] = useState(false);
  const [vibrationSupported, setVibrationSupported] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initializedRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );

  useEffect(() => {
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = 1;
    audioRef.current = audio;

    const savedSound =
      window.localStorage.getItem("yashflow-notification-sound-enabled") ===
      "true";

    const canVibrate =
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function";

    const savedVibrate =
      canVibrate &&
      window.localStorage.getItem(
        "yashflow-notification-vibrate-enabled"
      ) === "true";

    setSoundEnabled(savedSound);
    setVibrationSupported(canVibrate);
    setVibrateEnabled(savedVibrate);

    return () => {
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

      setSoundEnabled(false);
      window.localStorage.setItem(
        "yashflow-notification-sound-enabled",
        "false"
      );

      setMessage(
        "Browserએ sound block કર્યો. Bell ખોલીને Sound ON ફરી કરો અથવા Site Settings → Sound → Allow કરો."
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
    if (soundEnabled) {
      void playSound();
    }

    if (vibrateEnabled) {
      vibrate();
    }
  }, [playSound, soundEnabled, vibrate, vibrateEnabled]);

  async function toggleSound() {
    setMessage("");

    if (soundEnabled) {
      setSoundEnabled(false);
      window.localStorage.setItem(
        "yashflow-notification-sound-enabled",
        "false"
      );

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      return;
    }

    // Must play directly inside user click so Chrome can unlock audio.
    const ok = await playSound();

    if (ok) {
      setSoundEnabled(true);
      window.localStorage.setItem(
        "yashflow-notification-sound-enabled",
        "true"
      );
    }
  }

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
      "yashflow-notification-vibrate-enabled",
      String(next)
    );

    if (next) {
      vibrate();
    } else if (typeof navigator.vibrate === "function") {
      navigator.vibrate(0);
    }
  }

  function testAlert() {
    setMessage("");

    if (!soundEnabled && !vibrateEnabled) {
      setMessage("Sound અથવા Vibrateમાંથી ઓછામાં ઓછું એક ON કરો.");
      return;
    }

    runAlert();
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
      .channel(`employee-notifications-${employeeId}`)
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
      current.map((item) =>
        item.id === notificationId
          ? { ...item, is_read: true, read_at: now }
          : item
      )
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

    setNotifications((current) =>
      current.map((item) => ({
        ...item,
        is_read: true,
        read_at: item.read_at || now,
      }))
    );

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
        router.push("/dashboard/orders");
        break;

      case "task":
        router.push("/dashboard/tasks");
        break;

      case "leave":
        router.push("/dashboard/leave");
        break;

      case "attendance":
      case "manual_attendance_request":
        router.push("/dashboard");
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
        aria-label="Notifications"
        title="Notifications"
      >
        <span className="text-xl leading-none">🔔</span>

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
                    YASHFLOW
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

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`yf-btn ${
                    soundEnabled
                      ? "bg-green-100 text-green-800 hover:bg-green-50"
                      : "bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  }`}
                >
                  {soundEnabled ? "🔊 Sound ON" : "🔇 Sound OFF"}
                </button>

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
                        {notificationIcon(item.notification_type)}
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
