"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
  role: string | null;
  approval_status: string;
  is_active: boolean;
};

type Department = {
  id: number;
  name: string;
};

type EmployeeDepartment = {
  department_id: number;
  is_primary: boolean;
  departments: Department | Department[] | null;
};

type Attendance = {
  id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  attendance_type: string;
  late_minutes: number;
  working_minutes: number;
  approval_required: boolean;
  approval_status: string;
  approved_at: string | null;
  admin_note: string | null;
};

type OfficeSettings = {
  office_start_time: string;
  grace_minutes: number;
  office_end_time: string;
  recess_start_time: string;
  recess_end_time: string;
  half_day_checkin_time: string;
  standard_work_minutes: number;
  timezone: string;
};

export default function EmployeeDashboard() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [employeeDepartments, setEmployeeDepartments] = useState<EmployeeDepartment[]>([]);
  const [officeSettings, setOfficeSettings] =
    useState<OfficeSettings | null>(null);

  const [departmentOrderCount, setDepartmentOrderCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [message, setMessage] = useState("");

  function getDateInTimeZone(timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    return `${year}-${month}-${day}`;
  }

  function getMinutesFromDate(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const hour = Number(
      parts.find((p) => p.type === "hour")?.value || 0
    );

    const minute = Number(
      parts.find((p) => p.type === "minute")?.value || 0
    );

    return hour * 60 + minute;
  }

  function timeStringToMinutes(value: string) {
    const [hour, minute] = value.split(":").map(Number);

    return hour * 60 + minute;
  }

  function formatTime(value: string | null) {
    if (!value) return "-";

    return new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
    });
  }

  function formatOfficeTime(value: string) {
    const [hourString, minuteString] = value.split(":");

    const hour = Number(hourString);
    const minute = Number(minuteString);

    const suffix = hour >= 12 ? "PM" : "AM";

    const displayHour = hour % 12 || 12;

    return `${displayHour}:${String(minute).padStart(
      2,
      "0"
    )} ${suffix}`;
  }

  function formatWorkingMinutes(minutes: number) {
    if (minutes <= 0) return "-";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return `${mins} મિનિટ`;
    }

    return `${hours} કલાક ${mins} મિનિટ`;
  }

  function formatLateMinutes(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")} Min`;
  }

  function formatTodayDate(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function formatTodayDay(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
      weekday: "long",
    }).format(date);
  }

  function formatCurrentTime(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).format(date);
  }

  function getAttendanceLabel(type: string) {
    switch (type) {
      case "late":
        return "Late";

      case "half_day":
        return "Half Day";

      case "leave":
        return "Leave";

      case "absent":
        return "Absent";

      default:
        return "Present";
    }
  }

  async function loadEmployeeDepartments(employeeId: string) {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("employee_departments")
      .select(`
        department_id,
        is_primary,
        departments (
          id,
          name
        )
      `)
      .eq("employee_id", employeeId)
      .order("is_primary", { ascending: false });

    if (error) {
      setMessage(`Department Load Error: ${error.message}`);
      return [] as string[];
    }

    const assignments =
      (data || []) as unknown as EmployeeDepartment[];

    setEmployeeDepartments(assignments);

    return assignments
      .map((item) => {
        const departmentData = Array.isArray(item.departments)
          ? item.departments[0] || null
          : item.departments;

        return departmentData?.name || null;
      })
      .filter(Boolean) as string[];
  }

  function getDepartmentFromAssignment(item: EmployeeDepartment) {
    if (Array.isArray(item.departments)) {
      return item.departments[0] || null;
    }

    return item.departments;
  }

  function assignedDepartmentNames() {
    const names = employeeDepartments
      .map((item) => getDepartmentFromAssignment(item)?.name)
      .filter(Boolean) as string[];

    if (names.length > 0) return names;

    return employee?.department ? [employee.department] : [];
  }

  async function loadLiveSummary(
    employeeId: string,
    departmentNames: string[]
  ) {
    const supabase = createClient();

    const stageMap: Record<string, string | null> = {
      Design: "design",
      Cutting: "cutting",
      Production: "production",
      Packing: "packing",
      "Transportation/Dispatch": "transportation_dispatch",
      Dispatch: "transportation_dispatch",
      Transportation: "transportation_dispatch",
    };

    const departmentStages = Array.from(
      new Set(
        departmentNames
          .map((name) => stageMap[name] || null)
          .filter(Boolean) as string[]
      )
    );

    const leaveResult = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "pending");

    if (!leaveResult.error) {
      setPendingLeaveCount(leaveResult.count || 0);
    }

    if (departmentStages.length === 0) {
      setDepartmentOrderCount(0);
      return;
    }

    const orderResult = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("current_stage", departmentStages);

    if (!orderResult.error) {
      setDepartmentOrderCount(orderResult.count || 0);
    }
  }

  async function loadAttendance(
    employeeId: string,
    settings: OfficeSettings
  ) {
    const supabase = createClient();

    const today = getDateInTimeZone(settings.timezone);

    const { data, error } = await supabase
      .from("attendance")
      .select(
        `
        id,
        attendance_date,
        check_in,
        check_out,
        status,
        attendance_type,
        late_minutes,
        working_minutes,
        approval_required,
        approval_status,
        approved_at,
        admin_note
        `
      )
      .eq("employee_id", employeeId)
      .eq("attendance_date", today)
      .maybeSingle();

    if (!error) {
      setAttendance(data);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: empData, error: empError } =
        await supabase
          .from("employees")
          .select(
            "id, full_name, mobile, department, role, approval_status, is_active"
          )
          .eq("auth_user_id", user.id)
          .single();

      if (
        empError ||
        !empData ||
        empData.approval_status !== "approved" ||
        !empData.is_active
      ) {
        await supabase.auth.signOut();

        router.replace("/");

        return;
      }

      const {
        data: settingsData,
        error: settingsError,
      } = await supabase
        .from("office_settings")
        .select(
          `
          office_start_time,
          grace_minutes,
          office_end_time,
          recess_start_time,
          recess_end_time,
          half_day_checkin_time,
          standard_work_minutes,
          timezone
          `
        )
        .eq("is_active", true)
        .single();

      if (settingsError || !settingsData) {
        setMessage("Office timing settings મળી નથી.");
        setLoading(false);
        return;
      }

      setEmployee(empData);
      setOfficeSettings(settingsData);

      await loadAttendance(empData.id, settingsData);

      const departmentNames =
        await loadEmployeeDepartments(empData.id);

      const summaryDepartments =
        departmentNames.length > 0
          ? departmentNames
          : empData.department
          ? [empData.department]
          : [];

      await loadLiveSummary(
        empData.id,
        summaryDepartments
      );

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  async function handleCheckIn() {
    if (!employee || !officeSettings) return;

    setAttendanceLoading(true);
    setMessage("");

    const supabase = createClient();

    const now = new Date();

    const today = getDateInTimeZone(
      officeSettings.timezone
    );

    const currentMinutes = getMinutesFromDate(
      now,
      officeSettings.timezone
    );

    const officeStartMinutes = timeStringToMinutes(
      officeSettings.office_start_time
    );

    const graceEndMinutes =
      officeStartMinutes + officeSettings.grace_minutes;

    const halfDayMinutes = timeStringToMinutes(
      officeSettings.half_day_checkin_time
    );

    let attendanceType = "present";

    if (currentMinutes >= halfDayMinutes) {
      attendanceType = "half_day";
    } else if (currentMinutes > graceEndMinutes) {
      attendanceType = "late";
    }

    const lateMinutes =
      currentMinutes > graceEndMinutes
        ? currentMinutes - graceEndMinutes
        : 0;

    const approvalRequired =
      attendanceType === "late" ||
      attendanceType === "half_day";

    const { error } = await supabase
      .from("attendance")
      .insert({
        employee_id: employee.id,
        attendance_date: today,
        check_in: now.toISOString(),

        status:
          attendanceType === "half_day"
            ? "half_day"
            : "present",

        attendance_type: attendanceType,

        late_minutes: lateMinutes,

        working_minutes: 0,

        approval_required: approvalRequired,

        approval_status: approvalRequired
          ? "pending"
          : "approved",

        approved_by: null,

        approved_at: approvalRequired
          ? null
          : now.toISOString(),

        admin_note: null,
      });

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આજની હાજરી પહેલેથી નોંધાઈ ગઈ છે."
          : `Check In Error: ${error.message}`
      );

      setAttendanceLoading(false);

      return;
    }

    await loadAttendance(
      employee.id,
      officeSettings
    );

    if (attendanceType === "half_day") {
      setMessage(
        "Check In સફળ ✅ Half Day તરીકે નોંધાયું અને Admin Approval માટે મોકલાયું."
      );
    } else if (attendanceType === "late") {
      setMessage(
        `Check In સફળ ✅ તમે ${lateMinutes} મિનિટ મોડા આવ્યા છો. Admin Approval Pending છે.`
      );
    } else {
      setMessage(
        "Check In સફળ ✅ તમે સમયસર આવ્યા છો. Attendance Approved છે."
      );
    }

    setAttendanceLoading(false);
  }

  async function handleCheckOut() {
    if (
      !employee ||
      !attendance ||
      !attendance.check_in ||
      !officeSettings
    ) {
      return;
    }

    setAttendanceLoading(true);
    setMessage("");

    const supabase = createClient();

    const checkOutTime = new Date();

    const checkInTime = new Date(
      attendance.check_in
    );

    const checkInMinutes = getMinutesFromDate(
      checkInTime,
      officeSettings.timezone
    );

    const checkOutMinutes = getMinutesFromDate(
      checkOutTime,
      officeSettings.timezone
    );

    let totalMinutes =
      checkOutMinutes - checkInMinutes;

    if (totalMinutes < 0) {
      totalMinutes = 0;
    }

    const recessStartMinutes =
      timeStringToMinutes(
        officeSettings.recess_start_time
      );

    const recessEndMinutes =
      timeStringToMinutes(
        officeSettings.recess_end_time
      );

    const overlapStart = Math.max(
      checkInMinutes,
      recessStartMinutes
    );

    const overlapEnd = Math.min(
      checkOutMinutes,
      recessEndMinutes
    );

    const recessOverlap =
      Math.max(0, overlapEnd - overlapStart);

    const workingMinutes = Math.max(
      0,
      totalMinutes - recessOverlap
    );

    const { error } = await supabase
      .from("attendance")
      .update({
        check_out: checkOutTime.toISOString(),
        working_minutes: workingMinutes,
      })
      .eq("id", attendance.id);

    if (error) {
      setMessage(
        `Check Out Error: ${error.message}`
      );

      setAttendanceLoading(false);

      return;
    }

    await loadAttendance(
      employee.id,
      officeSettings
    );

    setMessage(
      `Check Out સફળ ✅ Actual Working Time: ${formatWorkingMinutes(
        workingMinutes
      )}`
    );

    setAttendanceLoading(false);
  }

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
            Dashboard લોડ થઈ રહ્યું છે...
          </p>
        </div>
      </main>
    );
  }

  if (!employee || !officeSettings) {
    return null;
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-2xl shadow-sm">
                ⚡
              </div>

              <div>
                <p className="text-xs font-black tracking-[0.18em] text-blue-100">
                  YASH LASER
                </p>

                <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
                  YashFlow
                </h1>

                <p className="text-blue-100 text-sm font-semibold mt-1">
                  Employee Work Dashboard
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        <section className="yf-card overflow-hidden">
          <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-blue-300">
                  EMPLOYEE PROFILE
                </p>

                <p className="text-sm font-semibold text-slate-300 mt-2">
                  સ્વાગત છે
                </p>

                <h2 className="text-2xl sm:text-3xl font-black mt-1">
                  {employee.full_name}
                </h2>

                <div className="flex flex-wrap gap-2 mt-4">
                  {assignedDepartmentNames().map(
                    (departmentName, index) => (
                      <span
                        key={`${departmentName}-${index}`}
                        className={`yf-badge border ${
                          index === 0
                            ? "bg-blue-500/20 border-blue-300/30 text-blue-100"
                            : "bg-violet-500/20 border-violet-300/30 text-violet-100"
                        }`}
                      >
                        {departmentName}
                        {index === 0 ? " • Primary" : ""}
                      </span>
                    )
                  )}

                  <span className="yf-badge bg-green-500/20 border border-green-300/30 text-green-100">
                    Active
                  </span>
                </div>
              </div>

              <div className="rounded-2xl bg-white/10 border border-white/15 px-5 py-4 min-w-[220px]">
                <p className="text-xs font-black tracking-[0.15em] text-blue-200">
                  NOW
                </p>

                <p className="text-lg font-black text-white mt-1">
                  {formatTodayDay(currentDateTime)}
                </p>

                <p className="text-sm font-semibold text-slate-200 mt-1">
                  {formatTodayDate(currentDateTime)}
                </p>

                <p className="text-2xl font-black text-white mt-2">
                  {formatCurrentTime(currentDateTime)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-5 bg-blue-50 border border-blue-200 rounded-2xl p-4 font-semibold text-blue-900 shadow-sm">
            {message}
          </div>
        )}

        <section className="yf-card mt-5 overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-200 bg-gradient-to-r from-white to-blue-50/70">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                  TODAY'S ATTENDANCE
                </p>

                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  આજની હાજરી
                </h3>

                <p className="text-sm font-semibold text-slate-500 mt-1">
                  {formatTodayDay(currentDateTime)}
                  {" • "}
                  {formatTodayDate(currentDateTime)}
                  {" • "}
                  {formatCurrentTime(currentDateTime)}
                </p>
              </div>

              <div>
                {!attendance && (
                  <button
                    type="button"
                    onClick={handleCheckIn}
                    disabled={attendanceLoading}
                    className="yf-btn yf-btn-success px-6 py-3 disabled:opacity-60"
                  >
                    {attendanceLoading
                      ? "Please Wait..."
                      : "Check In"}
                  </button>
                )}

                {attendance && !attendance.check_out && (
                  <button
                    type="button"
                    onClick={handleCheckOut}
                    disabled={attendanceLoading}
                    className="yf-btn yf-btn-danger px-6 py-3 disabled:opacity-60"
                  >
                    {attendanceLoading
                      ? "Please Wait..."
                      : "Check Out"}
                  </button>
                )}

                {attendance?.check_out && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <span className="yf-badge yf-badge-green px-4 py-3 text-sm">
                      Punch Out: {formatTime(attendance.check_out)} ✅
                    </span>

                    <button
                      type="button"
                      onClick={handleCheckOut}
                      disabled={attendanceLoading}
                      className="yf-btn bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60"
                    >
                      {attendanceLoading
                        ? "Please Wait..."
                        : "Punch Out Again"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="yf-card bg-gradient-to-br from-white to-slate-50 p-4">
                <p className="text-xs font-black text-slate-500">
                  STATUS
                </p>

                <p className="font-black mt-2 text-slate-900">
                  {!attendance
                    ? "Not Checked In"
                    : getAttendanceLabel(
                        attendance.attendance_type
                      )}
                </p>
              </div>

              <div className="yf-card bg-gradient-to-br from-white to-green-50 p-4 border-green-100">
                <p className="text-xs font-black text-green-700">
                  CHECK IN
                </p>

                <p className="font-black mt-2 text-green-800">
                  {formatTime(
                    attendance?.check_in || null
                  )}
                </p>
              </div>

              <div className="yf-card bg-gradient-to-br from-white to-orange-50 p-4 border-orange-100">
                <p className="text-xs font-black text-orange-700">
                  LATE
                </p>

                <p className="font-black mt-2 text-orange-800">
                  {attendance
                    ? formatLateMinutes(attendance.late_minutes)
                    : "-"}
                </p>
              </div>

              <div className="yf-card bg-gradient-to-br from-white to-red-50 p-4 border-red-100">
                <p className="text-xs font-black text-red-700">
                  CHECK OUT
                </p>

                <p className="font-black mt-2 text-red-800">
                  {formatTime(
                    attendance?.check_out || null
                  )}
                </p>
              </div>

              <div className="yf-card bg-gradient-to-br from-white to-blue-50 p-4 border-blue-100">
                <p className="text-xs font-black text-blue-700">
                  ACTUAL WORKING
                </p>

                <p className="font-black mt-2 text-blue-800">
                  {formatWorkingMinutes(
                    attendance?.working_minutes || 0
                  )}
                </p>
              </div>

              <div className="yf-card bg-gradient-to-br from-white to-violet-50 p-4 border-violet-100">
                <p className="text-xs font-black text-violet-700">
                  APPROVAL
                </p>

                <div className="mt-2">
                  {!attendance ? (
                    <span className="font-black text-slate-700">
                      -
                    </span>
                  ) : !attendance.approval_required ? (
                    <span className="font-black text-green-800">
                      Auto Approved ✓
                    </span>
                  ) : attendance.approval_status ===
                    "pending" ? (
                    <span className="font-black text-amber-700">
                      Pending ⏳
                    </span>
                  ) : attendance.approval_status ===
                    "approved" ? (
                    <span className="font-black text-green-800">
                      Approved ✓
                    </span>
                  ) : (
                    <span className="font-black text-red-700">
                      Rejected ✕
                    </span>
                  )}
                </div>
              </div>

              {attendance?.admin_note && (
                <div className="lg:col-span-6 bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <p className="text-xs font-black text-blue-700">
                    ADMIN NOTE
                  </p>

                  <p className="font-semibold text-slate-900 mt-1">
                    {attendance.admin_note}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="yf-card mt-5 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                LIVE SUMMARY
              </p>

              <h3 className="yf-section-title mt-1">
                આજનું Work Summary
              </h3>

              <p className="yf-section-subtitle mt-1">
                Attendance, current orders અને leave status એક જ જગ્યાએ.
              </p>
            </div>

            <span className="yf-badge yf-badge-blue">
              Live Data
            </span>
          </div>

          <div className="yf-summary-grid mt-5">
            <div className="yf-card yf-card-hover bg-gradient-to-br from-white to-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-slate-500">
                    ATTENDANCE
                  </p>

                  <p className="text-xl font-black text-slate-900 mt-2">
                    {!attendance
                      ? "Not Checked In"
                      : getAttendanceLabel(
                          attendance.attendance_type
                        )}
                  </p>
                </div>

                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg">
                  🕘
                </div>
              </div>
            </div>

            <div className="yf-card yf-card-hover bg-gradient-to-br from-white to-cyan-50 p-5 border-cyan-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-cyan-700">
                    DEPARTMENT ORDERS
                  </p>

                  <p className="text-3xl font-black text-cyan-800 mt-2">
                    {departmentOrderCount}
                  </p>

                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    Current work stage
                  </p>
                </div>

                <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center text-lg">
                  📦
                </div>
              </div>
            </div>

            <div className="yf-card yf-card-hover bg-gradient-to-br from-white to-purple-50 p-5 border-purple-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-purple-700">
                    PENDING LEAVE
                  </p>

                  <p className="text-3xl font-black text-purple-800 mt-2">
                    {pendingLeaveCount}
                  </p>

                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    Awaiting approval
                  </p>
                </div>

                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-lg">
                  🗓️
                </div>
              </div>
            </div>

            <div className="yf-card yf-card-hover bg-gradient-to-br from-white to-green-50 p-5 border-green-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-green-700">
                    WORKING TODAY
                  </p>

                  <p className="text-lg font-black text-green-800 mt-2">
                    {attendance?.check_out
                      ? formatWorkingMinutes(
                          attendance.working_minutes
                        )
                      : attendance?.check_in
                      ? "Running"
                      : "-"}
                  </p>

                  <p className="text-xs font-semibold text-slate-500 mt-1">
                    Actual working time
                  </p>
                </div>

                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg">
                  ⏱️
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid lg:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/orders")
            }
            className="yf-card yf-card-hover group text-left p-5 bg-gradient-to-br from-white to-cyan-50 border-cyan-100"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-cyan-700">
                  PRODUCTION WORKFLOW
                </p>

                <h3 className="text-xl font-black text-slate-900 mt-1">
                  Department Orders
                </h3>

                <p className="text-sm text-slate-600 font-medium mt-2 leading-6">
                  તમારા Primary + Additional Departmentsના Orders જુઓ અને Next Stageમાં મોકલો.
                </p>

                <p className="text-sm text-cyan-700 font-black mt-4">
                  Department Orders જુઓ →
                </p>
              </div>

              <div className="w-14 h-14 shrink-0 rounded-2xl bg-cyan-100 flex items-center justify-center text-2xl">
                📦
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/tasks")
            }
            className="yf-card yf-card-hover group text-left p-5 bg-gradient-to-br from-white to-violet-50 border-violet-100"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-violet-700">
                  TASK MANAGEMENT
                </p>

                <h3 className="text-xl font-black text-slate-900 mt-1">
                  My Tasks
                </h3>

                <p className="text-sm text-slate-600 font-medium mt-2 leading-6">
                  Assigned Tasks જુઓ અને Progress Update કરો.
                </p>

                <p className="text-sm text-violet-700 font-black mt-4">
                  My Tasks જુઓ →
                </p>
              </div>

              <div className="w-14 h-14 shrink-0 rounded-2xl bg-violet-100 flex items-center justify-center text-2xl">
                📋
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard/leave")
            }
            className="yf-card yf-card-hover group text-left p-5 bg-gradient-to-br from-white to-purple-50 border-purple-100"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-purple-700">
                  LEAVE MANAGEMENT
                </p>

                <h3 className="text-xl font-black text-slate-900 mt-1">
                  Leave Request
                </h3>

                <p className="text-sm text-slate-600 font-medium mt-2 leading-6">
                  નવી રજા માટે Request મોકલો અને જૂની Leave Requestsનું Status જુઓ.
                </p>

                <p className="text-sm text-purple-700 font-black mt-4">
                  Leave Request ખોલો →
                </p>
              </div>

              <div className="w-14 h-14 shrink-0 rounded-2xl bg-purple-100 flex items-center justify-center text-2xl">
                🗓️
              </div>
            </div>
          </button>
        </section>

        <section className="yf-card mt-5 p-5 sm:p-6">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-slate-500">
              ATTENDANCE POLICY
            </p>

            <h3 className="yf-section-title mt-1">
              Attendance Rules
            </h3>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-5">
            <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  ✓
                </div>

                <div>
                  <p className="font-black text-green-800">
                    On Time
                  </p>

                  <p className="text-sm font-medium text-slate-700 mt-1">
                    9:15 AM સુધી
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-orange-50 border border-orange-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  ⏳
                </div>

                <div>
                  <p className="font-black text-orange-800">
                    Late
                  </p>

                  <p className="text-sm font-medium text-slate-700 mt-1">
                    9:15 AM પછી અને 1:00 PM પહેલાં
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                  ½
                </div>

                <div>
                  <p className="font-black text-red-800">
                    Half Day
                  </p>

                  <p className="text-sm font-medium text-slate-700 mt-1">
                    1:00 PM કે ત્યાર પછી Check In
                  </p>
                </div>
              </div>
            </div>
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
