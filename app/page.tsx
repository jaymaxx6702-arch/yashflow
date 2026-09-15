"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-700 to-blue-500 px-7 pt-10 pb-12 text-white text-center">
          <div className="mx-auto mb-4 w-20 h-20 rounded-2xl bg-white flex items-center justify-center shadow-lg">
            <span className="text-blue-700 text-4xl font-black">
              YF
            </span>
          </div>

          <h1 className="text-4xl font-black tracking-tight">
            Yash<span className="text-blue-100">Flow</span>
          </h1>

          <p className="mt-2 text-blue-100 text-sm">
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
            className="w-full mt-7 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 active:scale-[0.99] transition text-white font-bold text-lg py-4 rounded-xl shadow-md"
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
            className="block w-full text-center border-2 border-blue-600 text-blue-600 font-bold py-4 rounded-xl hover:bg-blue-50 transition"
          >
            નવું એકાઉન્ટ બનાવો
          </Link>

          <div className="mt-8 bg-blue-50 rounded-xl p-4">
            <p className="text-sm text-blue-900 font-semibold">
              નવા કર્મચારી માટે
            </p>

            <p className="text-xs text-blue-700 mt-1 leading-5">
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
