"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type Department = {
  id: number;
  name: string;
  name_gujarati: string | null;
};

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [department, setDepartment] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function loadDepartments() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("departments")
        .select("id, name, name_gujarati")
        .eq("is_active", true)
        .order("name");

      if (!error && data) {
        setDepartments(data);
      }
    }

    loadDepartments();
  }, []);

  async function handleRegister() {
    setMessage("");
    setIsSuccess(false);

    if (!name.trim()) {
      setMessage("કૃપા કરીને કર્મચારીનું નામ લખો.");
      return;
    }

    if (mobile.length !== 10) {
      setMessage("મોબાઇલ નંબર 10 અંકનો હોવો જોઈએ.");
      return;
    }

    if (!department) {
      setMessage("કૃપા કરીને મુખ્ય વિભાગ પસંદ કરો.");
      return;
    }

    if (pin.length !== 6) {
      setMessage("PIN ચોક્કસ 6 અંકનો હોવો જોઈએ.");
      return;
    }

    if (pin !== confirmPin) {
      setMessage("બંને PIN સરખા નથી.");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    // Employeeને email બતાવવાનું નથી.
    // Mobile પરથી internal login email બનાવીએ છીએ.
    const internalEmail = `91${mobile}@yashflow.app`;

    const { data: authData, error: authError } =
      await supabase.auth.signUp({
        email: internalEmail,
        password: pin,
      });

    if (authError || !authData.user) {
      setMessage(
        authError?.message ||
          "એકાઉન્ટ બનાવવામાં સમસ્યા આવી. ફરી પ્રયત્ન કરો."
      );
      setLoading(false);
      return;
    }

    const { error: profileError } = await supabase
      .from("employees")
      .insert({
        auth_user_id: authData.user.id,
        full_name: name.trim(),
        mobile: mobile,
        department: department,
        role: "employee",
        approval_status: "pending",
        is_active: true,
      });

    if (profileError) {
      setMessage(
        "કર્મચારીની માહિતી save કરવામાં સમસ્યા આવી: " +
          profileError.message
      );

      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // Pending employeeને logged-in ન રાખવો
    await supabase.auth.signOut();

    setIsSuccess(true);
    setMessage(
      "નોંધણી સફળ થઈ. હવે Adminની મંજૂરી મળ્યા પછી તમે YashFlowમાં Login કરી શકશો."
    );

    setName("");
    setMobile("");
    setDepartment("");
    setPin("");
    setConfirmPin("");

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden">
        <div className="bg-gradient-to-br from-blue-700 to-blue-500 px-7 py-8 text-white">
          <Link href="/" className="text-sm text-blue-100">
            ← લૉગિન પર પાછા જાઓ
          </Link>

          <div className="flex items-center gap-4 mt-5">
            <div className="w-16 h-16 shrink-0 rounded-2xl bg-white shadow-lg overflow-hidden p-1">
              <img
                src="/yashflow-logo.png"
                alt="Yash Laser"
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <h1 className="text-3xl font-black">
                નવું એકાઉન્ટ
              </h1>

              <p className="text-blue-100 mt-1">
                YashFlow કર્મચારી નોંધણી
              </p>
            </div>
          </div>
        </div>

        <div className="px-7 py-8 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              કર્મચારીનું પૂરું નામ
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="તમારું નામ લખો"
              className="w-full border border-slate-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              મોબાઇલ નંબર
            </label>

            <div className="flex border border-slate-300 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
              <div className="bg-slate-100 px-4 flex items-center font-semibold text-slate-600">
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
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              મુખ્ય વિભાગ
            </label>

            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full border border-slate-300 rounded-xl p-4 bg-white outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            >
              <option value="">વિભાગ પસંદ કરો</option>

              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name_gujarati || dept.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              6 અંકનો PIN બનાવો
            </label>

            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, ""))
              }
              placeholder="******"
              className="w-full border border-slate-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              PIN ફરી દાખલ કરો
            </label>

            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) =>
                setConfirmPin(e.target.value.replace(/\D/g, ""))
              }
              placeholder="******"
              className="w-full border border-slate-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
            />
          </div>

          {message && (
            <div
              className={`rounded-xl p-4 text-sm font-semibold ${
                isSuccess
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : "bg-red-50 border border-red-200 text-red-700"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={handleRegister}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-lg py-4 rounded-xl shadow-md transition"
          >
            {loading ? "નોંધણી થઈ રહી છે..." : "નોંધણી માટે મોકલો"}
          </button>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="font-semibold text-amber-900">
              Admin Approval જરૂરી છે
            </p>

            <p className="text-sm text-amber-800 mt-1 leading-6">
              નોંધણી કર્યા પછી Admin તમારી માહિતી ચકાસશે.
              મંજૂરી મળ્યા પછી જ YashFlowમાં લૉગિન કરી શકશો.
            </p>
          </div>

          <p className="text-center text-sm text-slate-500">
            પહેલેથી એકાઉન્ટ છે?{" "}
            <Link href="/" className="text-blue-600 font-bold">
              લૉગિન કરો
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}