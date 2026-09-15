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
  is_active: boolean;
  joining_date: string | null;
};

type Attendance = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string | null;
  attendance_type: string | null;
  late_minutes: number | null;
  working_minutes: number | null;
  approval_required: boolean;
  approval_status: string;
  approved_at: string | null;
  admin_note: string | null;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
};

type OfficeSettings = {
  office_start_time: string;
  grace_minutes: number;
  recess_start_time: string;
  recess_end_time: string;
  half_day_checkin_time: string;
};

type AttendanceRow = {
  employee: Employee;
  attendance: Attendance | null;
  leave: LeaveRequest | null;
};

export default function AdminAttendancePage() {
  const router = useRouter();

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [officeSettings, setOfficeSettings] =
    useState<OfficeSettings | null>(null);

  const [manualEmployee, setManualEmployee] =
    useState<Employee | null>(null);
  const [manualAttendanceId, setManualAttendanceId] =
    useState<string | null>(null);
  const [manualCheckIn, setManualCheckIn] = useState("09:00");
  const [manualCheckOut, setManualCheckOut] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const [selectedDate, setSelectedDate] = useState(
    getIndiaDate()
  );

  function getIndiaDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find(
      (part) => part.type === "year"
    )?.value;

    const month = parts.find(
      (part) => part.type === "month"
    )?.value;

    const day = parts.find(
      (part) => part.type === "day"
    )?.value;

    return `${year}-${month}-${day}`;
  }

  function formatTime(value: string | null) {
    if (!value) return "-";

    return new Date(value).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatWorkingMinutes(minutes: number | null) {
    if (!minutes || minutes <= 0) return "-";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return `${mins} min`;
    }

    return `${hours}h ${mins}m`;
  }

  function timeStringToMinutes(value: string) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }

  function isoFromIndiaLocal(date: string, time: string) {
    return new Date(`${date}T${time}:00+05:30`).toISOString();
  }

  function localTimeValue(value: string | null) {
    if (!value) return "";

    return new Date(value).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function getLeaveLabel(type: string) {
    if (type === "first_half") {
      return "First Half Leave";
    }

    if (type === "second_half") {
      return "Second Half Leave";
    }

    return "Leave";
  }

  async function loadAttendance(date: string) {
    setLoading(true);
    setMessage("");

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

    const { data: settingsData, error: settingsError } =
      await supabase
        .from("office_settings")
        .select(`
          office_start_time,
          grace_minutes,
          recess_start_time,
          recess_end_time,
          half_day_checkin_time
        `)
        .eq("is_active", true)
        .single();

    if (settingsError || !settingsData) {
      setMessage("Office timing settings મળી નથી.");
      setLoading(false);
      return;
    }

    setOfficeSettings(settingsData);

    const { data: employees, error: employeesError } =
      await supabase
        .from("employees")
        .select(`
          id,
          full_name,
          mobile,
          department,
          role,
          is_active,
          joining_date
        `)
       .eq("approval_status", "approved")
.eq("is_active", true)
.eq("is_hidden", false)
.order("full_name", {
  ascending: true,
});

    if (employeesError) {
      setMessage(
        `Employee Load Error: ${employeesError.message}`
      );

      setLoading(false);
      return;
    }

    const { data: attendanceData, error: attendanceError } =
      await supabase
        .from("attendance")
        .select(`
          id,
          employee_id,
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
        `)
        .eq("attendance_date", date);

    if (attendanceError) {
      setMessage(
        `Attendance Load Error: ${attendanceError.message}`
      );

      setLoading(false);
      return;
    }

    /*
      Selected date જે Approved Leaveની
      start_date અને end_date વચ્ચે આવે છે
      એ Leave અહીં load થશે.
    */

    const { data: leaveData, error: leaveError } =
      await supabase
        .from("leave_requests")
        .select(`
          id,
          employee_id,
          leave_type,
          start_date,
          end_date,
          status
        `)
        .eq("status", "approved")
        .lte("start_date", date)
        .gte("end_date", date);

    if (leaveError) {
      setMessage(
        `Leave Load Error: ${leaveError.message}`
      );

      setLoading(false);
      return;
    }

    const finalRows: AttendanceRow[] =
      (employees || []).map((employee) => {
        const attendance =
          (attendanceData || []).find(
            (item) =>
              item.employee_id === employee.id
          ) || null;

        const leave =
          (leaveData || []).find(
            (item) =>
              item.employee_id === employee.id
          ) || null;

        return {
          employee,
          attendance,
          leave,
        };
      });

    setRows(finalRows);
    setLoading(false);
  }

  useEffect(() => {
    loadAttendance(selectedDate);
  }, [selectedDate]);

  function getStatus(row: AttendanceRow) {
    /*
      Actual attendance recordને સૌથી વધુ priority.

      Employee Leave પર હોવા છતાં Check In કરે,
      તો actual attendance બતાવીએ.
    */
if (
  row.employee.joining_date &&
  selectedDate < row.employee.joining_date
) {
  return {
    type: "not_joined",
    label: "Not Joined",
    className: "bg-slate-100 text-slate-500",
  };
}
    if (row.attendance) {
      if (
  row.attendance.approval_required &&
  row.attendance.approval_status === "rejected"
) {
  return {
    type: "rejected",
    label: "Rejected",
    className: "bg-red-100 text-red-700",
  };
}
      if (
        row.attendance.attendance_type === "half_day"
      ) {
        return {
          type: "half_day",
          label: "Half Day",
          className: "bg-red-100 text-red-700",
        };
      }

      if (
        row.attendance.attendance_type === "late"
      ) {
        return {
          type: "late",
          label: "Late",
          className:
            "bg-orange-100 text-orange-700",
        };
      }

      if (
        row.attendance.attendance_type === "leave"
      ) {
        return {
          type: "leave",
          label: "Leave",
          className:
            "bg-purple-100 text-purple-700",
        };
      }

      if (
        row.attendance.attendance_type === "absent"
      ) {
        return {
          type: "absent",
          label: "Absent",
          className: "bg-rose-100 text-rose-700",
        };
      }

      return {
        type: "present",
        label: "Present",
        className: "bg-green-100 text-green-700",
      };
    }

    /*
      Attendance નથી પરંતુ Approved Leave છે.
    */

    if (row.leave) {
      if (row.leave.leave_type === "full_day") {
        return {
          type: "leave",
          label: "Leave",
          className:
            "bg-purple-100 text-purple-700",
        };
      }

      return {
        type: "half_day_leave",
        label: getLeaveLabel(row.leave.leave_type),
        className: "bg-violet-100 text-violet-700",
      };
    }

    const today = getIndiaDate();

    /*
      Past Date:
      Attendance નથી + Approved Leave નથી
      એટલે Absent.
    */

    if (selectedDate < today) {
      return {
        type: "absent",
        label: "Absent",
        className: "bg-rose-100 text-rose-700",
      };
    }

    /*
      Future Date
    */

    if (selectedDate > today) {
      return {
        type: "future",
        label: "Not Due",
        className: "bg-blue-50 text-blue-600",
      };
    }

    /*
      Today:
      હજુ Check In નથી.
    */

    return {
      type: "not_checked_in",
      label: "Not Checked In",
      className: "bg-slate-100 text-slate-700",
    };
  }

  const totalEmployees = rows.filter(
  (row) => getStatus(row).type !== "not_joined"
).length;

 const presentCount = rows.filter((row) => {
  const type = getStatus(row).type;

  return (
    type === "present" ||
    type === "late" ||
    type === "half_day"
  );
}).length;

  const lateCount = rows.filter(
    (row) => getStatus(row).type === "late"
  ).length;

  const halfDayCount = rows.filter((row) => {
    const type = getStatus(row).type;

    return (
      type === "half_day" ||
      type === "half_day_leave"
    );
  }).length;

  const leaveCount = rows.filter(
    (row) => getStatus(row).type === "leave"
  ).length;

const rejectedCount = rows.filter(
  (row) => getStatus(row).type === "rejected"
).length;

  const absentCount = rows.filter(
    (row) => getStatus(row).type === "absent"
  ).length;

  const notCheckedInCount = rows.filter(
    (row) =>
      getStatus(row).type === "not_checked_in"
  ).length;

  const completedCount = rows.filter(
    (row) => Boolean(row.attendance?.check_out)
  ).length;

  function openManualPunch(row: AttendanceRow) {
    setManualEmployee(row.employee);
    setManualAttendanceId(row.attendance?.id || null);
    setManualCheckIn(
      row.attendance?.check_in
        ? localTimeValue(row.attendance.check_in)
        : "09:00"
    );
    setManualCheckOut(
      row.attendance?.check_out
        ? localTimeValue(row.attendance.check_out)
        : ""
    );
    setManualNote(row.attendance?.admin_note || "");
    setMessage("");
  }

  function closeManualPunch() {
    if (manualSaving) return;

    setManualEmployee(null);
    setManualAttendanceId(null);
    setManualCheckIn("09:00");
    setManualCheckOut("");
    setManualNote("");
  }

  async function saveManualPunch() {
    if (!manualEmployee || !adminId || !officeSettings) return;

    if (!manualCheckIn) {
      setMessage("Manual Punch માટે Check In Time જરૂરી છે.");
      return;
    }

    const checkInMinutes = timeStringToMinutes(manualCheckIn);

    const officeStartMinutes =
      timeStringToMinutes(officeSettings.office_start_time);

    const graceEndMinutes =
      officeStartMinutes + officeSettings.grace_minutes;

    const halfDayMinutes =
      timeStringToMinutes(officeSettings.half_day_checkin_time);

    let attendanceType = "present";

    if (checkInMinutes >= halfDayMinutes) {
      attendanceType = "half_day";
    } else if (checkInMinutes > graceEndMinutes) {
      attendanceType = "late";
    }

    const lateMinutes =
      checkInMinutes > graceEndMinutes
        ? checkInMinutes - graceEndMinutes
        : 0;

    let workingMinutes = 0;
    let checkOutIso: string | null = null;

    if (manualCheckOut) {
      const checkOutMinutes = timeStringToMinutes(manualCheckOut);

      if (checkOutMinutes < checkInMinutes) {
        setMessage("Check Out Time, Check In કરતાં પહેલાં ન હોઈ શકે.");
        return;
      }

      const recessStartMinutes =
        timeStringToMinutes(officeSettings.recess_start_time);

      const recessEndMinutes =
        timeStringToMinutes(officeSettings.recess_end_time);

      const overlapStart = Math.max(
        checkInMinutes,
        recessStartMinutes
      );

      const overlapEnd = Math.min(
        checkOutMinutes,
        recessEndMinutes
      );

      const recessOverlap = Math.max(
        0,
        overlapEnd - overlapStart
      );

      workingMinutes = Math.max(
        0,
        checkOutMinutes - checkInMinutes - recessOverlap
      );

      checkOutIso = isoFromIndiaLocal(
        selectedDate,
        manualCheckOut
      );
    }

    const payload = {
      employee_id: manualEmployee.id,
      attendance_date: selectedDate,
      check_in: isoFromIndiaLocal(
        selectedDate,
        manualCheckIn
      ),
      check_out: checkOutIso,
      status:
        attendanceType === "half_day"
          ? "half_day"
          : "present",
      attendance_type: attendanceType,
      late_minutes: lateMinutes,
      working_minutes: workingMinutes,
      approval_required: false,
      approval_status: "approved",
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      admin_note:
        manualNote.trim() || "Manual Punch by Admin",
    };

    setManualSaving(true);
    setMessage("");

    const supabase = createClient();

    let error = null;

    if (manualAttendanceId) {
      const result = await supabase
        .from("attendance")
        .update(payload)
        .eq("id", manualAttendanceId);

      error = result.error;
    } else {
      const result = await supabase
        .from("attendance")
        .insert(payload);

      error = result.error;
    }

    if (error) {
      setMessage(`Manual Punch Error: ${error.message}`);
      setManualSaving(false);
      return;
    }

    await loadAttendance(selectedDate);

    setMessage(
      `${manualEmployee.full_name} માટે Manual Punch Saved ✅`
    );

    setManualSaving(false);
    closeManualPunch();
  }

  async function updateAttendanceApproval(
    attendanceId: string,
    status: "approved" | "rejected"
  ) {
    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    const confirmed = window.confirm(
      status === "approved"
        ? "આ Attendance Approve કરવી છે?"
        : "આ Attendance Reject કરવી છે?"
    );

    if (!confirmed) return;

    setActionId(attendanceId);
    setMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("attendance")
      .update({
        approval_status: status,
        approved_by: adminId,
        approved_at: now,
      })
      .eq("id", attendanceId)
      .eq("approval_required", true)
      .eq("approval_status", "pending");

    if (error) {
      setMessage(`Attendance Approval Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAttendance(selectedDate);

    setMessage(
      status === "approved"
        ? "Attendance Approved ✅"
        : "Attendance Rejected."
    );

    setActionId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Attendance લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Attendance Management
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        <section className="yf-card p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900">
                Staff Attendance
              </h2>

              <p className="text-slate-500 mt-1">
                Attendance + Approved Leave + Absent
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                તારીખ પસંદ કરો
              </label>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) =>
                  setSelectedDate(e.target.value)
                }
                className="yf-input font-semibold"
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 font-semibold">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4 mt-5">
          <SummaryCard
            label="Total Staff"
            value={totalEmployees}
          />

          <SummaryCard
            label="Present"
            value={presentCount}
            valueClass="text-green-600"
          />

          <SummaryCard
            label="Late"
            value={lateCount}
            valueClass="text-orange-600"
          />

          <SummaryCard
            label="Half Day"
            value={halfDayCount}
            valueClass="text-red-600"
          />

          <SummaryCard
            label="Leave"
            value={leaveCount}
            valueClass="text-purple-600"
          />
           <SummaryCard
            label="Rejected"
            value={rejectedCount}
            valueClass="text-red-600"
          />
          <SummaryCard
            label="Absent"
            value={absentCount}
            valueClass="text-rose-600"
          />

          <SummaryCard
            label="Not Checked In"
            value={notCheckedInCount}
            valueClass="text-slate-600"
          />

          <SummaryCard
            label="Check Out Done"
            value={completedCount}
            valueClass="text-blue-600"
          />
        </section>

        <section className="yf-card mt-5 overflow-hidden">
          <div className="yf-table-wrap">
            <table className="yf-table min-w-[950px] text-slate-800">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Employee
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Department
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Status
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Check In
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Late
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Check Out
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Working Hours
                  </th>
                  <th className="text-left px-5 py-4 text-sm">
                    Approval
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Manual
                  </th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const status = getStatus(row);

                  return (
                    <tr
                      key={row.employee.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">
                          {row.employee.full_name}
                        </p>

                        <p className="text-xs text-slate-600 font-medium mt-1">
                          +91 {row.employee.mobile}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {row.employee.department || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`yf-badge ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {formatTime(
                          row.attendance?.check_in || null
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {row.attendance
                          ? `${
                              row.attendance
                                .late_minutes || 0
                            } min`
                          : "-"}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {formatTime(
                          row.attendance?.check_out || null
                        )}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {formatWorkingMinutes(
                          row.attendance
                            ?.working_minutes || 0
                        )}
                        
                      </td>
                      <td className="px-5 py-4">
  {!row.attendance ? (
    <span className="text-slate-400">
      -
    </span>
  ) : !row.attendance.approval_required ? (
    <span className="yf-badge yf-badge-green whitespace-nowrap">
      Auto Approved ✓
    </span>
  ) : row.attendance.approval_status === "pending" ? (
    <div className="flex flex-col gap-2 min-w-[120px]">
      <span className="yf-badge yf-badge-orange whitespace-nowrap text-center">
        Pending ⏳
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={actionId === row.attendance.id}
          onClick={() =>
            updateAttendanceApproval(
              row.attendance!.id,
              "approved"
            )
          }
          className="yf-btn yf-btn-success yf-btn-sm disabled:opacity-50"
        >
          Approve
        </button>

        <button
          type="button"
          disabled={actionId === row.attendance.id}
          onClick={() =>
            updateAttendanceApproval(
              row.attendance!.id,
              "rejected"
            )
          }
          className="yf-btn yf-btn-danger yf-btn-sm disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  ) : row.attendance.approval_status === "approved" ? (
    <span className="yf-badge yf-badge-green whitespace-nowrap">
      Approved ✓
    </span>
  ) : (
    <span className="yf-badge yf-badge-red whitespace-nowrap">
      Rejected ✕
    </span>
  )}
</td>

                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => openManualPunch(row)}
                          className="yf-btn yf-btn-primary yf-btn-sm whitespace-nowrap"
                        >
                          {row.attendance
                            ? "Edit Punch"
                            : "Manual Punch"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      કોઈ employee મળ્યો નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {manualEmployee && (
        <div className="yf-overlay flex items-center justify-center p-4">
          <div className="yf-modal max-w-lg">
            <div className="yf-drawer-header">
              <div>
                <p className="text-sm font-bold text-blue-700">
                  MANUAL ATTENDANCE
                </p>

                <h3 className="text-xl font-black text-slate-900 mt-1">
                  {manualEmployee.full_name}
                </h3>

                <p className="text-sm text-slate-500 mt-1">
                  {selectedDate}
                </p>
              </div>

              <button
                type="button"
                onClick={closeManualPunch}
                disabled={manualSaving}
                className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 font-black text-slate-700 disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="yf-drawer-body space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Check In
                  </label>

                  <input
                    type="time"
                    value={manualCheckIn}
                    onChange={(e) =>
                      setManualCheckIn(e.target.value)
                    }
                    className="yf-input font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Check Out (Optional)
                  </label>

                  <input
                    type="time"
                    value={manualCheckOut}
                    onChange={(e) =>
                      setManualCheckOut(e.target.value)
                    }
                    className="yf-input font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Admin Note
                </label>

                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) =>
                    setManualNote(e.target.value)
                  }
                  placeholder="Reason / note (optional)"
                  className="yf-input"
                />
              </div>

              <div className="yf-alert yf-alert-info text-sm">
                Status Check In time પરથી automatic ગણાશે:
                Present / Late / Half Day. Manual Punch Admin Approved રહેશે.
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeManualPunch}
                disabled={manualSaving}
                className="yf-btn yf-btn-secondary disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveManualPunch}
                disabled={manualSaving}
                className="yf-btn yf-btn-primary disabled:opacity-50"
              >
                {manualSaving ? "Saving..." : "Save Manual Punch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: number;
  valueClass?: string;
}) {
  return (
    <div className="yf-metric-card text-slate-900">
      <p className="text-sm font-semibold text-slate-700">
        {label}
      </p>

      <p
        className={`text-3xl font-black mt-2 ${valueClass}`}
      >
        {value}
      </p>
    </div>
  );
}