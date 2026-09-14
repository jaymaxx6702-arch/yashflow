"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
  role: string | null;
};

type AttendanceRow = {
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

type LeaveRow = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  status: string;
  leave_type: string | null;
  reason: string | null;
};

type DayStatus =
  | "present"
  | "late"
  | "half_day"
  | "leave"
  | "not_checked_in"
  | "checked_out";

type StaffDayRow = {
  employee: Employee;
  attendance: AttendanceRow | null;
  leave: LeaveRow | null;
  status: DayStatus;
};

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

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function formatWorkingMinutes(minutes: number | null) {
  if (!minutes || minutes <= 0) return "-";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
}

function statusLabel(status: DayStatus) {
  switch (status) {
    case "late":
      return "Late";
    case "half_day":
      return "Half Day";
    case "leave":
      return "On Leave";
    case "not_checked_in":
      return "Not Checked In";
    case "checked_out":
      return "Check Out Done";
    default:
      return "Present";
  }
}

function statusStyle(status: DayStatus) {
  switch (status) {
    case "late":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "half_day":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "leave":
      return "bg-purple-100 text-purple-800 border-purple-200";
    case "not_checked_in":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "checked_out":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-green-100 text-green-800 border-green-200";
  }
}

export default function WorkCalendarPage() {
  const router = useRouter();

  const today = useMemo(() => indiaDate(), []);
  const [selectedDate, setSelectedDate] = useState(today);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [leaveRows, setLeaveRows] = useState<LeaveRow[]>([]);

  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  async function loadDay() {
    const supabase = createClient();

    setRefreshing(true);
    setMessage("");

    const [employeeResult, attendanceResult, leaveResult] =
      await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, mobile, department, role")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .order("full_name"),

        supabase
          .from("attendance")
          .select(`
            id,
            employee_id,
            attendance_date,
            check_in,
            check_out,
            attendance_type,
            late_minutes,
            working_minutes,
            approval_status
          `)
          .eq("attendance_date", selectedDate),

        supabase
          .from("leave_requests")
          .select(`
            id,
            employee_id,
            start_date,
            end_date,
            status,
            leave_type,
            reason
          `)
          .eq("status", "approved")
          .lte("start_date", selectedDate)
          .gte("end_date", selectedDate),
      ]);

    const firstError =
      employeeResult.error ||
      attendanceResult.error ||
      leaveResult.error;

    if (firstError) {
      setMessage(`Work Calendar Load Error: ${firstError.message}`);
      setRefreshing(false);
      return;
    }

    setEmployees(
      ((employeeResult.data || []) as Employee[]).filter(
        (employee) =>
          (employee.role || "").toLowerCase() !== "admin"
      )
    );

    setAttendance(
      (attendanceResult.data || []) as AttendanceRow[]
    );

    setLeaveRows((leaveResult.data || []) as LeaveRow[]);
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

      await loadDay();
      setLoading(false);
    }

    init();
  }, [router]);

  useEffect(() => {
    if (loading) return;
    void loadDay();
  }, [selectedDate]);

  const staffRows = useMemo<StaffDayRow[]>(() => {
    const attendanceMap = new Map(
      attendance
        .filter((row) => row.approval_status !== "rejected")
        .map((row) => [row.employee_id, row])
    );

    const leaveMap = new Map(
      leaveRows.map((row) => [row.employee_id, row])
    );

    return employees.map((employee) => {
      const attendanceRow =
        attendanceMap.get(employee.id) || null;
      const leaveRow = leaveMap.get(employee.id) || null;

      let status: DayStatus = "not_checked_in";

      if (leaveRow) {
        status = "leave";
      } else if (attendanceRow) {
        if (attendanceRow.check_out) {
          status = "checked_out";
        } else if (
          attendanceRow.attendance_type === "half_day"
        ) {
          status = "half_day";
        } else if (attendanceRow.attendance_type === "late") {
          status = "late";
        } else {
          status = "present";
        }
      }

      return {
        employee,
        attendance: attendanceRow,
        leave: leaveRow,
        status,
      };
    });
  }, [employees, attendance, leaveRows]);

  const departments = useMemo(() => {
    return Array.from(
      new Set(
        employees
          .map((employee) => employee.department)
          .filter((value): value is string => !!value)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  const filteredRows = useMemo(() => {
    const search = searchText.trim().toLowerCase();

    return staffRows.filter((row) => {
      const departmentMatch =
        departmentFilter === "all" ||
        row.employee.department === departmentFilter;

      const statusMatch =
        statusFilter === "all" ||
        row.status === statusFilter;

      const searchMatch =
        !search ||
        row.employee.full_name.toLowerCase().includes(search) ||
        row.employee.mobile.includes(search) ||
        (row.employee.department || "")
          .toLowerCase()
          .includes(search);

      return departmentMatch && statusMatch && searchMatch;
    });
  }, [
    staffRows,
    departmentFilter,
    statusFilter,
    searchText,
  ]);

  const summary = useMemo(() => {
    return staffRows.reduce(
      (acc, row) => {
        if (row.status === "leave") {
          acc.leave += 1;
        } else if (row.status === "not_checked_in") {
          acc.notCheckedIn += 1;
        } else {
          acc.present += 1;
        }

        if (row.status === "late") {
          acc.late += 1;
        }

        if (row.status === "half_day") {
          acc.halfDay += 1;
        }

        if (row.status === "checked_out") {
          acc.checkedOut += 1;
        }

        return acc;
      },
      {
        total: staffRows.length,
        present: 0,
        late: 0,
        halfDay: 0,
        leave: 0,
        notCheckedIn: 0,
        checkedOut: 0,
      }
    );
  }, [staffRows]);

  function shiftDate(days: number) {
    const date = new Date(`${selectedDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    setSelectedDate(date.toISOString().slice(0, 10));
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Work Calendar લોડ થઈ રહ્યું છે...
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
              YASHFLOW STAFF
            </p>

            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Work Calendar
            </h1>

            <p className="text-sm font-semibold text-blue-100 mt-1">
              Daily staff availability, attendance અને leave એક જગ્યાએ.
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
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-blue-700">
                SELECT DATE
              </p>

              <h2 className="text-xl font-black text-slate-900 mt-1">
                {formatDisplayDate(selectedDate)}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="yf-btn yf-btn-secondary"
              >
                ← Previous
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="yf-input max-w-[190px]"
              />

              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                className="yf-btn yf-btn-primary"
              >
                Today
              </button>

              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="yf-btn yf-btn-secondary"
              >
                Next →
              </button>

              <button
                type="button"
                onClick={() => void loadDay()}
                disabled={refreshing}
                className="yf-btn yf-btn-secondary disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4 mt-5">
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">
              TOTAL STAFF
            </p>
            <p className="text-3xl font-black mt-2">
              {summary.total}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-green-50 border-green-100">
            <p className="text-xs font-black text-green-700">
              PRESENT
            </p>
            <p className="text-3xl font-black text-green-800 mt-2">
              {summary.present}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-orange-50 border-orange-100">
            <p className="text-xs font-black text-orange-700">
              LATE
            </p>
            <p className="text-3xl font-black text-orange-800 mt-2">
              {summary.late}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-amber-50 border-amber-100">
            <p className="text-xs font-black text-amber-700">
              HALF DAY
            </p>
            <p className="text-3xl font-black text-amber-800 mt-2">
              {summary.halfDay}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-purple-50 border-purple-100">
            <p className="text-xs font-black text-purple-700">
              ON LEAVE
            </p>
            <p className="text-3xl font-black text-purple-800 mt-2">
              {summary.leave}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-slate-50 border-slate-200">
            <p className="text-xs font-black text-slate-600">
              NOT CHECKED IN
            </p>
            <p className="text-3xl font-black text-slate-800 mt-2">
              {summary.notCheckedIn}
            </p>
          </div>

          <div className="yf-card p-4 bg-gradient-to-br from-white to-blue-50 border-blue-100">
            <p className="text-xs font-black text-blue-700">
              CHECK OUT DONE
            </p>
            <p className="text-3xl font-black text-blue-800 mt-2">
              {summary.checkedOut}
            </p>
          </div>
        </section>

        <section className="yf-card p-5 sm:p-6 mt-5">
          <div className="grid md:grid-cols-3 gap-3">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="yf-input"
            >
              <option value="all">All Departments</option>

              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="yf-input"
            >
              <option value="all">All Status</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="leave">On Leave</option>
              <option value="not_checked_in">
                Not Checked In
              </option>
              <option value="checked_out">
                Check Out Done
              </option>
            </select>

            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Employee / Mobile / Department"
              className="yf-input"
            />
          </div>
        </section>

        <section className="yf-card mt-5 overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="yf-section-title">
                  Staff Availability
                </h2>

                <p className="yf-section-subtitle mt-1">
                  Selected date માટે actual attendance અને approved leave.
                </p>
              </div>

              <span className="yf-badge yf-badge-blue">
                {filteredRows.length} Staff
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4">Employee</th>
                  <th className="text-left px-5 py-4">Department</th>
                  <th className="text-left px-5 py-4">Status</th>
                  <th className="text-left px-5 py-4">Check In</th>
                  <th className="text-left px-5 py-4">Check Out</th>
                  <th className="text-left px-5 py-4">Late</th>
                  <th className="text-left px-5 py-4">Working</th>
                  <th className="text-left px-5 py-4">Leave</th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.employee.id}
                    className="border-t border-slate-200"
                  >
                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">
                        {row.employee.full_name}
                      </p>

                      <p className="text-xs font-semibold text-slate-400 mt-1">
                        {row.employee.mobile}
                      </p>
                    </td>

                    <td className="px-5 py-4 font-semibold text-slate-700">
                      {row.employee.department || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusStyle(
                          row.status
                        )}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {formatTime(row.attendance?.check_in || null)}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {formatTime(row.attendance?.check_out || null)}
                    </td>

                    <td className="px-5 py-4">
                      {row.attendance?.late_minutes || 0} min
                    </td>

                    <td className="px-5 py-4 font-bold text-cyan-700">
                      {formatWorkingMinutes(
                        row.attendance?.working_minutes || null
                      )}
                    </td>

                    <td className="px-5 py-4">
                      {row.leave ? (
                        <div>
                          <p className="font-bold text-purple-700">
                            {row.leave.leave_type || "Approved Leave"}
                          </p>

                          {row.leave.reason && (
                            <p className="text-xs text-slate-500 mt-1 max-w-xs">
                              {row.leave.reason}
                            </p>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}

                {filteredRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-slate-500 font-semibold"
                    >
                      Selected filters માટે staff data મળ્યો નથી.
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
