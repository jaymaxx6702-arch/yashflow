"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
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
  admin_note: string | null;
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
};

function getIndiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
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

function displayTime(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function PermissionAttendanceEditorPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [settings, setSettings] = useState<OfficeSettings | null>(null);
  const [editorEmployeeId, setEditorEmployeeId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getIndiaDate());
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [editingRow, setEditingRow] = useState<AttendanceRow | null>(null);
  const [checkIn, setCheckIn] = useState("09:00");
  const [checkOut, setCheckOut] = useState("");
  const [adminNote, setAdminNote] = useState("");

  async function ensureAccess() {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/");
      return false;
    }

    const { data: profile, error: profileError } = await supabase
      .from("employees")
      .select("id, role, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.approval_status !== "approved" ||
      !profile.is_active
    ) {
      router.replace("/dashboard");
      return false;
    }

    setEditorEmployeeId(profile.id);

    if (profile.role === "admin") return true;

    const { data, error } = await supabase.rpc("has_app_permission", {
      p_permission_key: "attendance.manage",
    });

    if (error || !data) {
      setMessage(
        error
          ? `Permission Check Error: ${error.message}`
          : "Attendance Edit permission નથી."
      );
      router.replace("/dashboard/manage");
      return false;
    }

    return true;
  }

  async function loadAttendance(date: string) {
    const supabase = createClient();

    const [employeeResult, attendanceResult, settingsResult] =
      await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, mobile, department")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .eq("is_hidden", false)
          .order("full_name", { ascending: true }),

        supabase
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
            admin_note
          `)
          .eq("attendance_date", date),

        supabase
          .from("office_settings")
          .select(`
            office_start_time,
            grace_minutes,
            recess_start_time,
            recess_end_time,
            half_day_checkin_time
          `)
          .eq("is_active", true)
          .single(),
      ]);

    const firstError =
      employeeResult.error ||
      attendanceResult.error ||
      settingsResult.error;

    if (firstError) {
      setMessage(`Attendance Load Error: ${firstError.message}`);
      return;
    }

    const attendanceRows = (attendanceResult.data || []) as Attendance[];

    const finalRows: AttendanceRow[] = (
      (employeeResult.data || []) as Employee[]
    ).map((employee) => ({
      employee,
      attendance:
        attendanceRows.find(
          (item) => item.employee_id === employee.id
        ) || null,
    }));

    setRows(finalRows);
    setSettings(settingsResult.data as OfficeSettings);
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      const allowed = await ensureAccess();

      if (!allowed) {
        setLoading(false);
        return;
      }

      await loadAttendance(selectedDate);
      setLoading(false);
    }

    void init();
  }, []);

  useEffect(() => {
    if (!editorEmployeeId) return;

    async function refreshDate() {
      setLoading(true);
      setMessage("");
      await loadAttendance(selectedDate);
      setLoading(false);
    }

    void refreshDate();
  }, [selectedDate]);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter(
      (row) =>
        row.employee.full_name.toLowerCase().includes(query) ||
        (row.employee.mobile || "").toLowerCase().includes(query) ||
        (row.employee.department || "").toLowerCase().includes(query)
    );
  }, [rows, searchText]);

  function openEdit(row: AttendanceRow) {
    setEditingRow(row);
    setCheckIn(
      row.attendance?.check_in
        ? localTimeValue(row.attendance.check_in)
        : "09:00"
    );
    setCheckOut(
      row.attendance?.check_out
        ? localTimeValue(row.attendance.check_out)
        : ""
    );
    setAdminNote(row.attendance?.admin_note || "");
    setMessage("");
  }

  async function saveAttendance() {
    if (!editingRow || !editorEmployeeId || !settings) return;

    if (!checkIn) {
      setMessage("Check In Time જરૂરી છે.");
      return;
    }

    const checkInMinutes = timeStringToMinutes(checkIn);
    const officeStartMinutes = timeStringToMinutes(settings.office_start_time);
    const graceEndMinutes = officeStartMinutes + settings.grace_minutes;
    const halfDayMinutes = timeStringToMinutes(settings.half_day_checkin_time);

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

    if (checkOut) {
      const checkOutMinutes = timeStringToMinutes(checkOut);

      if (checkOutMinutes < checkInMinutes) {
        setMessage("Check Out Time, Check In કરતાં પહેલાં ન હોઈ શકે.");
        return;
      }

      const recessStartMinutes = timeStringToMinutes(
        settings.recess_start_time
      );
      const recessEndMinutes = timeStringToMinutes(settings.recess_end_time);
      const overlapStart = Math.max(checkInMinutes, recessStartMinutes);
      const overlapEnd = Math.min(checkOutMinutes, recessEndMinutes);
      const recessOverlap = Math.max(0, overlapEnd - overlapStart);

      workingMinutes = Math.max(
        0,
        checkOutMinutes - checkInMinutes - recessOverlap
      );

      checkOutIso = isoFromIndiaLocal(selectedDate, checkOut);
    }

    const payload = {
      employee_id: editingRow.employee.id,
      attendance_date: selectedDate,
      check_in: isoFromIndiaLocal(selectedDate, checkIn),
      check_out: checkOutIso,
      status: attendanceType === "half_day" ? "half_day" : "present",
      attendance_type: attendanceType,
      late_minutes: lateMinutes,
      working_minutes: workingMinutes,
      approval_required: false,
      approval_status: "approved",
      approved_by: editorEmployeeId,
      approved_at: new Date().toISOString(),
      admin_note: adminNote.trim() || "Attendance edited with permission",
    };

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const result = editingRow.attendance?.id
      ? await supabase
          .from("attendance")
          .update(payload)
          .eq("id", editingRow.attendance.id)
      : await supabase.from("attendance").insert(payload);

    if (result.error) {
      setMessage(`Attendance Edit Error: ${result.error.message}`);
      setSaving(false);
      return;
    }

    setMessage(`${editingRow.employee.full_name} Attendance Updated ✅`);
    setEditingRow(null);
    await loadAttendance(selectedDate);
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Attendance લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-blue-100">
              ATTENDANCE MANAGEMENT
            </p>
            <h1 className="text-2xl font-black text-white mt-1">
              Attendance Edit Access
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard/manage")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← Management
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-4">{message}</div>
        )}

        <section className="yf-card p-4 mb-4 grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black text-slate-500">DATE</label>
            <input
              type="date"
              className="yf-input mt-2"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-black text-slate-500">SEARCH</label>
            <input
              type="text"
              className="yf-input mt-2"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Employee / Mobile / Department..."
            />
          </div>
        </section>

        <section className="space-y-3">
          {filteredRows.map((row) => (
            <article key={row.employee.id} className="yf-card p-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="font-black text-slate-900">
                    {row.employee.full_name}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {row.employee.department || "-"} • {row.employee.mobile || "-"}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-3 text-sm font-bold text-slate-700">
                    <span className="rounded-lg bg-slate-100 px-3 py-2">
                      In: {displayTime(row.attendance?.check_in || null)}
                    </span>
                    <span className="rounded-lg bg-slate-100 px-3 py-2">
                      Out: {displayTime(row.attendance?.check_out || null)}
                    </span>
                    <span className="rounded-lg bg-blue-50 text-blue-700 px-3 py-2">
                      {row.attendance?.attendance_type || "Not Checked In"}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="yf-btn yf-btn-primary"
                >
                  ✏ Edit Attendance
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>

      {editingRow && (
        <div className="fixed inset-0 z-[90] bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="border-b border-slate-200 p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black text-blue-700">
                  EDIT ATTENDANCE • {selectedDate}
                </p>
                <h2 className="text-xl font-black mt-1">
                  {editingRow.employee.full_name}
                </h2>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEditingRow(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 font-black disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-black text-slate-700">
                  Check In
                </label>
                <input
                  type="time"
                  className="yf-input mt-2"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Check Out
                </label>
                <input
                  type="time"
                  className="yf-input mt-2"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-sm font-black text-slate-700">
                  Admin Note
                </label>
                <textarea
                  rows={3}
                  className="yf-input mt-2"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />
              </div>

              <div className="sm:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditingRow(null)}
                  className="yf-btn yf-btn-secondary disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveAttendance()}
                  className="yf-btn yf-btn-primary disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Attendance"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
