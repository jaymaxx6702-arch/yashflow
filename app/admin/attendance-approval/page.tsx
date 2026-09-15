"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type EmployeeMini = {
  id: string;
  full_name: string;
  mobile: string | null;
  department: string | null;
};

type PendingAttendance = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  attendance_type: string | null;
  late_minutes: number | null;
  working_minutes: number | null;
  approval_status: string;
  admin_note: string | null;

  employees: EmployeeMini | null;
};

type ManualPunchStatus = "pending" | "approved" | "rejected";

type ManualPunchRequest = {
  id: string;
  employee_id: string;
  attendance_date: string;
  punch_in_time: string | null;
  punch_out_time: string | null;
  reason: string;
  status: ManualPunchStatus;
  requested_at: string;
  reviewed_at: string | null;
  admin_note: string | null;

  employees: EmployeeMini | null;
};

type ExistingAttendance = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  attendance_type: string | null;
  late_minutes: number | null;
  working_minutes: number | null;
};

type CorrectionRequest = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: "absent_correction" | "late_regularization";
  reason: string;
  requested_check_in: string | null;
  requested_check_out: string | null;
  original_attendance_id: string | null;
  original_attendance_type: string | null;
  original_late_minutes: number | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  admin_note: string | null;
};

export default function AttendanceApprovalPage() {
  const router = useRouter();

  const [adminId, setAdminId] = useState<string | null>(null);

  const [records, setRecords] = useState<PendingAttendance[]>([]);
  const [manualRequests, setManualRequests] = useState<ManualPunchRequest[]>([]);
  const [correctionRequests, setCorrectionRequests] = useState<
    CorrectionRequest[]
  >([]);

  const [existingAttendanceMap, setExistingAttendanceMap] =
    useState<Record<string, ExistingAttendance>>({});
  const [employeeMap, setEmployeeMap] = useState<Record<string, EmployeeMini>>(
    {}
  );

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [manualNotes, setManualNotes] = useState<Record<string, string>>({});
  const [correctionNotes, setCorrectionNotes] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function formatTime(value: string | null) {
    if (!value) return "-";

    return new Date(value).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatManualTime(value: string | null) {
    if (!value) return "-";

    const [hourString, minuteString] = value.split(":");
    const hour = Number(hourString);
    const minute = Number(minuteString);

    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatRequestedAt(value: string) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(value));
  }

  function formatWorkingMinutes(minutes: number | null) {
    if (!minutes || minutes <= 0) {
      return "-";
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return `${mins} min`;
    }

    return `${hours}h ${mins}m`;
  }

  function attendanceLabel(type: string | null) {
    if (type === "half_day") return "Half Day";
    if (type === "late") return "Late";
    return "Present";
  }

  function correctionLabel(
    type: CorrectionRequest["request_type"]
  ) {
    return type === "absent_correction"
      ? "Absent Correction"
      : "Late Regularization";
  }

  function attendanceMapKey(employeeId: string, attendanceDate: string) {
    return `${employeeId}|${attendanceDate}`;
  }

  async function loadAttendanceRecords() {
    const supabase = createClient();

    const { data, error } = await supabase
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
        approval_status,
        admin_note,
        employees!attendance_employee_id_fkey (
          id,
          full_name,
          mobile,
          department
        )
      `)
      .eq("approval_required", true)
      .eq("approval_status", "pending")
      .order("attendance_date", {
        ascending: false,
      });

    if (error) {
      throw new Error(`Attendance Load Error: ${error.message}`);
    }

    setRecords((data || []) as unknown as PendingAttendance[]);
  }

  async function loadManualRequests() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("manual_attendance_requests")
      .select(`
        id,
        employee_id,
        attendance_date,
        punch_in_time,
        punch_out_time,
        reason,
        status,
        requested_at,
        reviewed_at,
        admin_note,
        employees!manual_attendance_requests_employee_id_fkey (
          id,
          full_name,
          mobile,
          department
        )
      `)
      .eq("status", "pending")
      .order("attendance_date", { ascending: false })
      .order("requested_at", { ascending: false });

    if (error) {
      throw new Error(`Manual Punch Load Error: ${error.message}`);
    }

    const rows = (data || []) as unknown as ManualPunchRequest[];
    setManualRequests(rows);
  }

  async function loadCorrectionRequests() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("attendance_correction_requests")
      .select(`
        id,
        employee_id,
        attendance_date,
        request_type,
        reason,
        requested_check_in,
        requested_check_out,
        original_attendance_id,
        original_attendance_type,
        original_late_minutes,
        status,
        created_at,
        admin_note
      `)
      .eq("status", "pending")
      .order("attendance_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(
        `Attendance Correction Load Error: ${error.message}`
      );
    }

    setCorrectionRequests((data || []) as CorrectionRequest[]);
  }

  async function loadRelatedData() {
    const supabase = createClient();

    const employeeIds = Array.from(
      new Set([
        ...manualRequests.map((item) => item.employee_id),
        ...correctionRequests.map((item) => item.employee_id),
      ])
    );

    const dateValues = [
      ...manualRequests.map((item) => item.attendance_date),
      ...correctionRequests.map((item) => item.attendance_date),
    ].sort();

    if (employeeIds.length === 0) {
      setEmployeeMap({});
      setExistingAttendanceMap({});
      return;
    }

    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("id, full_name, mobile, department")
      .in("id", employeeIds);

    if (employeesError) {
      throw new Error(`Employee Load Error: ${employeesError.message}`);
    }

    const nextEmployeeMap: Record<string, EmployeeMini> = {};

    for (const item of (employeesData || []) as EmployeeMini[]) {
      nextEmployeeMap[item.id] = item;
    }

    setEmployeeMap(nextEmployeeMap);

    if (dateValues.length === 0) {
      setExistingAttendanceMap({});
      return;
    }

    const minDate = dateValues[0];
    const maxDate = dateValues[dateValues.length - 1];

    const { data: attendanceRows, error: attendanceError } = await supabase
      .from("attendance")
      .select(`
        id,
        employee_id,
        attendance_date,
        check_in,
        check_out,
        attendance_type,
        late_minutes,
        working_minutes
      `)
      .in("employee_id", employeeIds)
      .gte("attendance_date", minDate)
      .lte("attendance_date", maxDate);

    if (attendanceError) {
      throw new Error(
        `Existing Attendance Load Error: ${attendanceError.message}`
      );
    }

    const map: Record<string, ExistingAttendance> = {};

    for (const item of (attendanceRows || []) as ExistingAttendance[]) {
      map[attendanceMapKey(item.employee_id, item.attendance_date)] = item;
    }

    setExistingAttendanceMap(map);
  }

  async function loadAll() {
    setMessage("");

    try {
      const supabase = createClient();

      const [
        attendanceResult,
        manualResult,
        correctionResult,
      ] = await Promise.all([
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
            approval_status,
            admin_note,
            employees!attendance_employee_id_fkey (
              id,
              full_name,
              mobile,
              department
            )
          `)
          .eq("approval_required", true)
          .eq("approval_status", "pending")
          .order("attendance_date", { ascending: false }),

        supabase
          .from("manual_attendance_requests")
          .select(`
            id,
            employee_id,
            attendance_date,
            punch_in_time,
            punch_out_time,
            reason,
            status,
            requested_at,
            reviewed_at,
            admin_note,
            employees!manual_attendance_requests_employee_id_fkey (
              id,
              full_name,
              mobile,
              department
            )
          `)
          .eq("status", "pending")
          .order("attendance_date", { ascending: false })
          .order("requested_at", { ascending: false }),

        supabase
          .from("attendance_correction_requests")
          .select(`
            id,
            employee_id,
            attendance_date,
            request_type,
            reason,
            requested_check_in,
            requested_check_out,
            original_attendance_id,
            original_attendance_type,
            original_late_minutes,
            status,
            created_at,
            admin_note
          `)
          .eq("status", "pending")
          .order("attendance_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      const firstError =
        attendanceResult.error ||
        manualResult.error ||
        correctionResult.error;

      if (firstError) {
        throw new Error(firstError.message);
      }

      const nextRecords =
        (attendanceResult.data || []) as unknown as PendingAttendance[];

      const nextManual =
        (manualResult.data || []) as unknown as ManualPunchRequest[];

      const nextCorrections =
        (correctionResult.data || []) as CorrectionRequest[];

      setRecords(nextRecords);
      setManualRequests(nextManual);
      setCorrectionRequests(nextCorrections);

      const employeeIds = Array.from(
        new Set([
          ...nextManual.map((item) => item.employee_id),
          ...nextCorrections.map((item) => item.employee_id),
        ])
      );

      if (employeeIds.length === 0) {
        setEmployeeMap({});
        setExistingAttendanceMap({});
        return;
      }

      const { data: employeesData, error: employeesError } = await supabase
        .from("employees")
        .select("id, full_name, mobile, department")
        .in("id", employeeIds);

      if (employeesError) {
        throw new Error(employeesError.message);
      }

      const nextEmployeeMap: Record<string, EmployeeMini> = {};

      for (const item of (employeesData || []) as EmployeeMini[]) {
        nextEmployeeMap[item.id] = item;
      }

      setEmployeeMap(nextEmployeeMap);

      const dateValues = [
        ...nextManual.map((item) => item.attendance_date),
        ...nextCorrections.map((item) => item.attendance_date),
      ].sort();

      if (dateValues.length === 0) {
        setExistingAttendanceMap({});
        return;
      }

      const minDate = dateValues[0];
      const maxDate = dateValues[dateValues.length - 1];

      const { data: attendanceRows, error: attendanceError } = await supabase
        .from("attendance")
        .select(`
          id,
          employee_id,
          attendance_date,
          check_in,
          check_out,
          attendance_type,
          late_minutes,
          working_minutes
        `)
        .in("employee_id", employeeIds)
        .gte("attendance_date", minDate)
        .lte("attendance_date", maxDate);

      if (attendanceError) {
        throw new Error(attendanceError.message);
      }

      const map: Record<string, ExistingAttendance> = {};

      for (const item of (attendanceRows || []) as ExistingAttendance[]) {
        map[attendanceMapKey(item.employee_id, item.attendance_date)] = item;
      }

      setExistingAttendanceMap(map);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Approval Load Error: ${error.message}`
          : "Approval data load કરવામાં problem આવી."
      );
    }
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

      setAdminId(admin.id);

      await loadAll();

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleAction(
    attendanceId: string,
    newStatus: "approved" | "rejected"
  ) {
    if (!adminId) return;

    setActionId(`attendance-${attendanceId}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("attendance")
      .update({
        approval_status: newStatus,
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        admin_note: notes[attendanceId]?.trim() || null,
      })
      .eq("id", attendanceId)
      .eq("approval_status", "pending");

    if (error) {
      setMessage(`Attendance Update Error: ${error.message}`);
      setActionId(null);
      return;
    }

    setMessage(
      newStatus === "approved"
        ? "Attendance Approved ✅"
        : "Attendance Rejected."
    );

    await loadAll();
    setActionId(null);
  }

  async function handleManualAction(
    requestId: string,
    action: "approve" | "reject"
  ) {
    setActionId(`manual-${requestId}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "admin_review_manual_punch_request",
      {
        p_request_id: requestId,
        p_action: action,
        p_admin_note: manualNotes[requestId]?.trim() || null,
      }
    );

    if (error) {
      setMessage(`Manual Punch ${action} Error: ${error.message}`);
      setActionId(null);
      return;
    }

    setMessage(
      action === "approve"
        ? "Manual Punch Approved અને Attendance Update થયું ✅"
        : "Manual Punch Request Rejected."
    );

    await loadAll();
    setActionId(null);
  }

  async function handleCorrectionAction(
    requestId: string,
    decision: "approved" | "rejected"
  ) {
    setActionId(`correction-${requestId}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "admin_review_attendance_correction_request",
      {
        p_request_id: requestId,
        p_decision: decision,
        p_admin_note:
          correctionNotes[requestId]?.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `Attendance Correction ${
          decision === "approved" ? "Approve" : "Reject"
        } Error: ${error.message}`
      );
      setActionId(null);
      return;
    }

    setMessage(
      decision === "approved"
        ? "Attendance Correction Approved અને Attendance Update થયું ✅"
        : "Attendance Correction Request Rejected."
    );

    await loadAll();
    setActionId(null);
  }

  const totalPending =
    records.length +
    manualRequests.length +
    correctionRequests.length;

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Attendance Approval લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container flex justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Attendance Approval
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
        {message && (
          <div className="yf-alert yf-alert-info mb-5">
            {message}
          </div>
        )}

        <section className="yf-summary-grid">
          <div className="yf-metric-card">
            <p className="text-xs font-black text-slate-500">
              TOTAL PENDING
            </p>
            <p className="text-3xl font-black text-orange-600 mt-1">
              {totalPending}
            </p>
          </div>

          <div className="yf-metric-card">
            <p className="text-xs font-black text-blue-700">
              LATE / HALF DAY
            </p>
            <p className="text-3xl font-black text-blue-700 mt-1">
              {records.length}
            </p>
          </div>

          <div className="yf-metric-card">
            <p className="text-xs font-black text-amber-700">
              MANUAL PUNCH
            </p>
            <p className="text-3xl font-black text-amber-600 mt-1">
              {manualRequests.length}
            </p>
          </div>

          <div className="yf-metric-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-fuchsia-700">
                  CORRECTIONS
                </p>
                <p className="text-3xl font-black text-fuchsia-700 mt-1">
                  {correctionRequests.length}
                </p>
              </div>

              <button
                type="button"
                onClick={loadAll}
                className="yf-btn yf-btn-secondary yf-btn-sm"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </section>

        <section className="yf-card mt-5 overflow-hidden border-fuchsia-200">
          <div className="p-5 border-b border-fuchsia-200 bg-fuchsia-50">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.14em] text-fuchsia-700">
                  ATTENDANCE CORRECTION
                </p>

                <h2 className="text-xl font-black mt-1">
                  Absent & Late Requests
                </h2>

                <p className="text-sm text-slate-600 mt-1">
                  Employee Calendarમાંથી આવેલી Absent Correction અને Late
                  Regularization requests verify કરો.
                </p>
              </div>

              <span className="inline-flex w-fit rounded-full border border-fuchsia-300 bg-white px-3 py-1 text-xs font-black text-fuchsia-800">
                Pending: {correctionRequests.length}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {correctionRequests.map((request) => {
              const employee = employeeMap[request.employee_id];

              const existing =
                existingAttendanceMap[
                  attendanceMapKey(
                    request.employee_id,
                    request.attendance_date
                  )
                ];

              const isAbsentCorrection =
                request.request_type === "absent_correction";

              return (
                <div
                  key={request.id}
                  className="yf-card p-4 sm:p-5"
                >
                  <div className="flex flex-col xl:flex-row xl:items-start gap-5">
                    <div className="xl:w-[220px] shrink-0">
                      <p className="text-xs font-black text-slate-500">
                        EMPLOYEE
                      </p>

                      <p className="text-lg font-black text-slate-900 mt-1">
                        {employee?.full_name || "-"}
                      </p>

                      <p className="text-sm font-semibold text-slate-500 mt-1">
                        {employee?.department || "-"}
                      </p>

                      <p className="text-sm font-black text-slate-800 mt-4">
                        {formatDate(request.attendance_date)}
                      </p>

                      <span
                        className={`inline-flex mt-2 rounded-full px-3 py-1 text-xs font-black ${
                          isAbsentCorrection
                            ? "bg-red-100 text-red-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        {correctionLabel(request.request_type)}
                      </span>

                      <p className="text-xs text-slate-400 font-semibold mt-2">
                        Requested: {formatRequestedAt(request.created_at)}
                      </p>
                    </div>

                    <div className="flex-1 grid md:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
                        <p className="text-xs font-black text-fuchsia-700">
                          EMPLOYEE REQUEST
                        </p>

                        {isAbsentCorrection && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Requested In
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatManualTime(
                                  request.requested_check_in
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Requested Out
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatManualTime(
                                  request.requested_check_out
                                )}
                              </p>
                            </div>
                          </div>
                        )}

                        {!isAbsentCorrection && (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Original Type
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {attendanceLabel(
                                  request.original_attendance_type
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Original Late
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {request.original_late_minutes || 0} min
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="mt-4 rounded-xl bg-white border border-fuchsia-100 p-3">
                          <p className="text-xs font-black text-slate-500">
                            REASON
                          </p>

                          <p className="text-sm font-semibold text-slate-800 mt-1">
                            {request.reason}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs font-black text-blue-700">
                          CURRENT ATTENDANCE
                        </p>

                        {existing ? (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Check In
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatTime(existing.check_in)}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Check Out
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatTime(existing.check_out)}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Type
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {attendanceLabel(
                                  existing.attendance_type
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Late
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {existing.late_minutes || 0} min
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-5 text-sm font-bold text-blue-800">
                            Attendance record નથી. Absent Correction approve
                            કરશો તો requested Punch time પરથી attendance બનશે.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="xl:w-[300px] shrink-0">
                      <label className="block text-xs font-black text-slate-500 mb-2">
                        ADMIN NOTE
                      </label>

                      <textarea
                        value={correctionNotes[request.id] || ""}
                        onChange={(e) =>
                          setCorrectionNotes((current) => ({
                            ...current,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Admin Note (optional)"
                        rows={3}
                        className="w-full bg-white text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none"
                      />

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          type="button"
                          disabled={
                            actionId === `correction-${request.id}`
                          }
                          onClick={() =>
                            handleCorrectionAction(
                              request.id,
                              "approved"
                            )
                          }
                          className="bg-green-600 text-white px-4 py-2.5 rounded-xl font-black text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionId === `correction-${request.id}`
                          }
                          onClick={() =>
                            handleCorrectionAction(
                              request.id,
                              "rejected"
                            )
                          }
                          className="bg-red-600 text-white px-4 py-2.5 rounded-xl font-black text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {correctionRequests.length === 0 && (
              <div className="py-10 text-center text-slate-500 font-semibold">
                કોઈ Pending Attendance Correction Request નથી ✅
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-amber-200 rounded-2xl mt-5 overflow-hidden">
          <div className="p-5 border-b border-amber-200 bg-amber-50">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.14em] text-amber-700">
                  MANUAL PUNCH APPROVAL
                </p>

                <h2 className="text-xl font-black mt-1">
                  Manual Punch Requests
                </h2>

                <p className="text-sm text-slate-600 mt-1">
                  Requested time, reason અને current attendance compare કરીને
                  approve કરો.
                </p>
              </div>

              <span className="inline-flex w-fit rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-black text-amber-800">
                Pending: {manualRequests.length}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {manualRequests.map((request) => {
              const existing =
                existingAttendanceMap[
                  attendanceMapKey(
                    request.employee_id,
                    request.attendance_date
                  )
                ];

              return (
                <div
                  key={request.id}
                  className="yf-card p-4 sm:p-5"
                >
                  <div className="flex flex-col xl:flex-row xl:items-start gap-5">
                    <div className="xl:w-[220px] shrink-0">
                      <p className="text-xs font-black text-slate-500">
                        EMPLOYEE
                      </p>

                      <p className="text-lg font-black text-slate-900 mt-1">
                        {request.employees?.full_name || "-"}
                      </p>

                      <p className="text-sm font-semibold text-slate-500 mt-1">
                        {request.employees?.department || "-"}
                      </p>

                      <p className="text-sm font-black text-slate-800 mt-4">
                        {formatDate(request.attendance_date)}
                      </p>

                      <p className="text-xs text-slate-400 font-semibold mt-1">
                        Requested:{" "}
                        {formatRequestedAt(request.requested_at)}
                      </p>
                    </div>

                    <div className="flex-1 grid md:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-black text-amber-700">
                          REQUESTED MANUAL PUNCH
                        </p>

                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <p className="text-xs font-bold text-slate-500">
                              Punch In
                            </p>
                            <p className="font-black text-slate-900 mt-1">
                              {formatManualTime(request.punch_in_time)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs font-bold text-slate-500">
                              Punch Out
                            </p>
                            <p className="font-black text-slate-900 mt-1">
                              {formatManualTime(request.punch_out_time)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl bg-white border border-amber-100 p-3">
                          <p className="text-xs font-black text-slate-500">
                            REASON
                          </p>
                          <p className="text-sm font-semibold text-slate-800 mt-1">
                            {request.reason}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-xs font-black text-blue-700">
                          CURRENT ATTENDANCE
                        </p>

                        {existing ? (
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Check In
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatTime(existing.check_in)}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Check Out
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatTime(existing.check_out)}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Type
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {attendanceLabel(
                                  existing.attendance_type
                                )}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-bold text-slate-500">
                                Working
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {formatWorkingMinutes(
                                  existing.working_minutes
                                )}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-xl border border-blue-200 bg-white px-4 py-5 text-sm font-bold text-blue-800">
                            આ Date માટે Attendance record નથી. Approve કરશો તો
                            નવો record બનશે.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="xl:w-[300px] shrink-0">
                      <label className="block text-xs font-black text-slate-500 mb-2">
                        ADMIN NOTE
                      </label>

                      <textarea
                        value={manualNotes[request.id] || ""}
                        onChange={(e) =>
                          setManualNotes((current) => ({
                            ...current,
                            [request.id]: e.target.value,
                          }))
                        }
                        placeholder="Admin Note (optional)"
                        rows={3}
                        className="w-full bg-white text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-xl px-3 py-2 text-sm resize-none"
                      />

                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          type="button"
                          disabled={
                            actionId === `manual-${request.id}`
                          }
                          onClick={() =>
                            handleManualAction(
                              request.id,
                              "approve"
                            )
                          }
                          className="bg-green-600 text-white px-4 py-2.5 rounded-xl font-black text-sm hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionId === `manual-${request.id}`
                          }
                          onClick={() =>
                            handleManualAction(
                              request.id,
                              "reject"
                            )
                          }
                          className="bg-red-600 text-white px-4 py-2.5 rounded-xl font-black text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {manualRequests.length === 0 && (
              <div className="py-10 text-center text-slate-500 font-semibold">
                કોઈ Pending Manual Punch Request નથી ✅
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border rounded-2xl mt-5 overflow-hidden">
          <div className="p-5 border-b">
            <h2 className="text-xl font-black">
              Pending Attendance
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Late અને Half Day attendance verify કરો.
            </p>
          </div>

          <div className="yf-table-wrap">
            <table className="yf-table min-w-[1100px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4">Employee</th>
                  <th className="text-left px-5 py-4">Date</th>
                  <th className="text-left px-5 py-4">Type</th>
                  <th className="text-left px-5 py-4">Check In</th>
                  <th className="text-left px-5 py-4">Late</th>
                  <th className="text-left px-5 py-4">Check Out</th>
                  <th className="text-left px-5 py-4">Working</th>
                  <th className="text-left px-5 py-4">Action</th>
                </tr>
              </thead>

              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className="border-t align-top"
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold">
                        {record.employees?.full_name || "-"}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {record.employees?.department || "-"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      {formatDate(record.attendance_date)}
                    </td>

                    <td className="px-5 py-4">
                      <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold">
                        {attendanceLabel(record.attendance_type)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {formatTime(record.check_in)}
                    </td>

                    <td className="px-5 py-4">
                      {record.late_minutes || 0} min
                    </td>

                    <td className="px-5 py-4">
                      {formatTime(record.check_out)}
                    </td>

                    <td className="px-5 py-4">
                      {formatWorkingMinutes(record.working_minutes)}
                    </td>

                    <td className="px-5 py-4 min-w-[280px]">
                      <input
                        type="text"
                        value={notes[record.id] || ""}
                        onChange={(e) =>
                          setNotes((current) => ({
                            ...current,
                            [record.id]: e.target.value,
                          }))
                        }
                        placeholder="Admin Note (optional)"
                        className="w-full bg-white text-slate-900 placeholder:text-slate-500 border border-slate-300 rounded-lg px-3 py-2 text-sm"
                      />

                      <div className="flex gap-2 mt-3">
                        <button
                          type="button"
                          disabled={
                            actionId === `attendance-${record.id}`
                          }
                          onClick={() =>
                            handleAction(record.id, "approved")
                          }
                          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                        >
                          Approve
                        </button>

                        <button
                          type="button"
                          disabled={
                            actionId === `attendance-${record.id}`
                          }
                          onClick={() =>
                            handleAction(record.id, "rejected")
                          }
                          className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {records.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-slate-600 font-semibold"
                    >
                      કોઈ Pending Attendance નથી ✅
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
