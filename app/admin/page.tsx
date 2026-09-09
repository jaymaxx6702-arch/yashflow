"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type DashboardCounts = {
  totalStaff: number;
  pendingEmployees: number;
  presentToday: number;
  leaveToday: number;
  pendingLeave: number;
  pendingAttendance: number;
  openOrders: number;
  completedOrders: number;
  design: number;
  cutting: number;
  production: number;
  packing: number;
  transportation: number;
};

const initialCounts: DashboardCounts = {
  totalStaff: 0,
  pendingEmployees: 0,
  presentToday: 0,
  leaveToday: 0,
  pendingLeave: 0,
  pendingAttendance: 0,
  openOrders: 0,
  completedOrders: 0,
  design: 0,
  cutting: 0,
  production: 0,
  packing: 0,
  transportation: 0,
};

function getIndiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function SummaryCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone: "blue" | "green" | "purple" | "orange" | "cyan" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    green: "bg-green-50 border-green-100 text-green-700",
    purple: "bg-purple-50 border-purple-100 text-purple-700",
    orange: "bg-orange-50 border-orange-100 text-orange-700",
    cyan: "bg-cyan-50 border-cyan-100 text-cyan-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 ${toneClass}`}>
      <p className="text-sm font-bold opacity-80">{title}</p>
      <p className="text-3xl font-black mt-2">{value}</p>
      <p className="text-xs font-semibold mt-2 opacity-70">{subtitle}</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();

  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const today = useMemo(() => getIndiaDate(), []);

  async function loadDashboardCounts() {
    const supabase = createClient();

    setRefreshing(true);
    setMessage("");

    const [
      totalStaffResult,
      pendingEmployeesResult,
      attendanceResult,
      leaveTodayResult,
      pendingLeaveResult,
      pendingAttendanceResult,
      ordersResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .eq("is_active", true),

      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending"),

      supabase
        .from("attendance")
        .select("id, approval_status")
        .eq("attendance_date", today),

      supabase
        .from("leave_requests")
        .select("id")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),

      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("approval_required", true)
        .eq("approval_status", "pending"),

      supabase
        .from("orders")
        .select("id, current_stage"),
    ]);

    const firstError =
      totalStaffResult.error ||
      pendingEmployeesResult.error ||
      attendanceResult.error ||
      leaveTodayResult.error ||
      pendingLeaveResult.error ||
      pendingAttendanceResult.error ||
      ordersResult.error;

    if (firstError) {
      setMessage(`Dashboard Load Error: ${firstError.message}`);
      setRefreshing(false);
      return;
    }

    const presentToday = (attendanceResult.data || []).filter(
      (row) => row.approval_status !== "rejected"
    ).length;

    const orderRows = ordersResult.data || [];

    const stageCount = (stage: string) =>
      orderRows.filter((order) => order.current_stage === stage).length;

    const openOrders = orderRows.filter(
      (order) =>
        order.current_stage !== "completed" &&
        order.current_stage !== "cancelled"
    ).length;

    setCounts({
      totalStaff: totalStaffResult.count || 0,
      pendingEmployees: pendingEmployeesResult.count || 0,
      presentToday,
      leaveToday: leaveTodayResult.data?.length || 0,
      pendingLeave: pendingLeaveResult.count || 0,
      pendingAttendance: pendingAttendanceResult.count || 0,
      openOrders,
      completedOrders: stageCount("completed"),
      design: stageCount("design"),
      cutting: stageCount("cutting"),
      production: stageCount("production"),
      packing: stageCount("packing"),
      transportation: stageCount("transportation_dispatch"),
    });

    setRefreshing(false);
  }

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: adminProfile, error: adminError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        adminError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        adminProfile.approval_status !== "approved" ||
        !adminProfile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      await loadDashboardCounts();
      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-600">
          Admin Dashboard લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">YashFlow Admin</h1>
            <p className="text-blue-100 text-sm mt-1">
              Yash Laser Management Dashboard
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadDashboardCounts}
              disabled={refreshing}
              className="bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl font-bold disabled:opacity-60"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl font-bold"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {message && (
          <div className="mb-5 bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 font-semibold">
            {message}
          </div>
        )}

        <section>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-blue-600">TODAY</p>
              <h2 className="text-2xl font-black mt-1">Live Summary</h2>
            </div>

            <p className="text-sm font-semibold text-slate-500">{today}</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            <SummaryCard
              title="Total Staff"
              value={counts.totalStaff}
              subtitle={`${counts.pendingEmployees} approval pending`}
              tone="blue"
            />

            <SummaryCard
              title="Present Today"
              value={counts.presentToday}
              subtitle="Checked-in staff"
              tone="green"
            />

            <SummaryCard
              title="Leave Today"
              value={counts.leaveToday}
              subtitle={`${counts.pendingLeave} leave request pending`}
              tone="purple"
            />

            <SummaryCard
              title="Pending Approval"
              value={counts.pendingAttendance}
              subtitle="Late / Half Day attendance"
              tone="orange"
            />

            <SummaryCard
              title="Open Orders"
              value={counts.openOrders}
              subtitle="Current production work"
              tone="cyan"
            />

            <SummaryCard
              title="Completed Orders"
              value={counts.completedOrders}
              subtitle="Total completed"
              tone="green"
            />

            <SummaryCard
              title="Pending Employees"
              value={counts.pendingEmployees}
              subtitle="Registration approval"
              tone="blue"
            />

            <SummaryCard
              title="Pending Leave"
              value={counts.pendingLeave}
              subtitle="Awaiting admin action"
              tone="purple"
            />
          </div>
        </section>

        <section className="mt-7">
          <div>
            <p className="text-sm font-bold text-cyan-600">PRODUCTION</p>
            <h2 className="text-2xl font-black mt-1">Order Workflow</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-5">
            <SummaryCard
              title="Design"
              value={counts.design}
              subtitle="Current stage"
              tone="blue"
            />
            <SummaryCard
              title="Cutting"
              value={counts.cutting}
              subtitle="Current stage"
              tone="orange"
            />
            <SummaryCard
              title="Production"
              value={counts.production}
              subtitle="Current stage"
              tone="purple"
            />
            <SummaryCard
              title="Packing"
              value={counts.packing}
              subtitle="Current stage"
              tone="slate"
            />
            <SummaryCard
              title="Transportation"
              value={counts.transportation}
              subtitle="Transportation / Dispatch"
              tone="cyan"
            />
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-6 mt-7 shadow-sm">
          <div>
            <h2 className="text-xl font-black">Management Modules</h2>
            <p className="text-sm text-slate-500 mt-1">
              YashFlowના બધા Admin modules અહીંથી ખોલો.
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 mt-6">

            <Link
              href="/admin/orders"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-cyan-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-cyan-600">ORDERS</p>
                  <h3 className="text-lg font-black mt-1">Order Management</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Orders create કરો અને production workflow track કરો.
                  </p>
                  <span className="inline-block mt-3 bg-cyan-100 text-cyan-700 px-3 py-1 rounded-full text-xs font-black">
                    {counts.openOrders} Open
                  </span>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-cyan-50 flex items-center justify-center text-2xl">
                  📦
                </div>
              </div>
            </Link>

            <Link
              href="/admin/tasks"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-violet-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-violet-600">TASKS</p>
                  <h3 className="text-lg font-black mt-1">Task Management</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Employeeને task assign કરો અને progress track કરો.
                  </p>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-violet-50 flex items-center justify-center text-2xl">
                  📋
                </div>
              </div>
            </Link>
            <Link
              href="/admin/employees"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-blue-600">STAFF</p>
                  <h3 className="text-lg font-black mt-1">Employee Approval</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Employee approve/reject અને departments manage કરો.
                  </p>
                  {counts.pendingEmployees > 0 && (
                    <span className="inline-block mt-3 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-black">
                      {counts.pendingEmployees} Pending
                    </span>
                  )}
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">
                  👥
                </div>
              </div>
            </Link>

            <Link
              href="/admin/attendance"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-green-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-green-600">ATTENDANCE</p>
                  <h3 className="text-lg font-black mt-1">
                    Attendance Management
                  </h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Check In/Out, Manual Punch અને daily status જુઓ.
                  </p>
                  <span className="inline-block mt-3 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-black">
                    {counts.presentToday} Present
                  </span>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-green-50 flex items-center justify-center text-2xl">
                  🕘
                </div>
              </div>
            </Link>

            <Link
              href="/admin/attendance-approval"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-orange-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-orange-600">APPROVAL</p>
                  <h3 className="text-lg font-black mt-1">
                    Attendance Approval
                  </h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Late અને Half Day attendance approve/reject કરો.
                  </p>
                  {counts.pendingAttendance > 0 && (
                    <span className="inline-block mt-3 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-black">
                      {counts.pendingAttendance} Pending
                    </span>
                  )}
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center text-2xl">
                  ✅
                </div>
              </div>
            </Link>

            <Link
              href="/admin/leave"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-purple-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-purple-600">LEAVE</p>
                  <h3 className="text-lg font-black mt-1">Leave Management</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Leave requests approve/reject કરો.
                  </p>
                  {counts.pendingLeave > 0 && (
                    <span className="inline-block mt-3 bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-black">
                      {counts.pendingLeave} Pending
                    </span>
                  )}
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-purple-50 flex items-center justify-center text-2xl">
                  🗓️
                </div>
              </div>
            </Link>

            <Link
              href="/admin/holidays"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-emerald-600">HOLIDAYS</p>
                  <h3 className="text-lg font-black mt-1">Holiday Management</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Company holidays add/edit/activate કરો.
                  </p>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">
                  📅
                </div>
              </div>
            </Link>

            <Link
              href="/admin/attendance-report"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-sky-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-sky-600">REPORTS</p>
                  <h3 className="text-lg font-black mt-1">
                    Monthly Attendance Report
                  </h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Monthly attendance, leave અને working hours જુઓ.
                  </p>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-sky-50 flex items-center justify-center text-2xl">
                  📊
                </div>
              </div>
            </Link>

            <Link
              href="/admin/products"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-indigo-600">PRODUCTS</p>
                  <h3 className="text-lg font-black mt-1">Product Master</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Products અને dynamic customization options manage કરો.
                  </p>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl">
                  🧩
                </div>
              </div>
            </Link>

            <Link
              href="/admin/inventory"
              className="block rounded-2xl border border-slate-200 p-5 hover:border-slate-400 hover:shadow-md transition"
            >
              <div className="flex justify-between gap-4">
                <div>
                  <p className="text-xs font-black text-slate-600">INVENTORY</p>
                  <h3 className="text-lg font-black mt-1">
                    Inventory Management
                  </h3>
                  <p className="text-sm text-slate-500 mt-2">
                    Inventory items અને stock movement manage કરો.
                  </p>
                </div>
                <div className="w-12 h-12 shrink-0 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">
                  🏷️
                </div>
              </div>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
