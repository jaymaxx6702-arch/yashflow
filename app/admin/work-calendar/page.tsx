"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { canonicalAttendanceMap } from "@/utils/business-rules";

type Employee = {
  id: string;
  full_name: string;
  mobile: string | null;
  department: string | null;
  role: string | null;
};

type Attendance = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  attendance_type: string | null;
  late_minutes: number | null;
  working_minutes: number | null;
  approval_status: string | null;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  assigned_to: string | null;
  status: string;
  priority: string | null;
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
  worker_role: "primary" | "support";
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
  status: "pending" | "approved" | "rejected";
};

type DayEmployeeRow = {
  employee: Employee;
  attendance: Attendance | null;
  leave: LeaveRequest | null;
  attendanceLabel: string;
  attendanceClass: string;
  stageWorked: StageWork[];
  stageCompleted: StageWork[];
  tasksWorked: TaskRow[];
  tasksCompleted: TaskRow[];
};

function indiaDateKey(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function dateFromKey(value: string) {
  return new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10))
  );
}

function isoDateKey(value: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value.slice(0, 10);
  }

  return indiaDateKey(date);
}

function dateOverlaps(
  dateKey: string,
  startValue: string | null,
  endValue: string | null
) {
  const start = isoDateKey(startValue);
  const end = isoDateKey(endValue) || start;

  if (!start) return false;

  return dateKey >= start && dateKey <= (end || start);
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

function formatWorking(minutes: number | null) {
  if (!minutes || minutes <= 0) return "-";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function leaveLabel(type: string) {
  if (type === "first_half") return "First Half Leave";
  if (type === "second_half") return "Second Half Leave";
  return "Leave";
}

const MIN_CALENDAR_YEAR = 2026;
const MIN_CALENDAR_MONTH = 8; // September, 0-based

function isBeforeMinimumCalendarMonth(year: number, month: number) {
  return (
    year < MIN_CALENDAR_YEAR ||
    (year === MIN_CALENDAR_YEAR && month < MIN_CALENDAR_MONTH)
  );
}

export default function AdminWorkCalendarPage() {
  const router = useRouter();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<Attendance[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRequest[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [stageWorkers, setStageWorkers] = useState<StageWorker[]>([]);
  const [taskSupportWorkers, setTaskSupportWorkers] = useState<TaskSupportWorker[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [weeklyOffDay, setWeeklyOffDay] = useState(0);

  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [expandedEmployeeId, setExpandedEmployeeId] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [message, setMessage] = useState("");

  const today = useMemo(() => indiaDateKey(new Date()), []);

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const monthEndDate = new Date(year, month + 1, 0);
  const monthEnd = `${monthEndDate.getFullYear()}-${String(
    monthEndDate.getMonth() + 1
  ).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;

  const monthTitle = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(monthCursor);

  const attendanceByEmployeeDate = useMemo(
    () => canonicalAttendanceMap(attendanceRows),
    [attendanceRows]
  );

  const holidayMap = useMemo(
    () =>
      new Map(
        holidays.map((row) => [row.holiday_date, row])
      ),
    [holidays]
  );

  const orderMap = useMemo(
    () => new Map(orders.map((row) => [row.id, row])),
    [orders]
  );

  const stageMap = useMemo(
    () => new Map(stages.map((row) => [row.id, row])),
    [stages]
  );

  const supportEmployeesByWork = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const row of stageWorkers) {
      if (row.left_at) continue;
      const list = map.get(row.order_stage_work_id) || [];
      list.push(row.employee_id);
      map.set(row.order_stage_work_id, list);
    }

    return map;
  }, [stageWorkers]);

  const supportEmployeesByTask = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const row of taskSupportWorkers) {
      if (!row.is_active) continue;
      const list = map.get(row.task_id) || [];
      list.push(row.employee_id);
      map.set(row.task_id, list);
    }

    return map;
  }, [taskSupportWorkers]);

  const calendarDays = useMemo(() => {
    const firstIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const values: Array<string | null> = [];

    for (let i = 0; i < firstIndex; i += 1) {
      values.push(null);
    }

    for (let day = 1; day <= totalDays; day += 1) {
      values.push(
        `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(
          2,
          "0"
        )}`
      );
    }

    while (values.length % 7 !== 0) {
      values.push(null);
    }

    return values;
  }, [year, month]);

  function isWeeklyOff(dateKey: string) {
    return dateFromKey(dateKey).getDay() === weeklyOffDay;
  }

  function approvedLeave(employeeId: string, dateKey: string) {
    return (
      leaveRows.find(
        (row) =>
          row.employee_id === employeeId &&
          row.status === "approved" &&
          dateKey >= row.start_date &&
          dateKey <= row.end_date
      ) || null
    );
  }

  function employeeIdsForWork(work: StageWork) {
    return Array.from(
      new Set(
        [
          work.primary_employee_id,
          ...(supportEmployeesByWork.get(work.id) || []),
        ].filter(Boolean) as string[]
      )
    );
  }

  function stageWorkedForEmployee(employeeId: string, dateKey: string) {
    return stageWorks.filter(
      (work) =>
        employeeIdsForWork(work).includes(employeeId) &&
        dateOverlaps(
          dateKey,
          work.started_at || work.created_at,
          work.completed_at || work.started_at || work.created_at
        )
    );
  }

  function stageCompletedForEmployee(
    employeeId: string,
    dateKey: string
  ) {
    return stageWorks.filter(
      (work) =>
        employeeIdsForWork(work).includes(employeeId) &&
        isoDateKey(work.completed_at) === dateKey
    );
  }

  function tasksWorkedForEmployee(employeeId: string, dateKey: string) {
    return taskRows.filter(
      (task) =>
        (
          task.assigned_to === employeeId ||
          (supportEmployeesByTask.get(task.id) || []).includes(employeeId)
        ) &&
        (task.started_at || task.completed_at
          ? dateOverlaps(
              dateKey,
              task.started_at || task.completed_at,
              task.completed_at || task.started_at
            )
          : task.due_date === dateKey)
    );
  }

  function tasksCompletedForEmployee(
    employeeId: string,
    dateKey: string
  ) {
    return taskRows.filter(
      (task) =>
        (
          task.assigned_to === employeeId ||
          (supportEmployeesByTask.get(task.id) || []).includes(employeeId)
        ) &&
        task.status === "completed" &&
        isoDateKey(task.completed_at) === dateKey
    );
  }

  function statusForEmployee(employee: Employee, dateKey: string) {
    const attendance =
      attendanceByEmployeeDate.get(`${employee.id}|${dateKey}`) || null;

    const leave = approvedLeave(employee.id, dateKey);

    if (attendance) {
      if (attendance.attendance_type === "half_day") {
        return {
          type: "half_day",
          label: "Half Day",
          className: "bg-amber-100 text-amber-800",
        };
      }

      if (attendance.attendance_type === "late") {
        return {
          type: "late",
          label: "Late",
          className: "bg-orange-100 text-orange-700",
        };
      }

      return {
        type: "present",
        label: isWeeklyOff(dateKey)
          ? "Present • Weekly Off"
          : "Present",
        className: "bg-green-100 text-green-700",
      };
    }

    if (leave) {
      return {
        type:
          leave.leave_type === "full_day"
            ? "leave"
            : "half_day_leave",
        label: leaveLabel(leave.leave_type),
        className: "bg-purple-100 text-purple-700",
      };
    }

    if (holidayMap.get(dateKey)) {
      return {
        type: "holiday",
        label: "Holiday",
        className: "bg-sky-100 text-sky-700",
      };
    }

    if (isWeeklyOff(dateKey)) {
      return {
        type: "weekly_off",
        label: "Weekly Off",
        className: "bg-slate-200 text-slate-700",
      };
    }

    if (dateKey > today) {
      return {
        type: "future",
        label: "Not Due",
        className: "bg-blue-50 text-blue-600",
      };
    }

    if (dateKey === today) {
      return {
        type: "not_checked_in",
        label: "Not Checked In",
        className: "bg-slate-100 text-slate-700",
      };
    }

    return {
      type: "absent",
      label: "Absent",
      className: "bg-red-100 text-red-700",
    };
  }

  function rowsForDate(dateKey: string): DayEmployeeRow[] {
    return employees.map((employee) => {
      const attendance =
        attendanceByEmployeeDate.get(`${employee.id}|${dateKey}`) || null;

      const leave = approvedLeave(employee.id, dateKey);
      const status = statusForEmployee(employee, dateKey);

      return {
        employee,
        attendance,
        leave,
        attendanceLabel: status.label,
        attendanceClass: status.className,
        stageWorked: stageWorkedForEmployee(employee.id, dateKey),
        stageCompleted: stageCompletedForEmployee(
          employee.id,
          dateKey
        ),
        tasksWorked: tasksWorkedForEmployee(employee.id, dateKey),
        tasksCompleted: tasksCompletedForEmployee(
          employee.id,
          dateKey
        ),
      };
    });
  }

  function summaryForDate(dateKey: string) {
    const rows = rowsForDate(dateKey);

    const present = rows.filter((row) => {
      const type = statusForEmployee(row.employee, dateKey).type;
      return type === "present" || type === "late";
    }).length;

    const late = rows.filter(
      (row) =>
        statusForEmployee(row.employee, dateKey).type === "late"
    ).length;

    const halfDay = rows.filter((row) => {
      const type = statusForEmployee(row.employee, dateKey).type;
      return type === "half_day" || type === "half_day_leave";
    }).length;

    const leave = rows.filter(
      (row) =>
        statusForEmployee(row.employee, dateKey).type === "leave"
    ).length;

    const absent = rows.filter(
      (row) =>
        statusForEmployee(row.employee, dateKey).type === "absent"
    ).length;

    const notCheckedIn = rows.filter(
      (row) =>
        statusForEmployee(row.employee, dateKey).type ===
        "not_checked_in"
    ).length;

    const employeesWorked = rows.filter(
      (row) =>
        row.stageWorked.length > 0 || row.tasksWorked.length > 0
    ).length;

    const completedWork = rows.reduce(
      (sum, row) =>
        sum + row.stageCompleted.length + row.tasksCompleted.length,
      0
    );

    const workingMinutes = rows.reduce(
      (sum, row) =>
        sum + Number(row.attendance?.working_minutes || 0),
      0
    );

    const pendingCorrections = corrections.filter(
      (row) =>
        row.attendance_date === dateKey &&
        row.status === "pending"
    ).length;

    return {
      total: rows.length,
      present,
      late,
      halfDay,
      leave,
      absent,
      notCheckedIn,
      employeesWorked,
      completedWork,
      workingMinutes,
      pendingCorrections,
    };
  }

  async function loadMonth() {
    const supabase = createClient();

    setMonthLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/");
      return;
    }

    const { data: admin, error: adminError } = await supabase
      .from("employees")
      .select("id, role, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (
      adminError ||
      !admin ||
      admin.role !== "admin" ||
      admin.approval_status !== "approved" ||
      !admin.is_active
    ) {
      router.replace("/dashboard");
      return;
    }

    const [
      employeesResult,
      attendanceResult,
      leaveResult,
      taskResult,
      taskSupportResult,
      stageWorkResult,
      stageWorkersResult,
      holidayResult,
      settingsResult,
      correctionResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, mobile, department, role")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_hidden", false)
        .order("full_name", { ascending: true }),

      supabase
        .from("attendance")
        .select(
          "id, employee_id, attendance_date, check_in, check_out, attendance_type, late_minutes, working_minutes, approval_status"
        )
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd),

      supabase
        .from("leave_requests")
        .select(
          "id, employee_id, leave_type, start_date, end_date, status, reason"
        )
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),

      supabase
        .from("tasks")
        .select(
          "id, title, assigned_to, status, priority, due_date, started_at, completed_at"
        ),

      supabase
        .from("task_support_workers")
        .select("task_id, employee_id, is_active")
        .eq("is_active", true),

      supabase
        .from("order_stage_work")
        .select(
          "id, order_id, stage_id, status, primary_employee_id, started_at, completed_at, created_at"
        ),

      supabase
        .from("order_stage_workers")
        .select("order_stage_work_id, employee_id, worker_role, left_at")
        .is("left_at", null),

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

      supabase
        .from("attendance_correction_requests")
        .select(
          "id, employee_id, attendance_date, request_type, status"
        )
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd),
    ]);

    const hardError =
      employeesResult.error ||
      attendanceResult.error ||
      leaveResult.error ||
      taskResult.error ||
      taskSupportResult.error ||
      stageWorkResult.error ||
      stageWorkersResult.error ||
      holidayResult.error ||
      settingsResult.error ||
      correctionResult.error;

    if (hardError) {
      setMessage(`Admin Work Calendar Load Error: ${hardError.message}`);
      setMonthLoading(false);
      setLoading(false);
      return;
    }

    const staff = ((employeesResult.data || []) as Employee[]).filter(
      (employee) =>
        String(employee.role || "").toLowerCase() !== "admin"
    );

    const allStageWorks =
      (stageWorkResult.data || []) as StageWork[];

    const orderIds = Array.from(
      new Set(allStageWorks.map((row) => row.order_id))
    );

    const stageIds = Array.from(
      new Set(allStageWorks.map((row) => row.stage_id))
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

    if (ordersResult.error) {
      console.warn(
        "Calendar order details load failed:",
        ordersResult.error.message
      );
    }

    if (stagesResult.error) {
      console.warn(
        "Calendar stage details load failed:",
        stagesResult.error.message
      );
    }

    setEmployees(staff);

    const rawAttendance =
      (attendanceResult.data || []) as Attendance[];
    setAttendanceRows(
      Array.from(canonicalAttendanceMap(rawAttendance).values())
    );

    setLeaveRows((leaveResult.data || []) as LeaveRequest[]);
    setTaskRows((taskResult.data || []) as TaskRow[]);
    setTaskSupportWorkers(
      (taskSupportResult.data || []) as TaskSupportWorker[]
    );
    setStageWorks(allStageWorks);
    setStageWorkers(
      (stageWorkersResult.data || []) as StageWorker[]
    );
    setHolidays((holidayResult.data || []) as Holiday[]);
    setCorrections(
      (correctionResult.data || []) as CorrectionRequest[]
    );
    setWeeklyOffDay(Number(settingsResult.data?.weekly_off_day ?? 0));
    setOrders((ordersResult.data || []) as OrderRow[]);
    setStages((stagesResult.data || []) as StageRow[]);

    setMonthLoading(false);
    setLoading(false);
  }

  useEffect(() => {
    // Calendar month clamp: September 2026 is the first visible month.
    if (isBeforeMinimumCalendarMonth(year, month)) {
      setMonthCursor(
        new Date(MIN_CALENDAR_YEAR, MIN_CALENDAR_MONTH, 1)
      );
      return;
    }

    void loadMonth();
  }, [monthStart, monthEnd, year, month]);

  const selectedRows = useMemo(
    () => (selectedDate ? rowsForDate(selectedDate) : []),
    [
      selectedDate,
      employees,
      attendanceRows,
      leaveRows,
      taskRows,
      stageWorks,
      stageWorkers,
      taskSupportWorkers,
      holidays,
      weeklyOffDay,
    ]
  );

  const selectedSummary = useMemo(
    () => (selectedDate ? summaryForDate(selectedDate) : null),
    [
      selectedDate,
      employees,
      attendanceRows,
      leaveRows,
      taskRows,
      stageWorks,
      stageWorkers,
      holidays,
      corrections,
      weeklyOffDay,
    ]
  );

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-5 font-bold text-slate-700">
          Admin Work Calendar લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page pb-8">
      <header className="yf-header">
        <div className="yf-container py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black tracking-[0.18em] text-blue-100">
              YASHFLOW ADMIN
            </p>
            <h1 className="text-lg sm:text-xl font-black text-white">
              Staff Work Calendar
            </h1>
            <p className="text-[10px] text-blue-100 font-semibold">
              Attendance + Employee Work + Output
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
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
                STAFF ATTENDANCE + WORK
              </p>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                {monthTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={() =>
                setMonthCursor(new Date(year, month + 1, 1))
              }
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white font-black"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-center">
              <p className="text-[9px] font-black text-blue-700">
                ACTIVE EMPLOYEES
              </p>
              <p className="text-xl font-black text-blue-800 mt-0.5">
                {employees.length}
              </p>
            </div>

            <div className="rounded-xl bg-green-50 border border-green-100 p-3 text-center">
              <p className="text-[9px] font-black text-green-700">
                PRESENT TODAY
              </p>
              <p className="text-xl font-black text-green-800 mt-0.5">
                {summaryForDate(today).present}
              </p>
            </div>

            <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3 text-center">
              <p className="text-[9px] font-black text-cyan-700">
                WORKED TODAY
              </p>
              <p className="text-xl font-black text-cyan-800 mt-0.5">
                {summaryForDate(today).employeesWorked}
              </p>
            </div>

            <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-center">
              <p className="text-[9px] font-black text-violet-700">
                OUTPUT TODAY
              </p>
              <p className="text-xl font-black text-violet-800 mt-0.5">
                {summaryForDate(today).completedWork}
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
                    className="min-h-[94px] sm:min-h-[120px] bg-slate-50"
                  />
                );
              }

              const summary = summaryForDate(dateKey);
              const holiday = holidayMap.get(dateKey);
              const weeklyOff = isWeeklyOff(dateKey);
              const isToday = dateKey === today;
              const future = dateKey > today;

              let shell = "bg-white";

              if (holiday) {
                shell = "bg-sky-50";
              } else if (weeklyOff) {
                shell = "bg-slate-100";
              } else if (!future && summary.absent > 0) {
                shell = "bg-red-50";
              }

              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => {
                    setSelectedDate(dateKey);
                    setExpandedEmployeeId(null);
                  }}
                  className={`min-h-[94px] sm:min-h-[120px] p-1.5 sm:p-2 text-left ${shell} ${
                    isToday ? "ring-2 ring-inset ring-blue-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="text-[8px] sm:text-[9px] text-slate-500 font-bold">
                        {new Intl.DateTimeFormat("en-IN", {
                          weekday: "short",
                        }).format(dateFromKey(dateKey))}
                      </p>
                      <p className="text-sm sm:text-lg font-black text-slate-900">
                        {Number(dateKey.slice(-2))}
                      </p>
                    </div>

                    {holiday ? (
                      <span className="rounded-full bg-sky-100 text-sky-700 px-1.5 py-1 text-[8px] font-black">
                        H
                      </span>
                    ) : weeklyOff ? (
                      <span className="rounded-full bg-slate-200 text-slate-700 px-1.5 py-1 text-[8px] font-black">
                        WO
                      </span>
                    ) : null}
                  </div>

                  {!future && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[8px] sm:text-[9px] font-black text-green-700 truncate">
                        P {summary.present}
                        {summary.late > 0 ? ` • LT ${summary.late}` : ""}
                      </p>

                      {(summary.leave > 0 ||
                        summary.halfDay > 0 ||
                        summary.absent > 0) && (
                        <p className="text-[8px] sm:text-[9px] font-black text-slate-600 truncate">
                          L {summary.leave} • ½ {summary.halfDay} • A{" "}
                          {summary.absent}
                        </p>
                      )}

                      <p className="text-[8px] sm:text-[9px] font-black text-cyan-700 truncate">
                        👥 Work {summary.employeesWorked}
                      </p>

                      <p className="text-[8px] sm:text-[9px] font-black text-violet-700 truncate">
                        ✓ Output {summary.completedWork}
                      </p>

                      {summary.pendingCorrections > 0 && (
                        <p className="text-[8px] sm:text-[9px] font-black text-orange-700 truncate">
                          📨 {summary.pendingCorrections} Request
                        </p>
                      )}
                    </div>
                  )}
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
            <span className="rounded-full bg-red-100 text-red-700 px-2.5 py-1">
              A Absent
            </span>
            <span className="rounded-full bg-slate-200 text-slate-700 px-2.5 py-1">
              WO Weekly Off
            </span>
            <span className="rounded-full bg-sky-100 text-sky-700 px-2.5 py-1">
              H Holiday
            </span>
          </div>
        </section>
      </div>

      {selectedDate && selectedSummary && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            onClick={() => {
              setSelectedDate(null);
              setExpandedEmployeeId(null);
            }}
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Close date details"
          />

          <aside className="absolute inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl bg-slate-50 shadow-2xl flex flex-col sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[620px] sm:rounded-none">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-t-3xl sm:rounded-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[0.14em] text-blue-300">
                    STAFF DAY DETAILS
                  </p>
                  <h2 className="text-xl font-black mt-0.5">
                    {new Intl.DateTimeFormat("en-IN", {
                      weekday: "long",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    }).format(dateFromKey(selectedDate))}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(null);
                    setExpandedEmployeeId(null);
                  }}
                  className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 font-black"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-xl bg-green-50 border border-green-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-green-700">
                    PRESENT
                  </p>
                  <p className="text-xl font-black text-green-800">
                    {selectedSummary.present}
                  </p>
                </div>

                <div className="rounded-xl bg-purple-50 border border-purple-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-purple-700">
                    LEAVE
                  </p>
                  <p className="text-xl font-black text-purple-800">
                    {selectedSummary.leave}
                  </p>
                </div>

                <div className="rounded-xl bg-red-50 border border-red-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-red-700">
                    ABSENT
                  </p>
                  <p className="text-xl font-black text-red-800">
                    {selectedSummary.absent}
                  </p>
                </div>

                <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-cyan-700">
                    WORKED
                  </p>
                  <p className="text-xl font-black text-cyan-800">
                    {selectedSummary.employeesWorked}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="rounded-xl bg-orange-50 border border-orange-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-orange-700">
                    LATE
                  </p>
                  <p className="text-lg font-black text-orange-800">
                    {selectedSummary.late}
                  </p>
                </div>

                <div className="rounded-xl bg-violet-50 border border-violet-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-violet-700">
                    OUTPUT
                  </p>
                  <p className="text-lg font-black text-violet-800">
                    {selectedSummary.completedWork}
                  </p>
                </div>

                <div className="rounded-xl bg-blue-50 border border-blue-100 p-2.5 text-center">
                  <p className="text-[9px] font-black text-blue-700">
                    TOTAL HOURS
                  </p>
                  <p className="text-lg font-black text-blue-800">
                    {formatWorking(selectedSummary.workingMinutes)}
                  </p>
                </div>
              </div>

              {selectedSummary.pendingCorrections > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    router.push("/admin/attendance-approval")
                  }
                  className="w-full mt-3 rounded-xl bg-orange-50 border border-orange-200 px-4 py-3 text-left"
                >
                  <p className="text-xs font-black text-orange-800">
                    📨 {selectedSummary.pendingCorrections} Attendance
                    Correction Request Pending
                  </p>
                  <p className="text-[10px] font-semibold text-orange-700 mt-1">
                    Open Attendance Approval →
                  </p>
                </button>
              )}

              <div className="space-y-2.5 mt-4">
                {selectedRows.map((row) => {
                  const expanded =
                    expandedEmployeeId === row.employee.id;

                  const completedTotal =
                    row.stageCompleted.length +
                    row.tasksCompleted.length;

                  return (
                    <div
                      key={row.employee.id}
                      className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedEmployeeId(
                            expanded ? null : row.employee.id
                          )
                        }
                        className="w-full p-3 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-black text-sm text-slate-900 truncate">
                              {row.employee.full_name}
                            </p>
                            <p className="text-[10px] font-semibold text-slate-500 mt-0.5">
                              {row.employee.department || "Employee"}
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black ${row.attendanceClass}`}
                          >
                            {row.attendanceLabel}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-1.5 mt-3">
                          <div className="rounded-lg bg-slate-50 p-2">
                            <p className="text-[8px] font-black text-slate-500">
                              HOURS
                            </p>
                            <p className="text-[11px] font-black text-slate-800 mt-0.5">
                              {formatWorking(
                                row.attendance?.working_minutes || 0
                              )}
                            </p>
                          </div>

                          <div className="rounded-lg bg-cyan-50 p-2">
                            <p className="text-[8px] font-black text-cyan-600">
                              STAGES
                            </p>
                            <p className="text-[11px] font-black text-cyan-800 mt-0.5">
                              {row.stageWorked.length}
                            </p>
                          </div>

                          <div className="rounded-lg bg-violet-50 p-2">
                            <p className="text-[8px] font-black text-violet-600">
                              TASKS
                            </p>
                            <p className="text-[11px] font-black text-violet-800 mt-0.5">
                              {row.tasksWorked.length}
                            </p>
                          </div>

                          <div className="rounded-lg bg-green-50 p-2">
                            <p className="text-[8px] font-black text-green-600">
                              OUTPUT
                            </p>
                            <p className="text-[11px] font-black text-green-800 mt-0.5">
                              {completedTotal}
                            </p>
                          </div>
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-slate-200 bg-slate-50 p-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                              <p className="text-[9px] font-black text-green-700">
                                CHECK IN
                              </p>
                              <p className="font-black text-sm mt-1">
                                {formatTime(
                                  row.attendance?.check_in || null
                                )}
                              </p>
                            </div>

                            <div className="rounded-xl bg-white border border-slate-200 p-3">
                              <p className="text-[9px] font-black text-red-700">
                                CHECK OUT
                              </p>
                              <p className="font-black text-sm mt-1">
                                {formatTime(
                                  row.attendance?.check_out || null
                                )}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3">
                            <p className="text-[9px] font-black text-cyan-700">
                              ORDER / STAGE WORK
                            </p>

                            {row.stageWorked.length === 0 ? (
                              <p className="text-xs text-slate-500 mt-2">
                                No recorded stage work.
                              </p>
                            ) : (
                              <div className="space-y-2 mt-2">
                                {row.stageWorked.map((work) => {
                                  const order = orderMap.get(work.order_id);
                                  const stage = stageMap.get(work.stage_id);

                                  return (
                                    <div
                                      key={work.id}
                                      className="rounded-xl bg-white border border-cyan-100 p-3"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="font-black text-xs text-slate-900">
                                            {order?.order_number || "Order"} •{" "}
                                            {stage?.name || "Stage"}
                                          </p>
                                          <p className="text-[10px] text-slate-500 mt-1">
                                            {order?.customer_name || "-"} •{" "}
                                            {order?.product_name || "-"}
                                          </p>
                                        </div>

                                        <span className="rounded-full bg-cyan-50 px-2 py-1 text-[8px] font-black text-cyan-700">
                                          {work.status}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="mt-3">
                            <p className="text-[9px] font-black text-violet-700">
                              TASK WORK
                            </p>

                            {row.tasksWorked.length === 0 ? (
                              <p className="text-xs text-slate-500 mt-2">
                                No recorded task work.
                              </p>
                            ) : (
                              <div className="space-y-2 mt-2">
                                {row.tasksWorked.map((task) => (
                                  <div
                                    key={task.id}
                                    className="rounded-xl bg-white border border-violet-100 p-3"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="font-black text-xs text-slate-900">
                                        {task.title}
                                      </p>
                                      <span className="rounded-full bg-violet-50 px-2 py-1 text-[8px] font-black text-violet-700">
                                        {task.status}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
