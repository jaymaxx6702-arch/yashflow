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
  const [officeSettings, setOfficeSettings] =
    useState<OfficeSettings | null>(null);

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

    /*
      Recess overlap calculate કરીએ.
      Example:
      Check In 9:00
      Check Out 6:00
      Total = 540 minutes
      Recess = 60 minutes
      Working = 480 minutes
    */

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
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Dashboard લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  if (!employee || !officeSettings) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-blue-600 text-white">
        <div className="max-w-6xl mx-auto px-5 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow
            </h1>

            <p className="text-blue-100 text-sm">
              Yash Laser Work Management
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="bg-white/15 px-4 py-2 rounded-xl font-semibold"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-5">
        <section className="bg-white border rounded-2xl p-6">
          <p className="text-sm text-slate-500">
            સ્વાગત છે
          </p>

          <h2 className="text-2xl font-black mt-1">
            {employee.full_name}
          </h2>

          <div className="flex gap-2 mt-4">
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
              {employee.department}
            </span>

            <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
              Active
            </span>
          </div>
        </section>

        {message && (
          <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl p-4 font-semibold text-blue-800">
            {message}
          </div>
        )}

        <section className="bg-white border rounded-2xl p-6 mt-5">
          <div className="flex flex-col lg:flex-row lg:justify-between gap-5">
            <div>
              <h3 className="text-xl font-black">
                આજની હાજરી
              </h3>

              <p className="text-sm text-slate-500 mt-2">
                Office:{" "}
                {formatOfficeTime(
                  officeSettings.office_start_time
                )}
                {" → "}
                {formatOfficeTime(
                  officeSettings.office_end_time
                )}
              </p>

              <p className="text-sm text-slate-500 mt-1">
                Grace:{" "}
                {officeSettings.grace_minutes} મિનિટ
                {" • "}
                Recess:{" "}
                {formatOfficeTime(
                  officeSettings.recess_start_time
                )}
                {" → "}
                {formatOfficeTime(
                  officeSettings.recess_end_time
                )}
              </p>

              <p className="text-sm text-slate-500 mt-1">
                Standard Working Time:{" "}
                {formatWorkingMinutes(
                  officeSettings.standard_work_minutes
                )}
              </p>
            </div>

            <div>
              {!attendance && (
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={attendanceLoading}
                  className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                >
                  {attendanceLoading
                    ? "Please Wait..."
                    : "Check In"}
                </button>
              )}

              {attendance &&
                !attendance.check_out && (
                  <button
                    type="button"
                    onClick={handleCheckOut}
                    disabled={attendanceLoading}
                    className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
                  >
                    {attendanceLoading
                      ? "Please Wait..."
                      : "Check Out"}
                  </button>
                )}

              {attendance?.check_out && (
                <span className="bg-green-100 text-green-700 px-5 py-3 rounded-xl font-bold inline-block">
                  આજની હાજરી પૂર્ણ ✅
                </span>
              )}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-4 mt-6">
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400">
                Status
              </p>

              <p className="font-bold mt-1">
                {!attendance
                  ? "Not Checked In"
                  : getAttendanceLabel(
                      attendance.attendance_type
                    )}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400">
                Check In
              </p>

              <p className="font-bold mt-1">
                {formatTime(
                  attendance?.check_in || null
                )}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400">
                Late
              </p>

              <p className="font-bold mt-1">
                {attendance
                  ? `${attendance.late_minutes} મિનિટ`
                  : "-"}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400">
                Check Out
              </p>

              <p className="font-bold mt-1">
                {formatTime(
                  attendance?.check_out || null
                )}
              </p>
            </div>

            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-xs text-slate-400">
                Actual Working
              </p>

              <p className="font-bold mt-1">
                {formatWorkingMinutes(
                  attendance?.working_minutes || 0
                )}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4">
  <p className="text-xs text-slate-400">
    Approval
  </p>

  <div className="mt-1">
    {!attendance ? (
      <span className="font-bold text-slate-400">
        -
      </span>
    ) : !attendance.approval_required ? (
      <span className="font-bold text-green-700">
        Auto Approved ✓
      </span>
    ) : attendance.approval_status === "pending" ? (
      <span className="font-bold text-amber-600">
        Pending ⏳
      </span>
    ) : attendance.approval_status === "approved" ? (
      <span className="font-bold text-green-700">
        Approved ✓
      </span>
    ) : (
      <span className="font-bold text-red-600">
        Rejected ✕
      </span>
    )}
  </div>
</div>
{attendance?.admin_note && (
  <div className="lg:col-span-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
    <p className="text-xs font-bold text-blue-600">
      Admin Note
    </p>

    <p className="font-semibold text-slate-800 mt-1">
      {attendance.admin_note}
    </p>
  </div>
)}
          </div>
        </section>
<section className="mt-5">
  <button
    type="button"
    onClick={() => router.push("/dashboard/leave")}
    className="w-full bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-purple-300 hover:shadow-md transition"
  >
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-purple-600">
          LEAVE MANAGEMENT
        </p>

        <h3 className="text-xl font-black text-slate-900 mt-1">
          Leave Request
        </h3>

        <p className="text-sm text-slate-500 mt-2">
          નવી રજા માટે Request મોકલો અને તમારી જૂની Leave Requestsનું Status જુઓ.
        </p>

        <p className="text-purple-600 font-bold mt-4">
          Leave Request ખોલો →
        </p>
      </div>

      <div className="w-14 h-14 shrink-0 rounded-2xl bg-purple-50 flex items-center justify-center text-2xl">
        🗓️
      </div>
    </div>
  </button>
</section>
<section className="mt-5">
  <button
    type="button"
    onClick={() => router.push("/dashboard/tasks")}
    className="w-full bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-violet-300 hover:shadow-md transition"
  >
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-violet-600">
          TASK MANAGEMENT
        </p>

        <h3 className="text-xl font-black text-slate-900 mt-1">
          My Tasks
        </h3>

        <p className="text-slate-500 mt-2 text-sm">
          Assigned Tasks જુઓ અને Progress Update કરો.
        </p>

        <p className="text-violet-600 font-bold mt-4">
          My Tasks જુઓ →
        </p>
      </div>

      <div className="w-14 h-14 shrink-0 rounded-2xl bg-violet-50 flex items-center justify-center text-2xl">
        📋
      </div>
    </div>
  </button>
</section>

<section className="mt-5">
  <button
    type="button"
    onClick={() => router.push("/dashboard/orders")}
    className="w-full bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-cyan-300 hover:shadow-md transition"
  >
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold text-cyan-600">
          PRODUCTION WORKFLOW
        </p>

        <h3 className="text-xl font-black text-slate-900 mt-1">
          Department Orders
        </h3>

        <p className="text-slate-500 mt-2 text-sm">
          તમારા Departmentના Orders જુઓ અને Next Stageમાં મોકલો.
        </p>

        <p className="text-cyan-600 font-bold mt-4">
          Department Orders જુઓ →
        </p>
      </div>

      <div className="w-14 h-14 shrink-0 rounded-2xl bg-cyan-50 flex items-center justify-center text-2xl">
        📦
      </div>
    </div>
  </button>
</section>

        <section className="bg-white border rounded-2xl p-6 mt-5">
          <h3 className="font-black text-lg">
            Attendance Rules
          </h3>

          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="bg-green-50 rounded-xl p-4">
              <p className="font-bold text-green-700">
                On Time
              </p>

              <p className="text-sm text-slate-600 mt-1">
                9:15 AM સુધી
              </p>
            </div>

            <div className="bg-orange-50 rounded-xl p-4">
              <p className="font-bold text-orange-700">
                Late
              </p>

              <p className="text-sm text-slate-600 mt-1">
                9:15 AM પછી અને 1:00 PM પહેલાં
              </p>
            </div>

            <div className="bg-red-50 rounded-xl p-4">
              <p className="font-bold text-red-700">
                Half Day
              </p>

              <p className="text-sm text-slate-600 mt-1">
                1:00 PM કે ત્યાર પછી Check In
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}