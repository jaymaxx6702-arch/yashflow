"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ensureWebPushSubscription } from "@/utils/push-client";
import { getNativeCurrentPosition } from "@/utils/native-app";

function primeNotificationSound() {
  if (typeof window === "undefined") return;

  try {
    const audio = new Audio("/sounds/notification.wav");
    audio.preload = "auto";
    audio.volume = 0;
    audio.currentTime = 0;

    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
      })
      .catch(() => {
        // Sound permission can still be unlocked later from the in-app bell.
      });
  } catch {
    // Login must never fail because notification audio cannot be primed.
  }
}

async function showLoginNotification(
  employeeName: string,
  gpsRequired: boolean
) {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const title = "YashFlow • New Update";
  const body = gpsRequired
    ? `${employeeName}, Login successful ✅ GPS requirement ON છે.`
    : `${employeeName}, Login successful ✅ GPS requirement OFF છે.`;

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: `yashflow-login-${Date.now()}`,
        data: {
          url: "/dashboard",
        },
      });

      return;
    }

    new Notification(title, {
      body,
      icon: "/icon-192.png",
    });
  } catch (error) {
    console.warn("Login notification failed:", error);
  }
}

async function verifyEmployeeGpsForLogin(): Promise<void> {
  const nativePosition = await getNativeCurrentPosition({
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0,
  });

  if (nativePosition) {
    return;
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error(
          "આ device/browser GPS Location support કરતું નથી. Adminનો સંપર્ક કરો."
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new Error(
              "📍 GPS/Location permission બંધ છે. Phone Location ON કરો અને YashFlow માટે Precise Location Allow કરીને ફરી Login કરો."
            )
          );
          return;
        }

        reject(
          new Error(
            "📍 GPS/Location મળ્યું નથી. Phone Location ON કરો અને પછી ફરી Login કરો."
          )
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

export default function Home() {
  const router = useRouter();

  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  const [loading, setLoading] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [message, setMessage] = useState("");

  /*
    Back-button/session guard:
    જો already logged-in user "/" પર પાછો આવે,
    તો Login screen બતાવવાને બદલે correct dashboard પર મોકલો.
    Temporary profile/network error આવે તો અહીં automatic signOut નહીં કરીએ.
  */
  useEffect(() => {
    let cancelled = false;

    async function checkExistingSession() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !user) {
        setSessionChecking(false);
        return;
      }

      const { data: employee, error: employeeError } = await supabase
        .from("employees")
        .select(`
          id,
          role,
          approval_status,
          is_active
        `)
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (
        !employeeError &&
        employee &&
        employee.approval_status === "approved" &&
        employee.is_active
      ) {
        if (employee.role === "admin") {
          router.replace("/admin");
        } else {
          router.replace("/dashboard");
        }

        return;
      }

      /*
        Profile/network errorથી session destroy ન કરવો.
        Login screen બતાવીશું, પરંતુ automatic logout નહીં.
      */
      setSessionChecking(false);
    }

    checkExistingSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogin() {
    // This runs directly from the Login button user gesture and primes
    // browser audio permission for later real-time notification sounds.
    primeNotificationSound();
    setMessage("");

    if (mobile.length !== 10) {
      setMessage("કૃપા કરીને 10 અંકનો મોબાઇલ નંબર દાખલ કરો.");
      return;
    }

    if (pin.length !== 6) {
      setMessage("PIN ચોક્કસ 6 અંકનો હોવો જોઈએ.");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const internalEmail = `91${mobile}@yashflow.app`;

    const { data: loginData, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: internalEmail,
        password: pin,
      });

    if (loginError || !loginData.user) {
      setMessage("મોબાઇલ નંબર અથવા PIN ખોટો છે.");
      setLoading(false);
      return;
    }

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select(
        `
          id,
          full_name,
          mobile,
          department,
          role,
          approval_status,
          is_active,
          can_view_accounts,
          can_manage_orders,
          can_assign_tasks,
          can_manage_inventory,
          can_manage_staff
        `
      )
      .eq("auth_user_id", loginData.user.id)
      .single();

    if (employeeError || !employee) {
      await supabase.auth.signOut();
      setMessage("તમારી કર્મચારી profile મળી નથી. Adminનો સંપર્ક કરો.");
      setLoading(false);
      return;
    }

    if (employee.approval_status === "pending") {
      await supabase.auth.signOut();
      setMessage(
        "તમારી નોંધણી હજુ Adminની મંજૂરી માટે બાકી છે."
      );
      setLoading(false);
      return;
    }

    if (employee.approval_status === "rejected") {
      await supabase.auth.signOut();
      setMessage("તમારી નોંધણી મંજૂર કરવામાં આવી નથી.");
      setLoading(false);
      return;
    }

    if (!employee.is_active) {
      await supabase.auth.signOut();
      setMessage("તમારું YashFlow account હાલમાં બંધ છે.");
      setLoading(false);
      return;
    }

    let gpsRequired = false;

    if (employee.role !== "admin") {
      const { data: gpsSettings, error: gpsSettingsError } =
        await supabase
          .from("attendance_geofence_settings")
          .select("is_active")
          .eq("id", 1)
          .maybeSingle();

      if (gpsSettingsError) {
        console.warn(
          "GPS login setting could not be checked:",
          gpsSettingsError.message
        );
      } else {
        gpsRequired = Boolean(gpsSettings?.is_active);
      }

      if (gpsRequired) {
        try {
          await verifyEmployeeGpsForLogin();
        } catch (error) {
          await supabase.auth.signOut();
          setMessage(
            error instanceof Error
              ? error.message
              : "📍 GPS/Location ON કરીને ફરી Login કરો."
          );
          setLoading(false);
          return;
        }
      }
    }

    // Never open the browser permission prompt automatically on login.
    // If permission is already granted, silently keep the device subscribed.
    // If permission is OFF/default, PushSubscriptionManager shows an explicit
    // Enable Notifications option after login.
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      window.localStorage.setItem(
        "yashflow-system-notifications-enabled",
        "true"
      );

      void ensureWebPushSubscription()
        .then(() =>
          showLoginNotification(employee.full_name, gpsRequired)
        )
        .catch((error) => {
          console.warn("Login push subscription setup failed:", error);
        });
    }

    /*
      IMPORTANT:
      Login પછી router.push નહીં.
      router.replace Login pageને browser historyમાંથી replace કરે છે,
      એટલે mobile/browser Back દબાવતા Login screen પર પાછા નહીં જશો.
    */
    if (employee.role === "admin") {
      router.replace("/admin");
      return;
    }

    router.replace("/dashboard");
  }

  if (sessionChecking) {
    return (
      <main className="yf-page flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 rounded-full border-4 border-slate-200 border-t-blue-600 animate-spin" />
          <p className="mt-4 font-semibold text-slate-500">
            YashFlow session ચેક થઈ રહી છે...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[radial-gradient(circle_at_top_left,rgba(212,175,55,0.10),transparent_30rem),linear-gradient(180deg,#f8f8f5_0%,#f3f4f6_100%)]">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-[0_24px_70px_rgba(16,27,45,0.16)] overflow-hidden border border-[#e4e2dc]">
        <div className="px-7 pt-10 pb-9 text-center bg-white border-t-[3px] border-t-[#d4af37] border-b border-b-[#efe6c3]">
          <div className="mx-auto mb-4 w-24 h-24 rounded-2xl yf-brand-logo-shell flex items-center justify-center overflow-hidden p-1.5">
            <img
              src="/yashflow-logo.png"
              alt="Yash Laser"
              className="w-full h-full object-contain"
            />
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            Yash<span className="text-[#d4af37]">Flow</span>
          </h1>

          <p className="mt-2 text-slate-200 text-sm">
            Yash Laser Work Management
          </p>

          <p className="mt-5 font-semibold">
            કામ સરળ, વ્યવસ્થિત અને સમયસર
          </p>
        </div>

        <div className="px-7 py-8">
          <h2 className="text-2xl font-bold text-slate-900">
            સ્વાગત છે
          </h2>

          <p className="text-slate-500 mt-1 mb-7">
            તમારા એકાઉન્ટમાં પ્રવેશ કરો
          </p>

          <label className="block text-sm font-semibold text-slate-700 mb-2">
            મોબાઇલ નંબર
          </label>

          <div className="flex border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
            <div className="bg-slate-100 px-4 flex items-center text-slate-600 font-semibold">
              +91
            </div>

            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) =>
                setMobile(e.target.value.replace(/\D/g, ""))
              }
              placeholder="10 અંકનો મોબાઇલ નંબર"
              className="w-full p-4 outline-none text-slate-900"
            />
          </div>

          <label className="block text-sm font-semibold text-slate-700 mt-5 mb-2">
            PIN
          </label>

          <div className="relative">
            <input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, ""))
              }
              placeholder="તમારો PIN દાખલ કરો"
              className="w-full border border-slate-300 rounded-xl p-4 pr-20 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />

            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 text-sm font-semibold"
            >
              {showPin ? "છુપાવો" : "બતાવો"}
            </button>
          </div>

          {message && (
            <div className="mt-5 bg-red-50 border border-red-200 rounded-xl p-4 text-sm font-semibold text-red-700">
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            disabled={loading}
            className="w-full mt-7 yf-brand-button disabled:bg-slate-400 active:scale-[0.99] transition font-black text-lg py-4 rounded-xl"
          >
            {loading ? "લૉગિન થઈ રહ્યું છે..." : "લૉગિન કરો"}
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-slate-400 text-sm">અથવા</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <Link
            href="/register"
            className="block w-full text-center border-2 border-[#1a2b4c] text-[#1a2b4c] font-bold py-4 rounded-xl hover:bg-slate-50 transition"
          >
            નવું એકાઉન્ટ બનાવો
          </Link>

          <div className="mt-8 bg-[#fbf6e7] border border-[#e7d58e] rounded-xl p-4">
            <p className="text-sm text-[#6f5600] font-semibold">
              નવા કર્મચારી માટે
            </p>

            <p className="text-xs text-[#7b681e] mt-1 leading-5">
              પહેલા એકાઉન્ટ બનાવો. Adminની મંજૂરી મળ્યા પછી
              YashFlowમાં કામ શરૂ કરી શકશો.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 text-center py-5">
          <p className="font-bold text-slate-700">YashFlow</p>
          <p className="text-xs text-slate-400 mt-1">
            A Product of Yash Laser
          </p>
        </div>
      </div>
    </main>
  );
}
