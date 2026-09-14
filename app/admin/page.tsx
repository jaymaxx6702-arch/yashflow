"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import AdminNotificationBell from "./AdminNotificationBell";

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

type AttentionCounts = {
  overdueOrders: number;
  delayedWorkflow: number;
  overdueTasks: number;
  readyForApproval: number;
  missingAttendance: number;
  lowStock: number;
};

type DelaySetting = {
  status: string;
  delay_minutes: number;
  enabled: boolean;
};

type Tone =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "cyan"
  | "slate";

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

const initialAttentionCounts: AttentionCounts = {
  overdueOrders: 0,
  delayedWorkflow: 0,
  overdueTasks: 0,
  readyForApproval: 0,
  missingAttendance: 0,
  lowStock: 0,
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

function getIndiaDisplayDate() {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

const toneStyles: Record<
  Tone,
  {
    shell: string;
    icon: string;
    value: string;
    label: string;
    line: string;
  }
> = {
  blue: {
    shell: "border-blue-100 bg-gradient-to-br from-white to-blue-50/70",
    icon: "bg-blue-100 text-blue-700",
    value: "text-blue-700",
    label: "text-blue-700",
    line: "bg-blue-500",
  },
  green: {
    shell: "border-green-100 bg-gradient-to-br from-white to-green-50/70",
    icon: "bg-green-100 text-green-700",
    value: "text-green-700",
    label: "text-green-700",
    line: "bg-green-500",
  },
  purple: {
    shell: "border-purple-100 bg-gradient-to-br from-white to-purple-50/70",
    icon: "bg-purple-100 text-purple-700",
    value: "text-purple-700",
    label: "text-purple-700",
    line: "bg-purple-500",
  },
  orange: {
    shell: "border-orange-100 bg-gradient-to-br from-white to-orange-50/70",
    icon: "bg-orange-100 text-orange-700",
    value: "text-orange-700",
    label: "text-orange-700",
    line: "bg-orange-500",
  },
  cyan: {
    shell: "border-cyan-100 bg-gradient-to-br from-white to-cyan-50/70",
    icon: "bg-cyan-100 text-cyan-700",
    value: "text-cyan-700",
    label: "text-cyan-700",
    line: "bg-cyan-500",
  },
  slate: {
    shell: "border-slate-200 bg-gradient-to-br from-white to-slate-50",
    icon: "bg-slate-100 text-slate-700",
    value: "text-slate-800",
    label: "text-slate-700",
    line: "bg-slate-500",
  },
};

function SummaryCard({
  title,
  value,
  subtitle,
  tone,
  icon,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone: Tone;
  icon: string;
}) {
  const styles = toneStyles[tone];

  return (
    <div
      className={`yf-card yf-card-hover relative overflow-hidden p-5 ${styles.shell}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${styles.line}`} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-black tracking-wide ${styles.label}`}>
            {title.toUpperCase()}
          </p>

          <p className={`text-3xl font-black mt-2 ${styles.value}`}>
            {value}
          </p>
        </div>

        <div
          className={`w-11 h-11 rounded-2xl flex items-center justify-center text-xl ${styles.icon}`}
        >
          {icon}
        </div>
      </div>

      <p className="text-xs font-semibold text-slate-500 mt-3">
        {subtitle}
      </p>
    </div>
  );
}

function WorkflowCard({
  title,
  value,
  tone,
  icon,
  subtitle,
}: {
  title: string;
  value: number;
  tone: Tone;
  icon: string;
  subtitle: string;
}) {
  const styles = toneStyles[tone];

  return (
    <div
      className={`yf-card yf-card-hover p-4 ${styles.shell}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${styles.icon}`}
        >
          {icon}
        </div>

        <span className={`text-2xl font-black ${styles.value}`}>
          {value}
        </span>
      </div>

      <h3 className="font-black text-slate-900 mt-4">{title}</h3>

      <p className="text-xs font-semibold text-slate-500 mt-1">
        {subtitle}
      </p>
    </div>
  );
}


function AttentionCard({
  href,
  title,
  value,
  description,
  icon,
  tone,
}: {
  href: Route;
  title: string;
  value: number;
  description: string;
  icon: string;
  tone: Tone;
}) {
  const styles = toneStyles[tone];

  return (
    <Link
      href={href}
      className={`yf-card yf-card-hover group relative overflow-hidden p-5 ${styles.shell}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${styles.line}`} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`text-xs font-black tracking-wide ${styles.label}`}>
            {title.toUpperCase()}
          </p>

          <p className={`text-4xl font-black mt-2 ${styles.value}`}>
            {value}
          </p>

          <p className="text-xs font-semibold text-slate-500 mt-2 leading-5">
            {description}
          </p>
        </div>

        <div
          className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-2xl ${styles.icon}`}
        >
          {icon}
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200/70 pt-3 flex items-center justify-between">
        <span className={`text-xs font-black ${styles.label}`}>
          Review Now
        </span>

        <span
          className={`font-black transition-transform group-hover:translate-x-1 ${styles.label}`}
        >
          →
        </span>
      </div>
    </Link>
  );
}

function ModuleCard({
  href,
  label,
  title,
  description,
  icon,
  tone,
  badge,
}: {
  href: Route;
  label: string;
  title: string;
  description: string;
  icon: string;
  tone: Tone;
  badge?: string;
}) {
  const styles = toneStyles[tone];

  return (
    <Link
      href={href}
      className={`yf-card yf-card-hover group relative overflow-hidden p-5 ${styles.shell}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${styles.line}`} />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-xs font-black tracking-wide ${styles.label}`}>
            {label}
          </p>

          <h3 className="text-lg font-black text-slate-900 mt-1">
            {title}
          </h3>

          <p className="text-sm text-slate-600 mt-2 leading-6">
            {description}
          </p>

          {badge && (
            <span
              className={`yf-badge mt-4 ${
                tone === "green"
                  ? "yf-badge-green"
                  : tone === "orange"
                  ? "yf-badge-orange"
                  : tone === "purple"
                  ? "yf-badge-purple"
                  : "yf-badge-blue"
              }`}
            >
              {badge}
            </span>
          )}
        </div>

        <div
          className={`w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-2xl ${styles.icon}`}
        >
          {icon}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-slate-200/70 pt-4">
        <span className={`text-sm font-black ${styles.label}`}>
          Open Module
        </span>

        <span
          className={`text-lg font-black transition-transform group-hover:translate-x-1 ${styles.label}`}
        >
          →
        </span>
      </div>
    </Link>
  );
}

export default function AdminPage() {
  const router = useRouter();

  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const [attentionCounts, setAttentionCounts] = useState<AttentionCounts>(initialAttentionCounts);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const today = useMemo(() => getIndiaDate(), []);
  const displayDate = useMemo(() => getIndiaDisplayDate(), []);

  const totalAttention =
    attentionCounts.overdueOrders +
    attentionCounts.delayedWorkflow +
    attentionCounts.overdueTasks +
    counts.pendingAttendance +
    counts.pendingLeave +
    counts.pendingEmployees +
    attentionCounts.readyForApproval +
    attentionCounts.missingAttendance +
    attentionCounts.lowStock;

  const totalApprovals =
    counts.pendingAttendance +
    counts.pendingLeave +
    counts.pendingEmployees +
    attentionCounts.readyForApproval;

  const pendingApprovalRoute: Route =
    counts.pendingAttendance > 0
      ? "/admin/attendance-approval"
      : counts.pendingLeave > 0
      ? "/admin/leave"
      : counts.pendingEmployees > 0
      ? "/admin/employees"
      : attentionCounts.readyForApproval > 0
      ? "/admin/orders"
      : "/admin/attendance-approval";

  async function loadDashboardCounts() {
    const supabase = createClient();

    setRefreshing(true);
    setMessage("");

    const [
      totalStaffResult,
      activeEmployeesResult,
      pendingEmployeesResult,
      attendanceResult,
      leaveTodayResult,
      pendingLeaveResult,
      pendingAttendanceResult,
      manualPunchPendingResult,
      ordersResult,
      tasksResult,
      stageWorksResult,
      delaySettingsResult,
      inventoryResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "approved")
        .eq("is_active", true),

      supabase
        .from("employees")
        .select("id, role")
        .eq("approval_status", "approved")
        .eq("is_active", true),

      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("approval_status", "pending"),

      supabase
        .from("attendance")
        .select("id, employee_id, approval_status")
        .eq("attendance_date", today),

      supabase
        .from("leave_requests")
        .select("id, employee_id")
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
        .from("manual_attendance_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),

      supabase
        .from("orders")
        .select(`
          id,
          current_stage,
          workflow_status,
          due_date
        `),

      supabase
        .from("tasks")
        .select("id, status, due_date"),

      supabase
        .from("order_stage_work")
        .select(`
          id,
          status,
          status_changed_at
        `),

      supabase
        .from("workflow_delay_settings")
        .select(`
          status,
          delay_minutes,
          enabled
        `),

      supabase
        .from("inventory_items")
        .select(`
          id,
          current_stock,
          minimum_stock,
          is_active
        `)
        .eq("is_active", true),
    ]);

    const firstError =
      totalStaffResult.error ||
      activeEmployeesResult.error ||
      pendingEmployeesResult.error ||
      attendanceResult.error ||
      leaveTodayResult.error ||
      pendingLeaveResult.error ||
      pendingAttendanceResult.error ||
      manualPunchPendingResult.error ||
      ordersResult.error ||
      tasksResult.error ||
      stageWorksResult.error ||
      delaySettingsResult.error ||
      inventoryResult.error;

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
      orderRows.filter(
        (order) => order.current_stage === stage
      ).length;

    const openOrders = orderRows.filter(
      (order) =>
        order.current_stage !== "completed" &&
        order.current_stage !== "cancelled"
    ).length;

    const normalAttendancePending =
      pendingAttendanceResult.count || 0;

    const manualAttendancePending =
      manualPunchPendingResult.count || 0;

    setCounts({
      totalStaff: totalStaffResult.count || 0,
      pendingEmployees: pendingEmployeesResult.count || 0,
      presentToday,
      leaveToday: leaveTodayResult.data?.length || 0,
      pendingLeave: pendingLeaveResult.count || 0,
      pendingAttendance:
        normalAttendancePending + manualAttendancePending,
      openOrders,
      completedOrders: stageCount("completed"),
      design: stageCount("design"),
      cutting: stageCount("cutting"),
      production: stageCount("production"),
      packing: stageCount("packing"),
      transportation: stageCount("transportation_dispatch"),
    });

    // -----------------------------------------------------
    // ATTENTION REQUIRED
    // -----------------------------------------------------

    const overdueOrders = orderRows.filter((order) => {
      if (!order.due_date || order.due_date >= today) {
        return false;
      }

      return (
        order.current_stage !== "completed" &&
        order.current_stage !== "cancelled" &&
        order.workflow_status !== "completed" &&
        order.workflow_status !== "cancelled"
      );
    }).length;

    const overdueTasks = (tasksResult.data || []).filter((task) => {
      return (
        !!task.due_date &&
        task.due_date < today &&
        (task.status === "pending" ||
          task.status === "in_progress")
      );
    }).length;

    const stageRows = stageWorksResult.data || [];

    const readyForApproval = stageRows.filter(
      (work) => work.status === "ready_for_approval"
    ).length;

    const delaySettings = new Map(
      ((delaySettingsResult.data || []) as DelaySetting[])
        .filter((item) => item.enabled)
        .map((item) => [
          item.status,
          item.delay_minutes,
        ])
    );

    const nowMs = Date.now();

    const delayedWorkflow = stageRows.filter((work) => {
      const delayMinutes = delaySettings.get(work.status);

      if (!delayMinutes || !work.status_changed_at) {
        return false;
      }

      const changedAtMs = new Date(
        work.status_changed_at
      ).getTime();

      if (!Number.isFinite(changedAtMs)) {
        return false;
      }

      return nowMs - changedAtMs >= delayMinutes * 60 * 1000;
    }).length;

    const presentEmployeeIds = new Set(
      (attendanceResult.data || [])
        .filter((row) => row.approval_status !== "rejected")
        .map((row) => row.employee_id)
    );

    const leaveEmployeeIds = new Set(
      (leaveTodayResult.data || []).map(
        (row) => row.employee_id
      )
    );

    const missingAttendance = (
      activeEmployeesResult.data || []
    ).filter((employee) => {
      // Admins are not included in missing staff attendance alerts.
      if (employee.role === "admin") {
        return false;
      }

      return (
        !presentEmployeeIds.has(employee.id) &&
        !leaveEmployeeIds.has(employee.id)
      );
    }).length;

    const lowStock = (inventoryResult.data || []).filter(
      (item) =>
        Number(item.current_stock || 0) <=
        Number(item.minimum_stock || 0)
    ).length;

    setAttentionCounts({
      overdueOrders,
      delayedWorkflow,
      overdueTasks,
      readyForApproval,
      missingAttendance,
      lowStock,
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

      const { data: adminProfile, error: adminError } =
        await supabase
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

      setAdminId(adminProfile.id);

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
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card px-6 py-5 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
          <p className="font-bold text-slate-700">
            Admin Dashboard લોડ થઈ રહ્યું છે...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-2xl shadow-sm">
                ⚡
              </div>

              <div>
                <p className="text-xs font-black tracking-[0.18em] text-blue-100">
                  YASH LASER
                </p>

                <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
                  YashFlow Admin
                </h1>

                <p className="text-blue-100 text-sm font-semibold mt-1">
                  Management Control Center
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="rounded-xl bg-white/10 border border-white/15 px-4 py-2.5">
                <p className="text-[11px] font-bold text-blue-100">
                  TODAY
                </p>

                <p className="text-sm font-black text-white mt-0.5">
                  {displayDate}
                </p>
              </div>

              <div className="flex gap-2 items-center">
                {adminId && (
                  <AdminNotificationBell employeeId={adminId} />
                )}

                <button
                  type="button"
                  onClick={loadDashboardCounts}
                  disabled={refreshing}
                  className="yf-btn bg-white/15 border-white/20 text-white hover:bg-white/25 disabled:opacity-60"
                >
                  <span>↻</span>
                  {refreshing ? "Refreshing..." : "Refresh"}
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 font-bold shadow-sm">
            {message}
          </div>
        )}

        <section className="yf-card overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-blue-300">
                  LIVE OPERATIONS
                </p>

                <h2 className="text-2xl font-black mt-1">
                  Today at a Glance
                </h2>

                <p className="text-sm text-slate-300 mt-1">
                  Staff, attendance, leave and production status in one view.
                </p>
              </div>

              <span className="yf-badge bg-white/10 text-white border border-white/15">
                Live Data
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="yf-summary-grid">
              <SummaryCard
                title="Total Staff"
                value={counts.totalStaff}
                subtitle={`${counts.pendingEmployees} approval pending`}
                tone="blue"
                icon="👥"
              />

              <SummaryCard
                title="Present Today"
                value={counts.presentToday}
                subtitle="Checked-in staff"
                tone="green"
                icon="🟢"
              />

              <SummaryCard
                title="Leave Today"
                value={counts.leaveToday}
                subtitle={`${counts.pendingLeave} leave request pending`}
                tone="purple"
                icon="🗓️"
              />

              <SummaryCard
                title="Pending Approval"
                value={counts.pendingAttendance}
                subtitle="Late / Half Day / Manual Punch"
                tone="orange"
                icon="✅"
              />

              <SummaryCard
                title="Open Orders"
                value={counts.openOrders}
                subtitle="Current production work"
                tone="cyan"
                icon="📦"
              />

              <SummaryCard
                title="Completed Orders"
                value={counts.completedOrders}
                subtitle="Total completed"
                tone="green"
                icon="🏁"
              />

              <SummaryCard
                title="Pending Employees"
                value={counts.pendingEmployees}
                subtitle="Registration approval"
                tone="blue"
                icon="🪪"
              />

              <SummaryCard
                title="Pending Leave"
                value={counts.pendingLeave}
                subtitle="Awaiting admin action"
                tone="purple"
                icon="⏳"
              />
            </div>
          </div>
        </section>

        <section className="mt-6 yf-card overflow-hidden">
          <div
            className={`p-5 sm:p-6 border-b ${
              totalAttention > 0
                ? "border-red-200 bg-gradient-to-r from-red-700 to-orange-600 text-white"
                : "border-green-200 bg-gradient-to-r from-emerald-700 to-green-600 text-white"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-white/80">
                  ATTENTION REQUIRED
                </p>

                <h2 className="text-2xl font-black mt-1">
                  {totalAttention > 0
                    ? "Items Need Your Attention"
                    : "All Clear"}
                </h2>

                <p className="text-sm text-white/80 mt-1">
                  Overdue work, approvals, attendance અને stock alerts એક જગ્યાએ.
                </p>
              </div>

              <span className="inline-flex w-fit rounded-full bg-white/15 border border-white/20 px-4 py-2 text-sm font-black">
                {totalAttention} Attention Items
              </span>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <AttentionCard
                href="/admin/orders"
                title="Overdue Orders"
                value={attentionCounts.overdueOrders}
                description="Due date પસાર થયેલા open orders."
                icon="🚨"
                tone={
                  attentionCounts.overdueOrders > 0
                    ? "orange"
                    : "slate"
                }
              />

              <AttentionCard
                href="/admin/orders"
                title="Delayed Workflow"
                value={attentionCounts.delayedWorkflow}
                description="Configured delay limit કરતાં લાંબા સમયથી અટકેલા stages."
                icon="⏱️"
                tone={
                  attentionCounts.delayedWorkflow > 0
                    ? "orange"
                    : "slate"
                }
              />

              <AttentionCard
                href="/admin/tasks"
                title="Overdue Tasks"
                value={attentionCounts.overdueTasks}
                description="Pending / In Progress tasks જેની due date પસાર થઈ ગઈ છે."
                icon="📋"
                tone={
                  attentionCounts.overdueTasks > 0
                    ? "purple"
                    : "slate"
                }
              />

              <AttentionCard
                href={pendingApprovalRoute}
                title="All Pending Approvals"
                value={totalApprovals}
                description={`Attendance ${counts.pendingAttendance} • Leave ${counts.pendingLeave} • Staff ${counts.pendingEmployees} • Workflow ${attentionCounts.readyForApproval}`}
                icon="✅"
                tone={
                  totalApprovals > 0
                    ? "blue"
                    : "slate"
                }
              />

              <AttentionCard
                href="/admin/attendance"
                title="Missing Attendance"
                value={attentionCounts.missingAttendance}
                description="Active non-admin staff: attendance નથી અને approved leave પણ નથી."
                icon="🕘"
                tone={
                  attentionCounts.missingAttendance > 0
                    ? "orange"
                    : "slate"
                }
              />

              <AttentionCard
                href="/admin/inventory"
                title="Low Stock"
                value={attentionCounts.lowStock}
                description="Minimum stock level અથવા તેનાથી નીચે આવેલા active materials."
                icon="📦"
                tone={
                  attentionCounts.lowStock > 0
                    ? "orange"
                    : "slate"
                }
              />
            </div>

            {totalApprovals > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {counts.pendingAttendance > 0 && (
                  <Link
                    href="/admin/attendance-approval"
                    className="yf-btn yf-btn-secondary"
                  >
                    Attendance Approval ({counts.pendingAttendance}) →
                  </Link>
                )}

                {counts.pendingLeave > 0 && (
                  <Link
                    href="/admin/leave"
                    className="yf-btn yf-btn-secondary"
                  >
                    Leave Approval ({counts.pendingLeave}) →
                  </Link>
                )}

                {counts.pendingEmployees > 0 && (
                  <Link
                    href="/admin/employees"
                    className="yf-btn yf-btn-secondary"
                  >
                    Employee Approval ({counts.pendingEmployees}) →
                  </Link>
                )}

                {attentionCounts.readyForApproval > 0 && (
                  <Link
                    href="/admin/orders"
                    className="yf-btn yf-btn-secondary"
                  >
                    Workflow Approval ({attentionCounts.readyForApproval}) →
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 yf-card p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.15em] text-cyan-700">
                PRODUCTION FLOW
              </p>

              <h2 className="yf-section-title mt-1">
                Order Workflow
              </h2>

              <p className="yf-section-subtitle mt-1">
                Orders currently waiting at each production stage.
              </p>
            </div>

            <Link
              href="/admin/orders"
              className="yf-btn yf-btn-primary"
            >
              Open Orders →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-5">
            <WorkflowCard
              title="Design"
              value={counts.design}
              tone="blue"
              icon="🎨"
              subtitle="Current stage"
            />

            <WorkflowCard
              title="Cutting"
              value={counts.cutting}
              tone="orange"
              icon="✂️"
              subtitle="Current stage"
            />

            <WorkflowCard
              title="Production"
              value={counts.production}
              tone="purple"
              icon="🏭"
              subtitle="Current stage"
            />

            <WorkflowCard
              title="Packing"
              value={counts.packing}
              tone="slate"
              icon="📦"
              subtitle="Current stage"
            />

            <WorkflowCard
              title="Transportation"
              value={counts.transportation}
              tone="cyan"
              icon="🚚"
              subtitle="Transportation / Dispatch"
            />
          </div>
        </section>

        <section className="mt-6 yf-card p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                ADMIN TOOLS
              </p>

              <h2 className="yf-section-title mt-1">
                Management Modules
              </h2>

              <p className="yf-section-subtitle mt-1">
                Daily workની priority પ્રમાણે modules ગોઠવેલા છે.
              </p>
            </div>

            <span className="yf-badge yf-badge-blue">
              14 Modules
            </span>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
            <ModuleCard
              href="/admin/orders"
              label="ORDERS"
              title="Order Management"
              description="Orders create કરો અને production workflow track કરો."
              icon="📦"
              tone="cyan"
              badge={`${counts.openOrders} Open`}
            />

            <ModuleCard
              href="/admin/tasks"
              label="TASKS"
              title="Task Management"
              description="Employeeને task assign કરો અને progress track કરો."
              icon="📋"
              tone="purple"
            />

            <ModuleCard
              href="/admin/employees"
              label="STAFF"
              title="Employee Approval"
              description="Employee approve/reject અને departments manage કરો."
              icon="👥"
              tone="blue"
              badge={
                counts.pendingEmployees > 0
                  ? `${counts.pendingEmployees} Pending`
                  : undefined
              }
            />

            <ModuleCard
              href="/admin/attendance"
              label="ATTENDANCE"
              title="Attendance Management"
              description="Check In/Out, Manual Punch અને daily status જુઓ."
              icon="🕘"
              tone="green"
              badge={`${counts.presentToday} Present`}
            />

            <ModuleCard
              href="/admin/work-calendar"
              label="CALENDAR"
              title="Work Calendar"
              description="Daily staff availability, present, leave અને missing attendance જુઓ."
              icon="🗓️"
              tone="cyan"
            />

            <ModuleCard
              href="/admin/attendance-approval"
              label="APPROVAL"
              title="Attendance Approval"
              description="Late અને Half Day attendance approve/reject કરો."
              icon="✅"
              tone="orange"
              badge={
                counts.pendingAttendance > 0
                  ? `${counts.pendingAttendance} Pending`
                  : undefined
              }
            />

            <ModuleCard
              href="/admin/leave"
              label="LEAVE"
              title="Leave Management"
              description="Leave requests approve/reject કરો."
              icon="🗓️"
              tone="purple"
              badge={
                counts.pendingLeave > 0
                  ? `${counts.pendingLeave} Pending`
                  : undefined
              }
            />

            <ModuleCard
              href="/admin/holidays"
              label="HOLIDAYS"
              title="Holiday Management"
              description="Company holidays add/edit/activate કરો."
              icon="📅"
              tone="green"
            />

            <ModuleCard
              href="/admin/attendance-report"
              label="REPORTS"
              title="Monthly Attendance Report"
              description="Monthly attendance, leave અને working hours જુઓ."
              icon="📊"
              tone="blue"
            />

            <ModuleCard
              href="/admin/performance"
              label="PERFORMANCE"
              title="Team Performance"
              description="Employee-wise completed stages, tasks, attendance અને working hours compare કરો."
              icon="🏆"
              tone="green"
            />

            <ModuleCard
              href="/admin/products"
              label="PRODUCTS"
              title="Product Master"
              description="Products અને dynamic customization options manage કરો."
              icon="🧩"
              tone="purple"
            />

            <ModuleCard
              href="/admin/inventory"
              label="INVENTORY"
              title="Inventory Management"
              description="Inventory items અને stock movement manage કરો."
              icon="🏷️"
              tone="slate"
            />

            <ModuleCard
              href="/dashboard/purchase"
              label="PURCHASE"
              title="Purchase Management"
              description="Supplier purchase orders બનાવો અને material receive કરતાં stock auto update કરો."
              icon="🛒"
              tone="orange"
            />

            <ModuleCard
              href="/dashboard/dispatch"
              label="DISPATCH"
              title="Dispatch Management"
              description="Completed ordersને Ready, Packed, Dispatched અને Delivered statusથી track કરો."
              icon="🚚"
              tone="blue"
            />
          </div>
        </section>

        <div className="py-6 text-center">
          <p className="text-xs font-bold text-slate-400">
            YashFlow • Yash Laser Work Management
          </p>
        </div>
      </div>
    </main>
  );
}
