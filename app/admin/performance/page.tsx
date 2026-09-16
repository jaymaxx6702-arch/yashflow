"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  role: string | null;
};

type EmployeeDepartment = {
  employee_id: string;
  department_id: number;
  departments:
    | {
        id: number;
        name: string;
      }
    | {
        id: number;
        name: string;
      }[]
    | null;
};

type AttendanceRow = {
  employee_id: string;
  attendance_date: string;
  attendance_type: string | null;
  late_minutes: number | null;
  working_minutes: number | null;
  approval_status: string | null;
};

type StageWork = {
  id: string;
  status: string;
  primary_employee_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type StageWorker = {
  order_stage_work_id: string;
  employee_id: string;
  worker_role: "primary" | "support";
  left_at: string | null;
};

type TaskRow = Record<string, unknown> & {
  id?: string;
  status?: string;
  completed_at?: string | null;
  created_at?: string | null;
};

type EmployeeMetric = {
  employee: Employee;
  departments: string[];
  presentDays: number;
  lateDays: number;
  halfDays: number;
  workingMinutes: number;
  completedStages: number;
  activeStages: number;
  approvalStages: number;
  reworkStages: number;
  completedTasks: number;
  activeTasks: number;
  avgStageMinutes: number | null;
  outputTotal: number;
};

const ACTIVE_WORK_STATUSES = [
  "waiting",
  "assigned",
  "in_progress",
  "ready_for_approval",
  "hold",
  "rework",
];

function indiaDate() {
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

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

function inRange(
  value: string | null | undefined,
  startDate: string,
  endDate: string
) {
  const date = dateOnly(value);
  if (!date) return false;
  return date >= startDate && date <= endDate;
}

function formatMinutes(minutes: number) {
  if (!minutes) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatAvgMinutes(minutes: number | null) {
  if (minutes === null) return "-";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function getTaskEmployeeId(task: TaskRow) {
  const candidates = [
    task.employee_id,
    task.assigned_employee_id,
    task.assigned_to,
    task.assignee_id,
  ];

  const value = candidates.find(
    (item) => typeof item === "string" && item.length > 0
  );

  return typeof value === "string" ? value : null;
}

function getDepartmentName(item: EmployeeDepartment) {
  if (Array.isArray(item.departments)) {
    return item.departments[0]?.name || null;
  }

  return item.departments?.name || null;
}

export default function PerformanceReportPage() {
  const router = useRouter();

  const today = useMemo(() => indiaDate(), []);
  const [startDate, setStartDate] = useState(monthStart(today));
  const [endDate, setEndDate] = useState(today);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeDepartments, setEmployeeDepartments] = useState<
    EmployeeDepartment[]
  >([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [stageWorkers, setStageWorkers] = useState<StageWorker[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  async function loadReport() {
    const supabase = createClient();

    setRefreshing(true);
    setMessage("");

    const [
      employeesResult,
      employeeDepartmentsResult,
      attendanceResult,
      stageWorksResult,
      stageWorkersResult,
      tasksResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, department, role")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_hidden", false)
        .order("full_name"),

      supabase
        .from("employee_departments")
        .select(`
          employee_id,
          department_id,
          departments (
            id,
            name
          )
        `),

      supabase
        .from("attendance")
        .select(`
          employee_id,
          attendance_date,
          attendance_type,
          late_minutes,
          working_minutes,
          approval_status
        `)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate),

      supabase
        .from("order_stage_work")
        .select(`
          id,
          status,
          primary_employee_id,
          started_at,
          completed_at,
          created_at
        `),

      supabase
        .from("order_stage_workers")
        .select(`
          order_stage_work_id,
          employee_id,
          worker_role,
          left_at
        `),

      // select("*") intentionally keeps this report compatible with the
      // current Tasks assignment column used in your project/RLS.
      supabase.from("tasks").select("*"),
    ]);

    const firstError =
      employeesResult.error ||
      employeeDepartmentsResult.error ||
      attendanceResult.error ||
      stageWorksResult.error ||
      stageWorkersResult.error;

    if (firstError) {
      setMessage(`Performance Load Error: ${firstError.message}`);
      setRefreshing(false);
      return;
    }

    // Tasks should not break the full report if its RLS/schema changes.
    if (tasksResult.error) {
      console.warn("Tasks performance unavailable:", tasksResult.error.message);
    }

    const employeeRows = (employeesResult.data || []) as Employee[];

    setEmployees(
      employeeRows.filter(
        (employee) => (employee.role || "").toLowerCase() !== "admin"
      )
    );

    setEmployeeDepartments(
      (employeeDepartmentsResult.data || []) as unknown as EmployeeDepartment[]
    );
    setAttendance((attendanceResult.data || []) as AttendanceRow[]);
    setStageWorks((stageWorksResult.data || []) as StageWork[]);
    setStageWorkers((stageWorkersResult.data || []) as StageWorker[]);
    setTasks((tasksResult.data || []) as TaskRow[]);

    setRefreshing(false);
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

      const { data: admin, error: adminError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

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

      await loadReport();
      setLoading(false);
    }

    init();
  }, [router]);

  const departmentNamesByEmployee = useMemo(() => {
    const map = new Map<string, string[]>();

    for (const employee of employees) {
      const names = new Set<string>();

      if (employee.department) {
        names.add(employee.department);
      }

      for (const assignment of employeeDepartments) {
        if (assignment.employee_id !== employee.id) continue;

        const name = getDepartmentName(assignment);
        if (name) names.add(name);
      }

      map.set(employee.id, Array.from(names));
    }

    return map;
  }, [employees, employeeDepartments]);

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();

    for (const employee of employees) {
      for (const departmentName of
        departmentNamesByEmployee.get(employee.id) || []) {
        names.add(departmentName);
      }
    }

    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [employees, departmentNamesByEmployee]);

  const workersByWork = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const work of stageWorks) {
      const members = new Set<string>();

      if (work.primary_employee_id) {
        members.add(work.primary_employee_id);
      }

      for (const link of stageWorkers) {
        if (
          link.order_stage_work_id === work.id &&
          !link.left_at
        ) {
          members.add(link.employee_id);
        }
      }

      map.set(work.id, members);
    }

    return map;
  }, [stageWorks, stageWorkers]);

  const metrics = useMemo<EmployeeMetric[]>(() => {
    return employees.map((employee) => {
      const employeeAttendance = attendance.filter(
        (item) =>
          item.employee_id === employee.id &&
          item.approval_status !== "rejected"
      );

      const completedWork = stageWorks.filter(
        (work) =>
          work.status === "completed" &&
          inRange(work.completed_at, startDate, endDate) &&
          workersByWork.get(work.id)?.has(employee.id)
      );

      const activeWork = stageWorks.filter(
        (work) =>
          ACTIVE_WORK_STATUSES.includes(work.status) &&
          workersByWork.get(work.id)?.has(employee.id)
      );

      const employeeTasks = tasks.filter(
        (task) => getTaskEmployeeId(task) === employee.id
      );

      const completedTasks = employeeTasks.filter(
        (task) =>
          task.status === "completed" &&
          inRange(task.completed_at, startDate, endDate)
      ).length;

      const activeTasks = employeeTasks.filter(
        (task) =>
          task.status === "pending" ||
          task.status === "in_progress"
      ).length;

      const stageDurations = completedWork
        .map((work) => {
          if (!work.started_at || !work.completed_at) return null;

          const start = new Date(work.started_at).getTime();
          const end = new Date(work.completed_at).getTime();

          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
            return null;
          }

          return Math.round((end - start) / 60000);
        })
        .filter((value): value is number => value !== null);

      const avgStageMinutes =
        stageDurations.length > 0
          ? Math.round(
              stageDurations.reduce((sum, value) => sum + value, 0) /
                stageDurations.length
            )
          : null;

      const completedStages = completedWork.length;

      return {
        employee,
        departments:
          departmentNamesByEmployee.get(employee.id) || [],
        presentDays: employeeAttendance.length,
        lateDays: employeeAttendance.filter(
          (item) => item.attendance_type === "late"
        ).length,
        halfDays: employeeAttendance.filter(
          (item) => item.attendance_type === "half_day"
        ).length,
        workingMinutes: employeeAttendance.reduce(
          (sum, item) => sum + (item.working_minutes || 0),
          0
        ),
        completedStages,
        activeStages: activeWork.length,
        approvalStages: activeWork.filter(
          (work) => work.status === "ready_for_approval"
        ).length,
        reworkStages: activeWork.filter(
          (work) => work.status === "rework"
        ).length,
        completedTasks,
        activeTasks,
        avgStageMinutes,
        outputTotal: completedStages + completedTasks,
      };
    });
  }, [
    employees,
    attendance,
    stageWorks,
    tasks,
    startDate,
    endDate,
    workersByWork,
    departmentNamesByEmployee,
  ]);

  const filteredMetrics = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return metrics
      .filter((metric) => {
        const departmentMatch =
          departmentFilter === "all" ||
          metric.departments.includes(departmentFilter);

        const searchMatch =
          !search ||
          metric.employee.full_name.toLowerCase().includes(search) ||
          metric.departments.some((name) =>
            name.toLowerCase().includes(search)
          );

        return departmentMatch && searchMatch;
      })
      .sort((a, b) => {
        if (b.outputTotal !== a.outputTotal) {
          return b.outputTotal - a.outputTotal;
        }

        if (b.completedStages !== a.completedStages) {
          return b.completedStages - a.completedStages;
        }

        return a.employee.full_name.localeCompare(b.employee.full_name);
      });
  }, [metrics, departmentFilter, searchText]);

  const summary = useMemo(() => {
    return filteredMetrics.reduce(
      (acc, item) => {
        acc.completedStages += item.completedStages;
        acc.completedTasks += item.completedTasks;
        acc.activeWork += item.activeStages + item.activeTasks;
        acc.workingMinutes += item.workingMinutes;
        acc.lateDays += item.lateDays;
        return acc;
      },
      {
        completedStages: 0,
        completedTasks: 0,
        activeWork: 0,
        workingMinutes: 0,
        lateDays: 0,
      }
    );
  }, [filteredMetrics]);

  const topOutput = filteredMetrics[0] || null;

  async function applyFilters() {
    if (!startDate || !endDate) {
      setMessage("Start Date અને End Date જરૂરી છે.");
      return;
    }

    if (startDate > endDate) {
      setMessage("Start Date End Date કરતાં મોટી ન હોઈ શકે.");
      return;
    }

    await loadReport();
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Performance Report લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-blue-100">
              YASHFLOW PERFORMANCE
            </p>

            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Team Performance Report
            </h1>

            <p className="text-sm font-semibold text-blue-100 mt-1">
              Work output • Tasks • Attendance • Working Hours
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">
            {message}
          </div>
        )}

        <section className="yf-card p-5 sm:p-6">
          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-500 mb-2">
                START DATE
              </label>

              <input
                type="date"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-2">
                END DATE
              </label>

              <input
                type="date"
                value={endDate}
                min={startDate}
                max={today}
                onChange={(e) => setEndDate(e.target.value)}
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-2">
                DEPARTMENT
              </label>

              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="yf-input"
              >
                <option value="all">All Departments</option>

                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-2">
                SEARCH
              </label>

              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Employee / Department"
                className="yf-input"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={applyFilters}
                disabled={refreshing}
                className="yf-btn yf-btn-primary w-full disabled:opacity-50"
              >
                {refreshing ? "Loading..." : "Apply / Refresh"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-6 gap-4 mt-5">
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">
              TEAM MEMBERS
            </p>
            <p className="text-3xl font-black text-slate-900 mt-2">
              {filteredMetrics.length}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-green-50 border-green-100">
            <p className="text-xs font-black text-green-700">
              STAGES COMPLETED
            </p>
            <p className="text-3xl font-black text-green-800 mt-2">
              {summary.completedStages}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-purple-50 border-purple-100">
            <p className="text-xs font-black text-purple-700">
              TASKS COMPLETED
            </p>
            <p className="text-3xl font-black text-purple-800 mt-2">
              {summary.completedTasks}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-blue-50 border-blue-100">
            <p className="text-xs font-black text-blue-700">
              ACTIVE WORK
            </p>
            <p className="text-3xl font-black text-blue-800 mt-2">
              {summary.activeWork}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-cyan-50 border-cyan-100">
            <p className="text-xs font-black text-cyan-700">
              WORKING HOURS
            </p>
            <p className="text-xl font-black text-cyan-800 mt-2">
              {formatMinutes(summary.workingMinutes)}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-orange-50 border-orange-100">
            <p className="text-xs font-black text-orange-700">
              LATE DAYS
            </p>
            <p className="text-3xl font-black text-orange-800 mt-2">
              {summary.lateDays}
            </p>
          </div>
        </section>

        {topOutput && (
          <section className="yf-card mt-5 p-5 bg-gradient-to-r from-white to-emerald-50 border-emerald-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.14em] text-emerald-700">
                  TOP OUTPUT IN SELECTED PERIOD
                </p>

                <h2 className="text-xl font-black text-slate-900 mt-1">
                  {topOutput.employee.full_name}
                </h2>

                <p className="text-sm font-semibold text-slate-500 mt-1">
                  {topOutput.departments.join(" • ") || "No Department"}
                </p>
              </div>

              <div className="flex gap-3">
                <div className="rounded-xl bg-white border border-emerald-100 px-4 py-3 text-center">
                  <p className="text-xs font-black text-slate-500">
                    STAGES
                  </p>
                  <p className="text-2xl font-black text-emerald-700">
                    {topOutput.completedStages}
                  </p>
                </div>

                <div className="rounded-xl bg-white border border-emerald-100 px-4 py-3 text-center">
                  <p className="text-xs font-black text-slate-500">
                    TASKS
                  </p>
                  <p className="text-2xl font-black text-emerald-700">
                    {topOutput.completedTasks}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="yf-card mt-5 overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="yf-section-title">
              Employee Performance
            </h2>

            <p className="yf-section-subtitle mt-1">
              Output Total = Completed Stages + Completed Tasks. Different departmentsનું કામ અલગ હોઈ શકે છે, એટલે આ numberને operational activity તરીકે જુઓ.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-4 py-4">Rank</th>
                  <th className="text-left px-4 py-4">Employee</th>
                  <th className="text-left px-4 py-4">Department</th>
                  <th className="text-center px-4 py-4">Output</th>
                  <th className="text-center px-4 py-4">Stages Done</th>
                  <th className="text-center px-4 py-4">Tasks Done</th>
                  <th className="text-center px-4 py-4">Active Work</th>
                  <th className="text-center px-4 py-4">Approval</th>
                  <th className="text-center px-4 py-4">Rework</th>
                  <th className="text-center px-4 py-4">Present Days</th>
                  <th className="text-center px-4 py-4">Late</th>
                  <th className="text-center px-4 py-4">Half Day</th>
                  <th className="text-center px-4 py-4">Working</th>
                  <th className="text-center px-4 py-4">Avg Stage Time</th>
                </tr>
              </thead>

              <tbody>
                {filteredMetrics.map((metric, index) => (
                  <tr
                    key={metric.employee.id}
                    className="border-t border-slate-200"
                  >
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex w-9 h-9 rounded-xl items-center justify-center font-black ${
                          index === 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {index + 1}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <p className="font-black text-slate-900">
                        {metric.employee.full_name}
                      </p>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {metric.departments.length > 0 ? (
                          metric.departments.map((department) => (
                            <span
                              key={department}
                              className="yf-badge yf-badge-blue"
                            >
                              {department}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span className="text-xl font-black text-emerald-700">
                        {metric.outputTotal}
                      </span>
                    </td>

                    <td className="px-4 py-4 text-center font-black">
                      {metric.completedStages}
                    </td>

                    <td className="px-4 py-4 text-center font-black">
                      {metric.completedTasks}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-blue-700">
                      {metric.activeStages + metric.activeTasks}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-purple-700">
                      {metric.approvalStages}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-red-700">
                      {metric.reworkStages}
                    </td>

                    <td className="px-4 py-4 text-center font-black">
                      {metric.presentDays}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-orange-700">
                      {metric.lateDays}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-amber-700">
                      {metric.halfDays}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-cyan-700">
                      {formatMinutes(metric.workingMinutes)}
                    </td>

                    <td className="px-4 py-4 text-center font-black text-slate-700">
                      {formatAvgMinutes(metric.avgStageMinutes)}
                    </td>
                  </tr>
                ))}

                {filteredMetrics.length === 0 && (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-5 py-12 text-center text-slate-500 font-semibold"
                    >
                      Selected filters માટે employee data મળ્યો નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
