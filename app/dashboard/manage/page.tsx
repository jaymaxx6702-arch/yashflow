"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import YashFlowIcon from "@/components/YashFlowIcon";

export default function ManagementHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [canManageOrders, setCanManageOrders] = useState(false);
  const [canManageAttendance, setCanManageAttendance] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadAccess() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      if (profile.role === "admin") {
        setCanManageOrders(true);
        setCanManageAttendance(true);
        setLoading(false);
        return;
      }

      const [ordersPermission, attendancePermission] = await Promise.all([
        supabase.rpc("has_app_permission", {
          p_permission_key: "orders.manage",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key: "attendance.manage",
        }),
      ]);

      if (ordersPermission.error || attendancePermission.error) {
        setMessage(
          `Permission Load Error: ${
            ordersPermission.error?.message ||
            attendancePermission.error?.message ||
            "Unknown error"
          }`
        );
      }

      const orderAccess = Boolean(ordersPermission.data);
      const attendanceAccess = Boolean(attendancePermission.data);

      setCanManageOrders(orderAccess);
      setCanManageAttendance(attendanceAccess);

      if (!orderAccess && !attendanceAccess) {
        setMessage("તમને Management Edit permission આપવામાં આવી નથી.");
      }

      setLoading(false);
    }

    void loadAccess();
  }, [router]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Management Access લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-blue-100">
              PERMISSION BASED ACCESS
            </p>
            <h1 className="text-2xl font-black text-white mt-1">
              Management Access
            </h1>
            <p className="text-sm font-semibold text-blue-100 mt-1">
              ફક્ત આપેલી permissions પ્રમાણે Edit access
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-5">{message}</div>
        )}

        <section className="grid md:grid-cols-2 gap-4">
          {canManageOrders && (
            <button
              type="button"
              onClick={() => router.push("/dashboard/manage/orders")}
              className="yf-card p-6 text-left hover:shadow-md transition"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center"><YashFlowIcon name="orders" size={24} /></div>
              <h2 className="text-xl font-black text-slate-900 mt-3">
                Order Edit Access
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                Order details, priority, due date અને notes edit કરો.
              </p>
              <span className="inline-block mt-4 font-black text-blue-700">
                Open Orders →
              </span>
            </button>
          )}

          {canManageAttendance && (
            <button
              type="button"
              onClick={() => router.push("/dashboard/manage/attendance")}
              className="yf-card p-6 text-left hover:shadow-md transition"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-50 text-cyan-700 border border-cyan-100 flex items-center justify-center"><YashFlowIcon name="clock" size={24} /></div>
              <h2 className="text-xl font-black text-slate-900 mt-3">
                Attendance Edit Access
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                Check In, Check Out અને Admin Note correction કરો.
              </p>
              <span className="inline-block mt-4 font-black text-blue-700">
                Open Attendance →
              </span>
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
