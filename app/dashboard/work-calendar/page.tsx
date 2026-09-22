"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { canonicalAttendanceMap } from "@/utils/business-rules";

type Employee = {
  id: string;
  full_name: string;
};

type Attendance = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  attendance_type: string;
  status: string;
  late_minutes: number;
  working_minutes: number;
  approval_status: string;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  admin_note?: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  assigned_to: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type StageWork = {
  id: string;
  order_id: string;
  stage_id: string;
  status: string;
  primary_employee_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type StageWorker = {
  order_stage_work_id: string;
  employee_id: string;
  left_at: string | null;
};

type TaskSupportWorker = {
  task_id: string;
  employee_id: string;
  is_active: boolean;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
};

type StageRow = {
  id: string;
  name: string;
};

type Holiday = {
  id: string;
  holiday_date: string;
  holiday_name: string;
  is_active: boolean;
};

type CorrectionRequest = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: "absent_correction" | "late_regularization";
  reason: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  created_at: string;
};

type DayDetails = {
  date: string;
  attendance: Attendance | null;
  approvedLeave: LeaveRequest | null;
  pendingLeave: LeaveRequest | null;
  holiday: Holiday | null;
  isWeeklyOff: boolean;
  tasks: TaskRow[];
  stageWorks: StageWork[];
};

function toDateKey(value: Date, timeZone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey: string) {
  return new Date(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10))
  );
}

function isoDateKey(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value.slice(0, 10);
  }

  return toDateKey(date);
}

function formatTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatMinutes(minutes: number) {
  if (!minutes) return "-";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) return `${mins} min`;
  return `${hours}h ${mins}m`;
}

function dateBetween(
  dateKey: string,
  startValue: string | null,
  endValue: string | null
) {
  if (!startValue && !endValue) return false;

  const start = startValue ? isoDateKey(startValue) : null;
  const end = endValue ? isoDateKey(endValue) : start;

  if (!start) return false;

  return dateKey >= start && dateKey <= (end || start);
}

const MIN_CALENDAR_YEAR = 2026;
const MIN_CALENDAR_MONTH = 8; // September, 0-based

function isBeforeMinimumCalendarMonth(year: number, month: number) {
  return (
    year < MIN_CALENDAR_YEAR ||
    (year === MIN_CALENDAR_YEAR && month < MIN_CALENDAR_MONTH)
  );
}

export default function EmployeeWorkCalendarPage() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRequest[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [stageWorkRows, setStageWorkRows] = useState<StageWork[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weeklyOffDay, setWeeklyOffDay] = useState(0);
  const [correctionRows, setCorrectionRows] = useState<CorrectionRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    function handleNativeBack(event: Event) {
      if (!selectedDate) return;
      event.preventDefault();
      setSelectedDate(null);
      setRequestMode(null);
    }

    window.addEventListener("yashflow:native-back", handleNativeBack as EventListener);
    return () =>
      window.removeEventListener("yashflow:native-back", handleNativeBack as EventListener);
  }, [selectedDate]);

  const [requestMode, setRequestMode] = useState<
    "absent_correction" | "late_regularization" | "leave" | null
  >(null);
  const [requestReason, setRequestReason] = useState("");
  const [requestCheckIn, setRequestCheckIn] = useState("09:00");
  const [requestCheckOut, setRequestCheckOut] = useState("18:00");
  const [leaveType, setLeaveType] = useState<
    "full_day" | "first_half" | "second_half"
  >("full_day");
  const [requestSaving, setRequestSaving] = useState(false);

  const today = useMemo(() => toDateKey(new Date()), []);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const nextMonthDate = new Date(year, month + 1, 1);
  const monthEndDate = new Date(year, month + 1, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(
    monthEndDate.getMonth() + 1
  ).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

  const monthTitle = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(monthCursor);

  const attendanceMap = useMemo(
    () =>
      new Map(
        attendanceRows.map((row) => [row.attendance_date, row])
      ),
    [attendanceRows]
  );

  const orderMap = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders]
  );

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages]
  );

  const holidayMap = useMemo(
    () =>
      new Map(
        holidays.map((holiday) => [
          holiday.holiday_date,
          holiday,
        ])
      ),
    [holidays]
  );

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: Array<string | null> = [];

    for (let i = 0; i < firstDayIndex; i += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(
          2,
          "0"
        )}`
      );
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [year, month]);

  function isWeeklyOff(dateKey: string) {
    return dateFromKey(dateKey).getDay() === weeklyOffDay;
  }

  function approvedLeaveForDate(dateKey: string) {
    return (
      leaveRows.find(
        (row) =>
          row.status === "approved" &&
          dateKey >= row.start_date &&
          dateKey <= row.end_date
      ) || null
    );
  }

  function pendingLeaveForDate(dateKey: string) {
    return (
      leaveRows.find(
        (row) =>
          row.status === "pending" &&
          dateKey >= row.start_date &&
          dateKey <= row.end_date
      ) || null
    );
  }

  function tasksForDate(dateKey: string) {
    return taskRows.filter((task) => {
      if (task.started_at || task.completed_at) {
        return dateBetween(
          dateKey,
          task.started_at || task.completed_at,
          task.completed_at || task.started_at
        );
      }

      return task.due_date === dateKey;
    });
  }

  function completedTasksForDate(dateKey: string) {
    return taskRows.filter(
      (task) =>
        task.status === "completed" &&
        isoDateKey(task.completed_at) === dateKey
    );
  }

  function stageWorksForDate(dateKey: string) {
    return stageWorkRows.filter((work) =>
      dateBetween(
        dateKey,
        work.started_at || work.created_at,
        work.completed_at || work.started_at || work.created_at
      )
    );
  }

  function correctionForDate(dateKey: string) {
    return (
      correctionRows
        .filter((row) => row.attendance_date === dateKey)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
    );
  }

  function dayStatus(dateKey: string) {
    const attendance = attendanceMap.get(dateKey) || null;
    const approvedLeave = approvedLeaveForDate(dateKey);
    const pendingLeave = pendingLeaveForDate(dateKey);
    const holiday = holidayMap.get(dateKey) || null;
    const weeklyOff = isWeeklyOff(dateKey);

    // Actual attendance has highest priority.
    if (attendance) {
      if (attendance.attendance_type === "half_day") {
        return {
          label: "Half Day",
          short: "½",
          cell: "bg-amber-50 border-amber-200",
          badge: "bg-amber-100 text-amber-800",
        };
      }

      if (attendance.attendance_type === "late") {
        return {
          label: "Late",
          short: "LT",
          cell: "bg-orange-50 border-orange-200",
          badge: "bg-orange-100 text-orange-700",
        };
      }

      return {
        label: weeklyOff ? "Worked on Weekly Off" : "Present",
        short: weeklyOff ? "P+" : "P",
        cell: "bg-green-50 border-green-200",
        badge: "bg-green-100 text-green-700",
      };
    }

    if (approvedLeave) {
      return {
        label: "Leave",
        short: "L",
        cell: "bg-purple-50 border-purple-200",
        badge: "bg-purple-100 text-purple-700",
      };
    }

    if (pendingLeave) {
      return {
        label: "Leave Pending",
        short: "LP",
        cell: "bg-fuchsia-50 border-fuchsia-200",
        badge: "bg-fuchsia-100 text-fuchsia-700",
      };
    }

    if (holiday) {
      return {
        label: holiday.holiday_name || "Holiday",
        short: "H",
        cell: "bg-sky-50 border-sky-200",
        badge: "bg-sky-100 text-sky-700",
      };
    }

    if (weeklyOff) {
      return {
        label: "Weekly Off",
        short: "WO",
        cell: "bg-slate-100 border-slate-300",
        badge: "bg-slate-200 text-slate-700",
      };
    }

    if (dateKey > today) {
      return {
        label: "Upcoming",
        short: "",
        cell: "bg-white border-slate-200",
        badge: "bg-slate-100 text-slate-500",
      };
    }

    return {
      label: "Absent",
      short: "A",
      cell: "bg-red-50 border-red-200",
      badge: "bg-red-100 text-red-700",
    };
  }

  function resetRequestForm() {
    setRequestMode(null);
    setRequestReason("");
    setRequestCheckIn("09:00");
    setRequestCheckOut("18:00");
    setLeaveType("full_day");
  }

  function openAttendanceRequest(
    mode: "absent_correction" | "late_regularization"
  ) {
    setRequestMode(mode);
    setRequestReason("");
    setRequestCheckIn("09:00");
    setRequestCheckOut("18:00");
  }

  async function submitAttendanceRequest() {
    if (!selectedDate || !requestMode || requestMode === "leave") return;

    if (!requestReason.trim()) {
      setMessage("Request માટે reason જરૂરી છે.");
      return;
    }

    if (
      requestMode === "absent_correction" &&
      (!requestCheckIn || !requestCheckOut)
    ) {
      setMessage("Absent correction માટે Check In અને Check Out time જરૂરી છે.");
      return;
    }

    setRequestSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "employee_create_attendance_correction_request",
      {
        p_attendance_date: selectedDate,
        p_request_type: requestMode,
        p_reason: requestReason.trim(),
        p_requested_check_in:
          requestMode === "absent_correction" ? requestCheckIn : null,
        p_requested_check_out:
          requestMode === "absent_correction" ? requestCheckOut : null,
      }
    );

    if (error) {
      setMessage(`Attendance Request Error: ${error.message}`);
      setRequestSaving(false);
      return;
    }

    setMessage(
      requestMode === "absent_correction"
        ? "Absent Correction Request Adminને મોકલાઈ ✅"
        : "Late Regularization Request Adminને મોકલાઈ ✅"
    );

    resetRequestForm();

    if (employee) {
      await loadMonth(employee.id);
    }

    setRequestSaving(false);
  }

  async function submitLeaveRequest() {
    if (!employee || !selectedDate) return;

    if (!requestReason.trim()) {
      setMessage("Leave Request માટે reason જરૂરી છે.");
      return;
    }

    if (
      approvedLeaveForDate(selectedDate) ||
      pendingLeaveForDate(selectedDate)
    ) {
      setMessage("આ તારીખ માટે Leave Request પહેલેથી છે.");
      return;
    }

    if (holidayMap.get(selectedDate) || isWeeklyOff(selectedDate)) {
      setMessage("Weekly Off / Holiday માટે Leave Request જરૂરી નથી.");
      return;
    }

    setRequestSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("leave_requests")
      .insert({
        employee_id: employee.id,
        leave_type: leaveType,
        start_date: selectedDate,
        end_date: selectedDate,
        reason: requestReason.trim(),
        status: "pending",
      });

    if (error) {
      setMessage(`Leave Request Error: ${error.message}`);
      setRequestSaving(false);
      return;
    }

    setMessage("Leave Request સફળતાપૂર્વક મોકલાઈ ✅");
    resetRequestForm();
    await loadMonth(employee.id);
    setRequestSaving(false);
  }

  async function loadMonth(employeeId: string) {
    const supabase = createClient();

    setMonthLoading(true);
    setMessage("");

    const [
      attendanceResult,
      leaveResult,
      tasksResult,
      taskSupportResult,
      primaryStageResult,
      supportWorkerResult,
      correctionResult,
      holidayResult,
      officeSettingsResult,
    ] = await Promise.all([
      supabase
        .from("attendance")
        .select(
          "id, employee_id, attendance_date, check_in, check_out, attendance_type, status, late_minutes, working_minutes, approval_status"
        )
        .eq("employee_id", employeeId)
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd)
        .order("attendance_date", { ascending: true }),

      supabase
        .from("leave_requests")
        .select(
          "id, leave_type, start_date, end_date, status, reason, admin_note"
        )
        .eq("employee_id", employeeId)
        .in("status", ["approved", "pending"])
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),

      supabase
        .from("tasks")
        .select(
          "id, title, assigned_to, status, priority, due_date, started_at, completed_at"
        )
        .eq("assigned_to", employeeId),

      supabase
        .from("task_support_workers")
        .select("task_id, employee_id, is_active")
        .eq("employee_id", employeeId)
        .eq("is_active", true),

      supabase
        .from("order_stage_work")
        .select(
          "id, order_id, stage_id, status, primary_employee_id, started_at, completed_at, created_at"
        )
        .eq("primary_employee_id", employeeId),

      supabase
        .from("order_stage_workers")
        .select("order_stage_work_id, employee_id, left_at")
        .eq("employee_id", employeeId)
        .is("left_at", null),

      supabase
        .from("attendance_correction_requests")
        .select(
          "id, employee_id, attendance_date, request_type, reason, requested_check_in, requested_check_out, status, admin_note, created_at"
        )
        .eq("employee_id", employeeId)
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd)
        .order("created_at", { ascending: false }),

      supabase
        .from("company_holidays")
        .select("id, holiday_date, holiday_name, is_active")
        .eq("is_active", true)
        .gte("holiday_date", monthStart)
        .lte("holiday_date", monthEnd),

      supabase
        .from("office_settings")
        .select("weekly_off_day")
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    const hardError =
      attendanceResult.error ||
      leaveResult.error ||
      tasksResult.error ||
      taskSupportResult.error ||
      primaryStageResult.error ||
      supportWorkerResult.error ||
      correctionResult.error ||
      holidayResult.error ||
      officeSettingsResult.error;

    if (hardError) {
      setMessage(`Calendar Load Error: ${hardError.message}`);
      setMonthLoading(false);
      return;
    }

    const directTasks = (tasksResult.data || []) as TaskRow[];
    const taskSupportRows =
      (taskSupportResult.data || []) as TaskSupportWorker[];

    const supportTaskIds = Array.from(
      new Set(
        taskSupportRows
          .filter((row) => row.is_active)
          .map((row) => row.task_id)
          .filter(Boolean)
      )
    );

    let supportTasks: TaskRow[] = [];

    if (supportTaskIds.length > 0) {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, assigned_to, status, priority, due_date, started_at, completed_at"
        )
        .in("id", supportTaskIds);

      if (!error) {
        supportTasks = (data || []) as TaskRow[];
      }
    }

    const mergedTaskMap = new Map<string, TaskRow>();
    for (const task of [...directTasks, ...supportTasks]) {
      mergedTaskMap.set(task.id, task);
    }
    const mergedTasks = Array.from(mergedTaskMap.values());

    const primaryWorks = (primaryStageResult.data || []) as StageWork[];
    const supportWorkers =
      (supportWorkerResult.data || []) as StageWorker[];

    const supportWorkIds = Array.from(
      new Set(
        supportWorkers
          .map((row) => row.order_stage_work_id)
          .filter(Boolean)
      )
    );

    let supportWorks: StageWork[] = [];

    if (supportWorkIds.length > 0) {
      const { data, error } = await supabase
        .from("order_stage_work")
        .select(
          "id, order_id, stage_id, status, primary_employee_id, started_at, completed_at, created_at"
        )
        .in("id", supportWorkIds);

      if (!error) {
        supportWorks = (data || []) as StageWork[];
      }
    }

    const mergedWorksMap = new Map<string, StageWork>();

    for (const work of [...primaryWorks, ...supportWorks]) {
      mergedWorksMap.set(work.id, work);
    }

    const mergedWorks = Array.from(mergedWorksMap.values());

    const orderIds = Array.from(
      new Set(mergedWorks.map((work) => work.order_id))
    );

    const stageIds = Array.from(
      new Set(mergedWorks.map((work) => work.stage_id))
    );

    const [ordersResult, stagesResult] = await Promise.all([
      orderIds.length
        ? supabase
            .from("orders")
            .select(
              "id, order_number, customer_name, product_name"
            )
            .in("id", orderIds)
        : Promise.resolve({ data: [], error: null }),

      stageIds.length
        ? supabase
            .from("workflow_stages")
            .select("id, name")
            .in("id", stageIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const rawAttendance =
      (attendanceResult.data || []) as Attendance[];

    setAttendanceRows(
      Array.from(canonicalAttendanceMap(rawAttendance).values())
    );
    setLeaveRows((leaveResult.data || []) as LeaveRequest[]);
    setTaskRows(mergedTasks);
    setStageWorkRows(mergedWorks);
    setOrders((ordersResult.data || []) as OrderRow[]);
    setStages((stagesResult.data || []) as StageRow[]);
    setCorrectionRows(
      (correctionResult.data || []) as CorrectionRequest[]
    );
    setHolidays((holidayResult.data || []) as Holiday[]);
    setWeeklyOffDay(
      Number(officeSettingsResult.data?.weekly_off_day ?? 0)
    );

    setMonthLoading(false);
  }

  useEffect(() => {
    async function init() {
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
        .select("id, full_name")
        .eq("auth_user_id", user.id)
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .maybeSingle();

      if (profileError || !profile) {
        setMessage(
          profileError?.message || "Employee profile મળ્યો નથી."
        );
        setLoading(false);
        return;
      }

      setEmployee(profile as Employee);
      setLoading(false);
    }

    init();
  }, [router]);

  useEffect(() => {
    // Calendar month clamp: September 2026 is the first visible month.
    if (isBeforeMinimumCalendarMonth(year, month)) {
      setMonthCursor(
        new Date(MIN_CALENDAR_YEAR, MIN_CALENDAR_MONTH, 1)
      );
      return;
    }

    if (!employee) return;
    void loadMonth(employee.id);
  }, [employee, monthStart, monthEnd, year, month]);

  const selectedDetails: DayDetails | null = useMemo(() => {
    if (!selectedDate) return null;

    return {
      date: selectedDate,
      attendance: attendanceMap.get(selectedDate) || null,
      approvedLeave: approvedLeaveForDate(selectedDate),
      pendingLeave: pendingLeaveForDate(selectedDate),
      holiday: holidayMap.get(selectedDate) || null,
      isWeeklyOff: isWeeklyOff(selectedDate),
      tasks: tasksForDate(selectedDate),
      stageWorks: stageWorksForDate(selectedDate),
    };
  }, [
    selectedDate,
    attendanceMap,
    leaveRows,
    holidayMap,
    weeklyOffDay,
    taskRows,
    stageWorkRows,
  ]);

  const monthlyPresent = calendarDays.filter((dateKey) => {
    if (!dateKey) return false;
    const attendance = attendanceMap.get(dateKey);
    return (
      attendance &&
      attendance.attendance_type !== "half_day"
    );
  }).length;

  const monthlyHalfDay = calendarDays.filter((dateKey) => {
    if (!dateKey) return false;
    return (
      attendanceMap.get(dateKey)?.attendance_type === "half_day"
    );
  }).length;

  const monthlyLeave = calendarDays.filter((dateKey) => {
    if (!dateKey) return false;
    return Boolean(approvedLeaveForDate(dateKey));
  }).length;

  const monthlyCompletedTasks = taskRows.filter(
    (task) =>
      task.status === "completed" &&
      task.completed_at &&
      isoDateKey(task.completed_at) &&
      isoDateKey(task.completed_at)! >= monthStart &&
      isoDateKey(task.completed_at)! <= monthEnd
  ).length;

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-5 font-bold text-slate-700">
          Work Calendar લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page pb-8">
      <header className="yf-header">
        <div className="yf-container py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black tracking-[0.18em] text-blue-100">
              YASHFLOW
            </p>
            <h1 className="text-lg sm:text-xl font-black text-white">
              My Work Calendar
            </h1>
            <p className="text-[10px] text-blue-100 font-semibold truncate">
              {employee?.full_name}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            {message}
          </div>
        )}

        <section className="yf-card p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                const previous = new Date(year, month - 1, 1);

                if (
                  !isBeforeMinimumCalendarMonth(
                    previous.getFullYear(),
                    previous.getMonth()
                  )
                ) {
                  setMonthCursor(previous);
                }
              }}
              disabled={year === MIN_CALENDAR_YEAR && month === MIN_CALENDAR_MONTH}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white font-black disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ‹
            </button>

            <div className="text-center">
              <p className="text-[10px] font-black tracking-[0.12em] text-blue-700">
                MONTHLY ATTENDANCE + WORK
              </p>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                {monthTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setMonthCursor(nextMonthDate)}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white font-black"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-4">
            <div className="rounded-xl bg-green-50 border border-green-100 p-2.5 text-center">
              <p className="text-[9px] font-black text-green-700">PRESENT</p>
              <p className="text-xl font-black text-green-800 mt-0.5">
                {monthlyPresent}
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-center">
              <p className="text-[9px] font-black text-amber-700">HALF DAY</p>
              <p className="text-xl font-black text-amber-800 mt-0.5">
                {monthlyHalfDay}
              </p>
            </div>

            <div className="rounded-xl bg-purple-50 border border-purple-100 p-2.5 text-center">
              <p className="text-[9px] font-black text-purple-700">LEAVE</p>
              <p className="text-xl font-black text-purple-800 mt-0.5">
                {monthlyLeave}
              </p>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-100 p-2.5 text-center">
              <p className="text-[9px] font-black text-blue-700">TASKS ✓</p>
              <p className="text-xl font-black text-blue-800 mt-0.5">
                {monthlyCompletedTasks}
              </p>
            </div>
          </div>
        </section>

        <section className="yf-card mt-3 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-900 text-white">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (day) => (
                <div
                  key={day}
                  className="py-2 text-center text-[9px] sm:text-[10px] font-black"
                >
                  {day}
                </div>
              )
            )}
          </div>

          <div className="grid grid-cols-7 bg-slate-200 gap-px">
            {calendarDays.map((dateKey, index) => {
              if (!dateKey) {
                return (
                  <div
                    key={`blank-${index}`}
                    className="min-h-[78px] sm:min-h-[104px] bg-slate-50"
                  />
                );
              }

              const meta = dayStatus(dateKey);
              const correction = correctionForDate(dateKey);
              const completedTasks =
                completedTasksForDate(dateKey).length;
              const workCount =
                stageWorksForDate(dateKey).length;
              const dayNumber = Number(dateKey.slice(-2));
              const isToday = dateKey === today;

              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => {
                    resetRequestForm();
                    setSelectedDate(dateKey);
                  }}
                  className={`min-h-[78px] sm:min-h-[104px] p-1.5 sm:p-2 text-left border-0 ${meta.cell} ${
                    isToday ? "ring-2 ring-inset ring-blue-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="text-[9px] text-slate-500 font-bold">
                        {new Intl.DateTimeFormat("en-IN", {
                          weekday: "short",
                        }).format(dateFromKey(dateKey))}
                      </p>
                      <p className="text-sm sm:text-lg font-black text-slate-900">
                        {dayNumber}
                      </p>
                    </div>

                    {meta.short && (
                      <span
                        className={`min-w-5 h-5 px-1 rounded-full text-[8px] font-black flex items-center justify-center ${meta.badge}`}
                      >
                        {meta.short}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1">
                    {workCount > 0 && (
                      <p className="text-[8px] sm:text-[9px] font-black text-cyan-700 truncate">
                        ⚙ {workCount} Work
                      </p>
                    )}

                    {completedTasks > 0 && (
                      <p className="text-[8px] sm:text-[9px] font-black text-blue-700 truncate">
                        ✓ {completedTasks} Task
                      </p>
                    )}

                    {correction?.status === "pending" && (
                      <p className="text-[8px] sm:text-[9px] font-black text-fuchsia-700 truncate">
                        📨 Request Pending
                      </p>
                    )}

                    {correction?.status === "approved" && (
                      <p className="text-[8px] sm:text-[9px] font-black text-green-700 truncate">
                        ✓ Request Approved
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {monthLoading && (
            <div className="p-3 text-center text-xs font-black text-blue-700">
              Updating month...
            </div>
          )}
        </section>

        <section className="yf-card mt-3 p-3">
          <div className="flex flex-wrap gap-2 text-[9px] font-black">
            <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">
              P Present
            </span>
            <span className="rounded-full bg-orange-100 text-orange-700 px-2.5 py-1">
              LT Late
            </span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-1">
              ½ Half Day
            </span>
            <span className="rounded-full bg-purple-100 text-purple-700 px-2.5 py-1">
              L Leave
            </span>
            <span className="rounded-full bg-fuchsia-100 text-fuchsia-700 px-2.5 py-1">
              LP Leave Pending
            </span>
            <span className="rounded-full bg-slate-200 text-slate-700 px-2.5 py-1">
              WO Weekly Off
            </span>
            <span className="rounded-full bg-sky-100 text-sky-700 px-2.5 py-1">
              H Holiday
            </span>
            <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-1">
              A Absent
            </span>
          </div>
        </section>
      </div>

      {selectedDetails && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            onClick={() => {
              setSelectedDate(null);
              resetRequestForm();
            }}
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Close date details"
          />

          <aside className="absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-3xl bg-slate-50 shadow-2xl flex flex-col sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[460px] sm:rounded-none">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-t-3xl sm:rounded-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[0.14em] text-blue-300">
                    DATE DETAILS
                  </p>
                  <h2 className="text-xl font-black mt-0.5">
                    {new Intl.DateTimeFormat("en-IN", {
                      weekday: "long",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }).format(dateFromKey(selectedDetails.date))}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(null);
                    resetRequestForm();
                  }}
                  className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 font-black"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black text-slate-500">
                      ATTENDANCE
                    </p>
                    <p className="text-lg font-black text-slate-900 mt-1">
                      {dayStatus(selectedDetails.date).label}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-black ${
                      dayStatus(selectedDetails.date).badge
                    }`}
                  >
                    {dayStatus(selectedDetails.date).short ||
                      dayStatus(selectedDetails.date).label}
                  </span>
                </div>

                {selectedDetails.holiday && (
                  <p className="text-xs font-semibold text-sky-700 mt-2">
                    Holiday: {selectedDetails.holiday.holiday_name}
                  </p>
                )}

                {selectedDetails.isWeeklyOff &&
                  !selectedDetails.attendance && (
                    <p className="text-xs font-semibold text-slate-600 mt-2">
                      આ દિવસ Company Weekly Off છે — Absent ગણાશે નહીં.
                    </p>
                  )}

                {selectedDetails.approvedLeave && (
                  <p className="text-xs font-semibold text-purple-700 mt-2">
                    Approved Leave •{" "}
                    {selectedDetails.approvedLeave.reason || "-"}
                  </p>
                )}

                {selectedDetails.pendingLeave && (
                  <p className="text-xs font-semibold text-fuchsia-700 mt-2">
                    Leave Request Pending •{" "}
                    {selectedDetails.pendingLeave.reason || "-"}
                  </p>
                )}

                {selectedDetails.attendance && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-xl bg-green-50 p-3">
                      <p className="text-[9px] font-black text-green-700">
                        CHECK IN
                      </p>
                      <p className="font-black mt-1">
                        {formatTime(
                          selectedDetails.attendance.check_in
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl bg-red-50 p-3">
                      <p className="text-[9px] font-black text-red-700">
                        CHECK OUT
                      </p>
                      <p className="font-black mt-1">
                        {formatTime(
                          selectedDetails.attendance.check_out
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl bg-orange-50 p-3">
                      <p className="text-[9px] font-black text-orange-700">
                        LATE
                      </p>
                      <p className="font-black mt-1">
                        {selectedDetails.attendance.late_minutes || 0} min
                      </p>
                    </div>

                    <div className="rounded-xl bg-blue-50 p-3">
                      <p className="text-[9px] font-black text-blue-700">
                        WORKING
                      </p>
                      <p className="font-black mt-1">
                        {formatMinutes(
                          selectedDetails.attendance.working_minutes
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black text-fuchsia-700">
                  REQUEST OPTIONS
                </p>

                {correctionForDate(selectedDetails.date) && (
                  <div className="mt-3 rounded-xl bg-fuchsia-50 border border-fuchsia-100 p-3">
                    <p className="text-xs font-black text-fuchsia-800">
                      Attendance Request:{" "}
                      {correctionForDate(selectedDetails.date)?.status}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      {correctionForDate(selectedDetails.date)?.reason}
                    </p>
                    {correctionForDate(selectedDetails.date)?.admin_note && (
                      <p className="text-xs font-semibold text-slate-700 mt-1">
                        Admin Note:{" "}
                        {correctionForDate(selectedDetails.date)?.admin_note}
                      </p>
                    )}
                  </div>
                )}

                {!requestMode && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {!selectedDetails.attendance &&
                      !selectedDetails.approvedLeave &&
                      !selectedDetails.pendingLeave &&
                      !selectedDetails.holiday &&
                      !selectedDetails.isWeeklyOff &&
                      selectedDetails.date < today && (
                        <button
                          type="button"
                          onClick={() =>
                            openAttendanceRequest("absent_correction")
                          }
                          className="rounded-xl bg-red-50 border border-red-200 px-3 py-3 text-xs font-black text-red-700"
                        >
                          Absent Correction
                        </button>
                      )}

                    {selectedDetails.attendance?.attendance_type ===
                      "late" && (
                      <button
                        type="button"
                        onClick={() =>
                          openAttendanceRequest("late_regularization")
                        }
                        className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-3 text-xs font-black text-orange-700"
                      >
                        Late Request
                      </button>
                    )}

                    {!selectedDetails.holiday &&
                      !selectedDetails.isWeeklyOff &&
                      !selectedDetails.approvedLeave &&
                      !selectedDetails.pendingLeave &&
                      selectedDetails.date >= today && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestMode("leave");
                            setRequestReason("");
                          }}
                          className="rounded-xl bg-purple-50 border border-purple-200 px-3 py-3 text-xs font-black text-purple-700"
                        >
                          Leave Request
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() => router.push("/dashboard/leave")}
                      className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-3 text-xs font-black text-slate-700"
                    >
                      Multi-day Leave
                    </button>
                  </div>
                )}

                {requestMode === "absent_correction" && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="text-[10px] font-black text-slate-500">
                        REQUESTED CHECK IN
                      </label>
                      <input
                        type="time"
                        value={requestCheckIn}
                        onChange={(e) =>
                          setRequestCheckIn(e.target.value)
                        }
                        className="yf-input mt-1"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-500">
                        REQUESTED CHECK OUT
                      </label>
                      <input
                        type="time"
                        value={requestCheckOut}
                        onChange={(e) =>
                          setRequestCheckOut(e.target.value)
                        }
                        className="yf-input mt-1"
                      />
                    </div>

                    <textarea
                      value={requestReason}
                      onChange={(e) =>
                        setRequestReason(e.target.value)
                      }
                      placeholder="Absent correction reason..."
                      className="yf-input min-h-[90px]"
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={resetRequestForm}
                        className="yf-btn yf-btn-secondary flex-1 justify-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitAttendanceRequest}
                        disabled={requestSaving}
                        className="yf-btn yf-btn-primary flex-1 justify-center disabled:opacity-50"
                      >
                        {requestSaving ? "Sending..." : "Send Request"}
                      </button>
                    </div>
                  </div>
                )}

                {requestMode === "late_regularization" && (
                  <div className="mt-3 space-y-3">
                    <textarea
                      value={requestReason}
                      onChange={(e) =>
                        setRequestReason(e.target.value)
                      }
                      placeholder="Late reason / regularization request..."
                      className="yf-input min-h-[100px]"
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={resetRequestForm}
                        className="yf-btn yf-btn-secondary flex-1 justify-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitAttendanceRequest}
                        disabled={requestSaving}
                        className="yf-btn yf-btn-primary flex-1 justify-center disabled:opacity-50"
                      >
                        {requestSaving ? "Sending..." : "Send Request"}
                      </button>
                    </div>
                  </div>
                )}

                {requestMode === "leave" && (
                  <div className="mt-3 space-y-3">
                    <select
                      value={leaveType}
                      onChange={(e) =>
                        setLeaveType(
                          e.target.value as
                            | "full_day"
                            | "first_half"
                            | "second_half"
                        )
                      }
                      className="yf-input"
                    >
                      <option value="full_day">Full Day</option>
                      <option value="first_half">First Half</option>
                      <option value="second_half">Second Half</option>
                    </select>

                    <textarea
                      value={requestReason}
                      onChange={(e) =>
                        setRequestReason(e.target.value)
                      }
                      placeholder="Leave reason..."
                      className="yf-input min-h-[100px]"
                    />

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={resetRequestForm}
                        className="yf-btn yf-btn-secondary flex-1 justify-center"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitLeaveRequest}
                        disabled={requestSaving}
                        className="yf-btn bg-purple-600 text-white hover:bg-purple-700 flex-1 justify-center disabled:opacity-50"
                      >
                        {requestSaving ? "Sending..." : "Send Leave"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-cyan-700">
                    PROJECT / ORDER WORK
                  </p>
                  <span className="yf-badge yf-badge-blue">
                    {selectedDetails.stageWorks.length}
                  </span>
                </div>

                {selectedDetails.stageWorks.length === 0 ? (
                  <p className="text-xs text-slate-500 mt-3">
                    આ તારીખે કોઈ recorded production work નથી.
                  </p>
                ) : (
                  <div className="space-y-2 mt-3">
                    {selectedDetails.stageWorks.map((work) => {
                      const order = orderMap.get(work.order_id);
                      const stage = stageMap.get(work.stage_id);

                      return (
                        <div
                          key={work.id}
                          className="rounded-xl bg-cyan-50 border border-cyan-100 p-3"
                        >
                          <p className="font-black text-slate-900">
                            {order?.order_number || "Order"} •{" "}
                            {stage?.name || "Stage"}
                          </p>
                          <p className="text-xs font-semibold text-slate-600 mt-1">
                            {order?.customer_name || "Customer"} •{" "}
                            {order?.product_name || "Product"}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-1">
                            Start: {formatTime(work.started_at)} • Complete:{" "}
                            {formatTime(work.completed_at)} •{" "}
                            {work.status}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black text-violet-700">
                    TASKS WORKED
                  </p>
                  <span className="yf-badge yf-badge-purple">
                    {selectedDetails.tasks.length}
                  </span>
                </div>

                {selectedDetails.tasks.length === 0 ? (
                  <p className="text-xs text-slate-500 mt-3">
                    આ તારીખે કોઈ recorded task work નથી.
                  </p>
                ) : (
                  <div className="space-y-2 mt-3">
                    {selectedDetails.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-xl bg-violet-50 border border-violet-100 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-slate-900">
                              {task.title}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1">
                              Priority: {task.priority} • Due:{" "}
                              {task.due_date || "-"}
                            </p>
                          </div>

                          <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-violet-700">
                            {task.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
