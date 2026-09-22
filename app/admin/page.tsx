"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import AdminNotificationBell from "./AdminNotificationBell";

type AnyRow = Record<string, any>;

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

type DrawerItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
};

type DrawerState = {
  open: boolean;
  title: string;
  subtitle: string;
  items: DrawerItem[];
  href?: Route;
  hrefLabel?: string;
};

type DashboardDetails = {
  totalStaff: DrawerItem[];
  presentToday: DrawerItem[];
  leaveToday: DrawerItem[];
  pendingAttendance: DrawerItem[];
  openOrders: DrawerItem[];
  completedOrders: DrawerItem[];
  pendingEmployees: DrawerItem[];
  pendingLeave: DrawerItem[];
  overdueOrders: DrawerItem[];
  delayedWorkflow: DrawerItem[];
  overdueTasks: DrawerItem[];
  readyForApproval: DrawerItem[];
  missingAttendance: DrawerItem[];
  lowStock: DrawerItem[];
  design: DrawerItem[];
  cutting: DrawerItem[];
  production: DrawerItem[];
  packing: DrawerItem[];
  transportation: DrawerItem[];
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

const initialAttentionCounts: AttentionCounts = {
  overdueOrders: 0,
  delayedWorkflow: 0,
  overdueTasks: 0,
  readyForApproval: 0,
  missingAttendance: 0,
  lowStock: 0,
};

const emptyDetails: DashboardDetails = {
  totalStaff: [],
  presentToday: [],
  leaveToday: [],
  pendingAttendance: [],
  openOrders: [],
  completedOrders: [],
  pendingEmployees: [],
  pendingLeave: [],
  overdueOrders: [],
  delayedWorkflow: [],
  overdueTasks: [],
  readyForApproval: [],
  missingAttendance: [],
  lowStock: [],
  design: [],
  cutting: [],
  production: [],
  packing: [],
  transportation: [],
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

function formatDateTime(value: unknown) {
  if (!value) return "-";

  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function firstValue(row: AnyRow, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
}

function orderNumber(order: AnyRow) {
  return (
    firstValue(order, ["order_number", "order_no", "order_code"]) ||
    `#${String(order.id || "").slice(0, 8)}`
  );
}

function customerName(order: AnyRow) {
  return (
    firstValue(order, [
      "customer_name",
      "customer",
      "client_name",
      "party_name",
    ]) || "Customer"
  );
}

function productName(order: AnyRow) {
  return (
    firstValue(order, [
      "product_name",
      "product",
      "order_type",
      "product_type",
    ]) || "Order"
  );
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
  onClick,
}: {
  title: string;
  value: number;
  subtitle: string;
  tone: Tone;
  icon: string;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`yf-card yf-card-hover relative overflow-hidden p-4 text-left w-full ${styles.shell}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${styles.line}`} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[11px] font-black tracking-wide ${styles.label}`}>
            {title.toUpperCase()}
          </p>

          <p className={`text-3xl font-black mt-1 ${styles.value}`}>
            {value}
          </p>
        </div>

        <div
          className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg ${styles.icon}`}
        >
          {icon}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[11px] font-semibold text-slate-500 line-clamp-1">
          {subtitle}
        </p>
        <span className={`text-xs font-black ${styles.label}`}>View ›</span>
      </div>
    </button>
  );
}

function WorkflowCard({
  title,
  value,
  tone,
  icon,
  subtitle,
  onClick,
}: {
  title: string;
  value: number;
  tone: Tone;
  icon: string;
  subtitle: string;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`yf-card yf-card-hover p-3 text-left w-full ${styles.shell}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-base ${styles.icon}`}
        >
          {icon}
        </div>

        <span className={`text-2xl font-black ${styles.value}`}>
          {value}
        </span>
      </div>

      <h3 className="font-black text-sm text-slate-900 mt-3">{title}</h3>

      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-[10px] font-semibold text-slate-500">
          {subtitle}
        </p>
        <span className={`text-[10px] font-black ${styles.label}`}>View ›</span>
      </div>
    </button>
  );
}

function AttentionCard({
  title,
  value,
  description,
  icon,
  tone,
  onClick,
}: {
  title: string;
  value: number;
  description: string;
  icon: string;
  tone: Tone;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`yf-card yf-card-hover group relative overflow-hidden p-4 text-left w-full ${styles.shell}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${styles.line}`} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] font-black tracking-wide ${styles.label}`}>
            {title.toUpperCase()}
          </p>

          <p className={`text-3xl font-black mt-1 ${styles.value}`}>
            {value}
          </p>

          <p className="text-[11px] font-semibold text-slate-500 mt-1 leading-4 line-clamp-2">
            {description}
          </p>
        </div>

        <div
          className={`w-10 h-10 shrink-0 rounded-2xl flex items-center justify-center text-lg ${styles.icon}`}
        >
          {icon}
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200/70 pt-2 flex items-center justify-between">
        <span className={`text-[11px] font-black ${styles.label}`}>
          View Details
        </span>
        <span className={`font-black ${styles.label}`}>›</span>
      </div>
    </button>
  );
}

function ToolButton({
  href,
  label,
  icon,
  badge,
}: {
  href: Route;
  label: string;
  icon: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition min-h-[92px]"
    >
      {badge && (
        <span className="absolute right-2 top-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-black flex items-center justify-center">
          {badge}
        </span>
      )}

      <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">
        {icon}
      </div>

      <span className="text-[11px] sm:text-xs font-black text-slate-700 text-center leading-tight">
        {label}
      </span>
    </Link>
  );
}

function DetailDrawer({
  state,
  onClose,
}: {
  state: DrawerState;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!state.open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [state.open, onClose]);

  if (!state.open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
      />

      <section className="relative z-10 w-full max-w-xl max-h-[86dvh] rounded-3xl overflow-hidden bg-slate-50 shadow-2xl border border-white/30 flex flex-col">
        <div className="yf-brand-panel text-white px-4 py-3 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black tracking-[0.16em] text-[#d4af37]">
                QUICK DETAILS
              </p>
              <h2 className="text-lg font-black mt-0.5 leading-tight">
                {state.title}
              </h2>
              <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-1">
                {state.subtitle}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 text-lg font-black shrink-0"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {state.items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
              <div className="text-2xl">✅</div>
              <p className="font-black text-slate-800 mt-2">No records found</p>
              <p className="text-[11px] text-slate-500 mt-1">
                આ count માટે હાલમાં કોઈ matching record નથી.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {state.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-xs text-slate-900 break-words">
                        {item.title}
                      </p>

                      {item.subtitle && (
                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5 break-words">
                          {item.subtitle}
                        </p>
                      )}

                      {item.meta && (
                        <p className="text-[10px] text-slate-500 mt-1 break-words line-clamp-2">
                          {item.meta}
                        </p>
                      )}
                    </div>

                    {item.badge && (
                      <span className="shrink-0 rounded-full bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 text-[9px] font-black">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white p-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="yf-btn yf-btn-secondary justify-center"
          >
            Close
          </button>

          {state.href ? (
            <Link
              href={state.href}
              onClick={onClose}
              className="yf-btn yf-btn-primary justify-center"
            >
              {state.hrefLabel || "View"} →
            </Link>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="yf-btn yf-btn-primary justify-center"
            >
              View ✓
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();

  const [counts, setCounts] = useState<DashboardCounts>(initialCounts);
  const [attentionCounts, setAttentionCounts] = useState<AttentionCounts>(
    initialAttentionCounts
  );
  const [details, setDetails] = useState<DashboardDetails>(emptyDetails);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>({
    open: false,
    title: "",
    subtitle: "",
    items: [],
  });
  const [todayGlanceOpen, setTodayGlanceOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [productionFlowOpen, setProductionFlowOpen] = useState(false);

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

  function openDrawer(
    title: string,
    subtitle: string,
    items: DrawerItem[],
    href?: Route,
    hrefLabel?: string
  ) {
    setDrawer({
      open: true,
      title,
      subtitle,
      items,
      href,
      hrefLabel,
    });
  }

  function closeDrawer() {
    setDrawer((prev) => ({ ...prev, open: false }));
  }

  async function scanStuckAlerts() {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    const response = await fetch("/api/admin/stuck-work-scan", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      console.warn(
        "Stuck Alert Scan Error:",
        result.error || response.statusText
      );
    }
  }

  async function refreshDashboard() {
    await loadDashboardCounts();
    await scanStuckAlerts();
  }

  async function loadDashboardCounts() {
    const supabase = createClient();

    setRefreshing(true);
    setMessage("");

    const [
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
      workflowStagesResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("*")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_hidden", false),
        

      supabase
        .from("employees")
        .select("*")
        .eq("approval_status", "pending")
        .eq("is_hidden", false),

      supabase
        .from("attendance")
        .select("*")
        .eq("attendance_date", today),

      supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),

      supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "pending"),

      supabase
        .from("attendance")
        .select("*")
        .eq("approval_required", true)
        .eq("approval_status", "pending"),

      supabase
        .from("manual_attendance_requests")
        .select("*")
        .eq("status", "pending"),

      supabase.from("orders").select("*"),

      supabase.from("tasks").select("*"),

      supabase.from("order_stage_work").select("*"),

      supabase
        .from("workflow_delay_settings")
        .select("status, delay_minutes, enabled"),

      supabase
        .from("inventory_items")
        .select("*")
        .eq("is_active", true),

      supabase.from("workflow_stages").select("id, code, name"),
    ]);

    const firstError =
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
      inventoryResult.error ||
      workflowStagesResult.error;

    if (firstError) {
      setMessage(`Dashboard Load Error: ${firstError.message}`);
      setRefreshing(false);
      return;
    }

const activeEmployees = (activeEmployeesResult.data || []) as AnyRow[];
const pendingEmployees = (pendingEmployeesResult.data || []) as AnyRow[];

const visibleEmployeeIds = new Set([
  ...activeEmployees.map((employee) => employee.id),
  ...pendingEmployees.map((employee) => employee.id),
]);

const attendanceRows = ((attendanceResult.data || []) as AnyRow[]).filter(
  (row) => visibleEmployeeIds.has(row.employee_id)
);

const leaveTodayRows = ((leaveTodayResult.data || []) as AnyRow[]).filter(
  (row) => visibleEmployeeIds.has(row.employee_id)
);

const pendingLeaveRows = ((pendingLeaveResult.data || []) as AnyRow[]).filter(
  (row) => visibleEmployeeIds.has(row.employee_id)
);

const pendingAttendanceRows = (
  (pendingAttendanceResult.data || []) as AnyRow[]
).filter((row) => visibleEmployeeIds.has(row.employee_id));

const manualPunchRows = (
  (manualPunchPendingResult.data || []) as AnyRow[]
).filter((row) => visibleEmployeeIds.has(row.employee_id));
    const orderRows = (ordersResult.data || []) as AnyRow[];
    const taskRows = (tasksResult.data || []) as AnyRow[];
    const stageRows = (stageWorksResult.data || []) as AnyRow[];
    const inventoryRows = (inventoryResult.data || []) as AnyRow[];
    const workflowStageRows = (workflowStagesResult.data || []) as AnyRow[];

    const employeeMap = new Map(
      activeEmployees.map((employee) => [
        employee.id,
        firstValue(employee, ["full_name", "name"]) || "Employee",
      ])
    );

    for (const employee of pendingEmployees) {
      if (!employeeMap.has(employee.id)) {
        employeeMap.set(
          employee.id,
          firstValue(employee, ["full_name", "name"]) || "Employee"
        );
      }
    }

    const orderMap = new Map(orderRows.map((order) => [order.id, order]));
    const stageNameMap = new Map<string, string>();

    for (const stage of workflowStageRows) {
      if (stage.id) stageNameMap.set(String(stage.id), String(stage.name || stage.code || "Stage"));
      if (stage.code) stageNameMap.set(String(stage.code), String(stage.name || stage.code));
    }

    const presentRows = attendanceRows.filter(
      (row) => row.approval_status !== "rejected"
    );

    const leaveEmployeeIds = new Set(
      leaveTodayRows.map((row) => row.employee_id).filter(Boolean)
    );

    const presentEmployeeIds = new Set(
      presentRows.map((row) => row.employee_id).filter(Boolean)
    );

    const openOrderRows = orderRows.filter((order) => {
      const stage = String(order.current_stage || "");
      const workflowStatus = String(order.workflow_status || "");

      return (
        stage !== "completed" &&
        stage !== "cancelled" &&
        workflowStatus !== "completed" &&
        workflowStatus !== "cancelled"
      );
    });

    const completedOrderRows = orderRows.filter((order) => {
      return (
        order.current_stage === "completed" ||
        order.workflow_status === "completed"
      );
    });

    const stageOrders = (stageCode: string) =>
      openOrderRows.filter((order) => order.current_stage === stageCode);

    const overdueOrderRows = openOrderRows.filter((order) => {
      return !!order.due_date && String(order.due_date) < today;
    });

    const overdueTaskRows = taskRows.filter((task) => {
      return (
        !!task.due_date &&
        String(task.due_date) < today &&
        (task.status === "pending" || task.status === "in_progress")
      );
    });

    const readyApprovalRows = stageRows.filter(
      (work) => work.status === "ready_for_approval"
    );

    const delaySettings = new Map(
      ((delaySettingsResult.data || []) as DelaySetting[])
        .filter((item) => item.enabled)
        .map((item) => [item.status, item.delay_minutes])
    );

    const nowMs = Date.now();

    const delayedStageRows = stageRows.filter((work) => {
      const delayMinutes = delaySettings.get(work.status);

      if (!delayMinutes || !work.status_changed_at) {
        return false;
      }

      const changedAtMs = new Date(work.status_changed_at).getTime();

      if (!Number.isFinite(changedAtMs)) {
        return false;
      }

      return nowMs - changedAtMs >= delayMinutes * 60 * 1000;
    });

    const missingEmployeeRows = activeEmployees.filter((employee) => {
      if (employee.role === "admin") return false;

      return (
        !presentEmployeeIds.has(employee.id) &&
        !leaveEmployeeIds.has(employee.id)
      );
    });

    const lowStockRows = inventoryRows.filter(
      (item) =>
        Number(item.current_stock || 0) <=
        Number(item.minimum_stock || 0)
    );

    function employeeItems(rows: AnyRow[]): DrawerItem[] {
      return rows.map((employee) => ({
        id: String(employee.id),
        title: firstValue(employee, ["full_name", "name"]) || "Employee",
        subtitle:
          [
            firstValue(employee, ["department"]),
            firstValue(employee, ["role"]),
          ]
            .filter(Boolean)
            .join(" • ") || "Employee",
        meta:
          firstValue(employee, ["mobile", "phone", "phone_number"]) ||
          firstValue(employee, ["approval_status"]) ||
          "",
        badge: employee.is_active === false ? "Inactive" : "Active",
      }));
    }

    function attendanceItems(rows: AnyRow[]): DrawerItem[] {
      return rows.map((row) => {
        const employee = employeeMap.get(row.employee_id) || "Employee";
        const inTime = firstValue(row, [
          "check_in",
          "check_in_time",
          "punch_in",
          "punch_in_at",
        ]);
        const outTime = firstValue(row, [
          "check_out",
          "check_out_time",
          "punch_out",
          "punch_out_at",
        ]);

        return {
          id: String(row.id),
          title: employee,
          subtitle:
            firstValue(row, ["attendance_status", "status"]) ||
            "Attendance",
          meta: `In: ${formatDateTime(inTime)} • Out: ${formatDateTime(outTime)}`,
          badge: firstValue(row, ["approval_status"]) || "Recorded",
        };
      });
    }

    function leaveItems(rows: AnyRow[]): DrawerItem[] {
      return rows.map((row) => ({
        id: String(row.id),
        title: employeeMap.get(row.employee_id) || "Employee",
        subtitle:
          firstValue(row, ["leave_type", "reason"]) || "Leave Request",
        meta: `${firstValue(row, ["start_date"]) || "-"} → ${
          firstValue(row, ["end_date"]) || "-"
        }`,
        badge: firstValue(row, ["status"]) || "Leave",
      }));
    }

    function orderItems(rows: AnyRow[]): DrawerItem[] {
      return rows.map((order) => ({
        id: String(order.id),
        title: `${orderNumber(order)} • ${customerName(order)}`,
        subtitle: productName(order),
        meta: `Stage: ${
          stageNameMap.get(String(order.current_stage)) ||
          firstValue(order, ["current_stage"]) ||
          "-"
        } • Due: ${firstValue(order, ["due_date"]) || "-"}`,
        badge:
          firstValue(order, ["workflow_status", "status"]) ||
          firstValue(order, ["current_stage"]) ||
          "Order",
      }));
    }

    function taskItems(rows: AnyRow[]): DrawerItem[] {
      return rows.map((task) => ({
        id: String(task.id),
        title: firstValue(task, ["title"]) || "Task",
        subtitle:
          employeeMap.get(task.assigned_to) ||
          firstValue(task, ["assigned_to"]) ||
          "Unassigned",
        meta: `Due: ${firstValue(task, ["due_date"]) || "-"} • Priority: ${
          firstValue(task, ["priority"]) || "-"
        }`,
        badge: firstValue(task, ["status"]) || "Task",
      }));
    }

    function stageWorkItems(rows: AnyRow[]): DrawerItem[] {
      return rows.map((work) => {
        const order = orderMap.get(work.order_id) || {};
        const stageName =
          stageNameMap.get(String(work.stage_id)) ||
          firstValue(order, ["current_stage"]) ||
          "Stage";

        return {
          id: String(work.id),
          title: `${orderNumber(order)} • ${stageName}`,
          subtitle:
            work.primary_employee_id
              ? employeeMap.get(work.primary_employee_id) || "Assigned Employee"
              : "No Employee Assigned",
          meta: `Status since: ${formatDateTime(work.status_changed_at)}`,
          badge: firstValue(work, ["status"]) || "Stage",
        };
      });
    }

    const pendingAttendanceItems: DrawerItem[] = [
      ...attendanceItems(pendingAttendanceRows),
      ...manualPunchRows.map((row) => ({
        id: `manual-${row.id}`,
        title: employeeMap.get(row.employee_id) || "Employee",
        subtitle: "Manual Punch Request",
        meta: firstValue(row, ["reason", "note", "request_type"]) || "",
        badge: "Pending",
      })),
    ];

    const nextDetails: DashboardDetails = {
      totalStaff: employeeItems(activeEmployees),
      presentToday: attendanceItems(presentRows),
      leaveToday: leaveItems(leaveTodayRows),
      pendingAttendance: pendingAttendanceItems,
      openOrders: orderItems(openOrderRows),
      completedOrders: orderItems(completedOrderRows),
      pendingEmployees: employeeItems(pendingEmployees),
      pendingLeave: leaveItems(pendingLeaveRows),
      overdueOrders: orderItems(overdueOrderRows),
      delayedWorkflow: stageWorkItems(delayedStageRows),
      overdueTasks: taskItems(overdueTaskRows),
      readyForApproval: stageWorkItems(readyApprovalRows),
      missingAttendance: employeeItems(missingEmployeeRows),
      lowStock: lowStockRows.map((item) => ({
        id: String(item.id),
        title: firstValue(item, ["item_name", "name", "material_name"]) || "Inventory Item",
        subtitle: `Current: ${Number(item.current_stock || 0)} • Minimum: ${Number(
          item.minimum_stock || 0
        )}`,
        meta: firstValue(item, ["unit", "sku", "code"]) || "",
        badge:
          Number(item.current_stock || 0) <= 0 ? "Out of Stock" : "Low Stock",
      })),
      design: orderItems(stageOrders("design")),
      cutting: orderItems(stageOrders("cutting")),
      production: orderItems(stageOrders("production")),
      packing: orderItems(stageOrders("packing")),
      transportation: orderItems(stageOrders("transportation_dispatch")),
    };

    setDetails(nextDetails);

    setCounts({
      totalStaff: nextDetails.totalStaff.length,
      pendingEmployees: nextDetails.pendingEmployees.length,
      presentToday: nextDetails.presentToday.length,
      leaveToday: nextDetails.leaveToday.length,
      pendingLeave: nextDetails.pendingLeave.length,
      pendingAttendance: nextDetails.pendingAttendance.length,
      openOrders: nextDetails.openOrders.length,
      completedOrders: nextDetails.completedOrders.length,
      design: nextDetails.design.length,
      cutting: nextDetails.cutting.length,
      production: nextDetails.production.length,
      packing: nextDetails.packing.length,
      transportation: nextDetails.transportation.length,
    });

    setAttentionCounts({
      overdueOrders: nextDetails.overdueOrders.length,
      delayedWorkflow: nextDetails.delayedWorkflow.length,
      overdueTasks: nextDetails.overdueTasks.length,
      readyForApproval: nextDetails.readyForApproval.length,
      missingAttendance: nextDetails.missingAttendance.length,
      lowStock: nextDetails.lowStock.length,
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

      setAdminId(adminProfile.id);

      await loadDashboardCounts();
      void scanStuckAlerts();
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
      <DetailDrawer state={drawer} onClose={closeDrawer} />

      <header className="yf-header">
        <div className="yf-container py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white border border-[#d4af37]/50 flex items-center justify-center shadow-sm overflow-hidden p-1">
                <img
                  src="/yashflow-logo.png"
                  alt="Yash Laser"
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <p className="text-[10px] font-black tracking-[0.18em] text-slate-200">
                  YASH LASER
                </p>
                <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                  YashFlow Admin
                </h1>
                <p className="text-slate-200 text-xs font-semibold mt-0.5">
                  Management Control Center
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2">
                <p className="text-[9px] font-bold text-slate-200">TODAY</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {displayDate}
                </p>
              </div>

              {adminId && <AdminNotificationBell employeeId={adminId} />}

              <button
                type="button"
                onClick={refreshDashboard}
                disabled={refreshing}
                className="yf-btn bg-white/15 border-white/20 text-white hover:bg-white/25 disabled:opacity-60"
              >
                ↻ {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="yf-btn bg-white text-[#1a2b4c] hover:bg-[#fbf6e7]"
              >
                Logout
              </button>
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
          <button
            type="button"
            onClick={() => setTodayGlanceOpen((current) => !current)}
            aria-expanded={todayGlanceOpen}
            className="w-full p-4 border-b border-slate-200 yf-brand-panel text-white text-left"
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.15em] text-[#d4af37]">
                  LIVE OPERATIONS
                </p>
                <h2 className="text-xl font-black mt-0.5">Today at a Glance</h2>
              </div>

              <span className="text-[10px] font-black rounded-full bg-white/10 border border-white/15 px-3 py-1.5">
                {todayGlanceOpen ? "Close ▲" : "Open ▼"}
              </span>
            </div>
          </button>

          {todayGlanceOpen && (
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              <SummaryCard
                title="Total Staff"
                value={counts.totalStaff}
                subtitle={`${counts.pendingEmployees} approval pending`}
                tone="blue"
                icon="👥"
                onClick={() =>
                  openDrawer(
                    "Total Staff",
                    "All approved active Employees",
                    details.totalStaff,
                    "/admin/employees",
                    "Employees"
                  )
                }
              />

              <SummaryCard
                title="Present Today"
                value={counts.presentToday}
                subtitle="Checked-in Employees"
                tone="green"
                icon="🟢"
                onClick={() =>
                  openDrawer(
                    "Present Today",
                    "Today attendance records",
                    details.presentToday,
                    "/admin/attendance",
                    "Attendance"
                  )
                }
              />

              <SummaryCard
                title="Leave Today"
                value={counts.leaveToday}
                subtitle={`${counts.pendingLeave} pending`}
                tone="purple"
                icon="🗓️"
                onClick={() =>
                  openDrawer(
                    "Leave Today",
                    "Approved leave covering today",
                    details.leaveToday,
                    "/admin/leave",
                    "Leave"
                  )
                }
              />

              <SummaryCard
                title="Pending Approval"
                value={counts.pendingAttendance}
                subtitle="Attendance / Manual Punch"
                tone="orange"
                icon="✅"
                onClick={() =>
                  openDrawer(
                    "Pending Attendance Approval",
                    "Late, Half Day and Manual Punch requests",
                    details.pendingAttendance,
                    "/admin/attendance-approval",
                    "Review"
                  )
                }
              />

              <SummaryCard
                title="Open Orders"
                value={counts.openOrders}
                subtitle="Current production work"
                tone="cyan"
                icon="📦"
                onClick={() =>
                  openDrawer(
                    "Open Orders",
                    "All active production orders",
                    details.openOrders,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <SummaryCard
                title="Completed Orders"
                value={counts.completedOrders}
                subtitle="Completed workflow"
                tone="green"
                icon="🏁"
                onClick={() =>
                  openDrawer(
                    "Completed Orders",
                    "Completed orders",
                    details.completedOrders,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <SummaryCard
                title="Pending Employees"
                value={counts.pendingEmployees}
                subtitle="Registration approval"
                tone="blue"
                icon="🪪"
                onClick={() =>
                  openDrawer(
                    "Pending Employees",
                    "Employee registrations waiting for approval",
                    details.pendingEmployees,
                    "/admin/employees",
                    "Review"
                  )
                }
              />

              <SummaryCard
                title="Pending Leave"
                value={counts.pendingLeave}
                subtitle="Awaiting Admin action"
                tone="purple"
                icon="⏳"
                onClick={() =>
                  openDrawer(
                    "Pending Leave",
                    "Leave requests waiting for action",
                    details.pendingLeave,
                    "/admin/leave",
                    "Review"
                  )
                }
              />
            </div>
          </div>
          )}
        </section>

        <section className="mt-4 yf-card overflow-hidden">
          <button
            type="button"
            onClick={() => setAttentionOpen((current) => !current)}
            aria-expanded={attentionOpen}
            className={`w-full text-left p-4 border-b ${
              totalAttention > 0
                ? "border-red-200 bg-gradient-to-r from-red-700 to-orange-600 text-white"
                : "border-green-200 bg-gradient-to-r from-emerald-700 to-green-600 text-white"
            }`}
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.15em] text-white/80">
                  ATTENTION REQUIRED
                </p>
                <h2 className="text-xl font-black mt-0.5">
                  {totalAttention > 0 ? "Items Need Your Attention" : "All Clear"}
                </h2>
                <p className="text-xs text-white/80 mt-1">
                  Tap to {attentionOpen ? "close" : "open"} attention items.
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-white/15 border border-white/20 px-3 py-1.5 text-xs font-black">
                {totalAttention} {attentionOpen ? "▲" : "▼"}
              </span>
            </div>
          </button>

          {attentionOpen && (
          <div className="p-4">
            <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
              <AttentionCard
                title="Overdue Orders"
                value={attentionCounts.overdueOrders}
                description="Due date passed."
                icon="🚨"
                tone={attentionCounts.overdueOrders > 0 ? "orange" : "slate"}
                onClick={() =>
                  openDrawer(
                    "Overdue Orders",
                    "Open orders past due date",
                    details.overdueOrders,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <AttentionCard
                title="Delayed Workflow"
                value={attentionCounts.delayedWorkflow}
                description="Stage delay limit passed."
                icon="⏱️"
                tone={attentionCounts.delayedWorkflow > 0 ? "orange" : "slate"}
                onClick={() =>
                  openDrawer(
                    "Delayed Workflow",
                    "Stages beyond configured delay limit",
                    details.delayedWorkflow,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <AttentionCard
                title="Overdue Tasks"
                value={attentionCounts.overdueTasks}
                description="Pending / In Progress."
                icon="📋"
                tone={attentionCounts.overdueTasks > 0 ? "purple" : "slate"}
                onClick={() =>
                  openDrawer(
                    "Overdue Tasks",
                    "Tasks past due date",
                    details.overdueTasks,
                    "/admin/tasks",
                    "Tasks"
                  )
                }
              />

              <AttentionCard
                title="All Approvals"
                value={totalApprovals}
                description={`Attendance ${counts.pendingAttendance} • Leave ${counts.pendingLeave} • Employee ${counts.pendingEmployees} • Workflow ${attentionCounts.readyForApproval}`}
                icon="✅"
                tone={totalApprovals > 0 ? "blue" : "slate"}
                onClick={() =>
                  openDrawer(
                    "All Pending Approvals",
                    "Attendance, Leave, Employee and Workflow approvals",
                    [
                      ...details.pendingAttendance,
                      ...details.pendingLeave,
                      ...details.pendingEmployees,
                      ...details.readyForApproval,
                    ],
                    pendingApprovalRoute,
                    "Review"
                  )
                }
              />

              <AttentionCard
                title="Missing Attendance"
                value={attentionCounts.missingAttendance}
                description="No attendance / approved leave."
                icon="🕘"
                tone={attentionCounts.missingAttendance > 0 ? "orange" : "slate"}
                onClick={() =>
                  openDrawer(
                    "Missing Attendance",
                    "Active Employees without attendance or approved leave",
                    details.missingAttendance,
                    "/admin/attendance",
                    "Attendance"
                  )
                }
              />

              <AttentionCard
                title="Low Stock"
                value={attentionCounts.lowStock}
                description="At/below minimum stock."
                icon="📦"
                tone={attentionCounts.lowStock > 0 ? "orange" : "slate"}
                onClick={() =>
                  openDrawer(
                    "Low Stock",
                    "Inventory at or below minimum level",
                    details.lowStock,
                    "/admin/inventory",
                    "Inventory"
                  )
                }
              />
            </div>
          </div>
          )}
        </section>

        <section className="mt-4 yf-card overflow-hidden">
          <button
            type="button"
            onClick={() => setProductionFlowOpen((current) => !current)}
            aria-expanded={productionFlowOpen}
            className="w-full text-left p-4 border-b border-slate-200 bg-white"
          >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-black tracking-[0.15em] text-cyan-700">
                  PRODUCTION FLOW
                </p>
                <h2 className="text-xl font-black text-slate-900 mt-0.5">
                  Order Workflow
                </h2>
              </div>

              <span className="text-xs font-black text-cyan-700">
                {productionFlowOpen ? "Close ▲" : "Open ▼"}
              </span>
            </div>
          </button>

          {productionFlowOpen && (
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <WorkflowCard
                title="Design"
                value={counts.design}
                tone="blue"
                icon="🎨"
                subtitle="Current stage"
                onClick={() =>
                  openDrawer(
                    "Design",
                    "Orders currently in Design",
                    details.design,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <WorkflowCard
                title="Cutting"
                value={counts.cutting}
                tone="orange"
                icon="✂️"
                subtitle="Current stage"
                onClick={() =>
                  openDrawer(
                    "Cutting",
                    "Orders currently in Cutting",
                    details.cutting,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <WorkflowCard
                title="Production"
                value={counts.production}
                tone="purple"
                icon="🏭"
                subtitle="Current stage"
                onClick={() =>
                  openDrawer(
                    "Production",
                    "Orders currently in Production",
                    details.production,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <WorkflowCard
                title="Packing"
                value={counts.packing}
                tone="slate"
                icon="📦"
                subtitle="Current stage"
                onClick={() =>
                  openDrawer(
                    "Packing",
                    "Orders currently in Packing",
                    details.packing,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />

              <WorkflowCard
                title="Transportation"
                value={counts.transportation}
                tone="cyan"
                icon="🚚"
                subtitle="Dispatch stage"
                onClick={() =>
                  openDrawer(
                    "Transportation / Dispatch",
                    "Orders currently in Transportation / Dispatch",
                    details.transportation,
                    "/admin/orders",
                    "Orders"
                  )
                }
              />
            </div>
          </div>
          )}
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-cyan-700">
              WORK ORDER & PRODUCTION
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              Production Tools
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-4">
            <ToolButton
              href="/admin/orders"
              label="Orders"
              icon="📦"
              badge={counts.openOrders > 0 ? String(counts.openOrders) : undefined}
            />
            <ToolButton
              href="/admin/completed-orders"
              label="Completed"
              icon="✅"
              badge={counts.completedOrders > 0 ? String(counts.completedOrders) : undefined}
            />
            <ToolButton href="/admin/products" label="Products" icon="🧩" />
            <ToolButton href="/admin/workflow" label="Work Order Settings" icon="⚙️" />
            <ToolButton
              href="/dashboard/manage/order-details"
              label="Order Details"
              icon="🧩"
            />
            <ToolButton href="/admin/task-team" label="Task / Team" icon="👥" />
            <ToolButton href="/admin/id-cards" label="Bulk ID Cards" icon="🪪" />
            <ToolButton href="/completed-tasks" label="Completed Tasks" icon="✅" />
          </div>
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-blue-700">
              STAFF & ATTENDANCE
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              Employee Tools
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-4">
            <ToolButton
              href="/admin/employees"
              label="Employees"
              icon="👥"
              badge={counts.pendingEmployees > 0 ? String(counts.pendingEmployees) : undefined}
            />
            <ToolButton href="/admin/attendance" label="Attendance" icon="🕘" />
            <ToolButton
              href="/admin/attendance-approval"
              label="Approval"
              icon="✅"
              badge={counts.pendingAttendance > 0 ? String(counts.pendingAttendance) : undefined}
            />
            <ToolButton
              href="/admin/leave"
              label="Leave"
              icon="🌴"
              badge={counts.pendingLeave > 0 ? String(counts.pendingLeave) : undefined}
            />
            <ToolButton href="/admin/holidays" label="Holidays" icon="📅" />
            <ToolButton href="/admin/gps-settings" label="GPS" icon="📍" />
            <ToolButton href="/admin/work-calendar" label="Calendar" icon="🗓️" />
            <ToolButton href="/admin/performance" label="Performance" icon="🏆" />
          </div>
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-orange-700">
              PURCHASE & INVENTORY
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              Material Control
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-4">
            <ToolButton href="/dashboard/purchase" label="Purchase" icon="🛒" />
            <ToolButton
              href="/admin/inventory"
              label="Inventory"
              icon="🏷️"
              badge={attentionCounts.lowStock > 0 ? String(attentionCounts.lowStock) : undefined}
            />
            <ToolButton href="/admin/reorder" label="Reorder" icon="🧾" />
          </div>
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-purple-700">
              PACKING & DISPATCH
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              Delivery Flow
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-4">
            <ToolButton href="/dashboard/packing" label="Packing" icon="📦" />
            <ToolButton href="/dashboard/dispatch" label="Dispatch" icon="🚚" />
          </div>
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-green-700">
              ACCOUNTS & REPORTS
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              Reports & Finance
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-4">
            <ToolButton href="/admin/accounts" label="Accounts" icon="💰" />
            <ToolButton href="/admin/attendance-report" label="Attendance Report" icon="📊" />
            <ToolButton href="/admin/reports" label="Export / Reports" icon="📤" />
          </div>
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-rose-700">
              ADMIN CONTROL
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              Control & History
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3 mt-4">
            <ToolButton href="/admin/tasks" label="Tasks" icon="📋" />
            <ToolButton href="/admin/escalations" label="Escalations" icon="🚨" />
            <ToolButton href="/admin/activity" label="Activity History" icon="🕘" />
          </div>
        </section>

        <section className="mt-4 yf-card p-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.15em] text-amber-700">
              ADVANCED TOOLS
            </p>
            <h2 className="text-lg font-black text-slate-900 mt-0.5">
              System & Recovery
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Daily staff work માટે જરૂરી નથી. Admin troubleshooting અને system checks માટે.
            </p>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mt-4">
            <ToolButton href="/admin/files" label="Files" icon="📁" />
            <ToolButton href="/admin/system-audit" label="System Audit" icon="🛡️" />
            <ToolButton href="/admin/recovery" label="Recovery" icon="♻️" />
            <ToolButton href="/admin/readiness" label="Health Check" icon="✅" />
          </div>
        </section>

        <div className="py-5 text-center">
          <p className="text-[10px] font-bold text-slate-400">
            YashFlow • Yash Laser Work Management
          </p>
        </div>
      </div>
    </main>
  );
}
