"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

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

  employees: {
    id: string;
    full_name: string;
    mobile: string;
    department: string | null;
  } | null;
};

export default function AttendanceApprovalPage() {
  const router = useRouter();

  const [adminId, setAdminId] = useState<string | null>(null);
  const [records, setRecords] = useState<PendingAttendance[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
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
    if (type === "half_day") {
      return "Half Day";
    }

    if (type === "late") {
      return "Late";
    }

    return "Present";
  }

  async function loadRecords() {
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
      setMessage(`Attendance Load Error: ${error.message}`);
      return;
    }

    setRecords((data || []) as unknown as PendingAttendance[]);
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

      await loadRecords();

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleAction(
    attendanceId: string,
    newStatus: "approved" | "rejected"
  ) {
    if (!adminId) return;

    setActionId(attendanceId);
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

    await loadRecords();

    setActionId(null);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Attendance Approval લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-5 py-5 flex justify-between items-center gap-4">
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
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl p-4 font-semibold">
            {message}
          </div>
        )}

        <section className="bg-white border rounded-2xl p-5">
          <div className="flex justify-between items-center gap-4">
            <div>
              <p className="text-sm text-slate-500">
                Pending Approval
              </p>

              <p className="text-4xl font-black text-orange-600 mt-1">
                {records.length}
              </p>
            </div>

            <button
              type="button"
              onClick={loadRecords}
              className="border border-slate-300 bg-white text-slate-900 px-4 py-2 rounded-xl font-bold hover:bg-slate-100"
            >
              Refresh
            </button>
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
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
                      {record.attendance_date}
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
                          disabled={actionId === record.id}
                          onClick={() =>
                            handleAction(record.id, "approved")
                          }
                          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold text-sm disabled:opacity-50"
                        >
                          Approve
                        </button>

                        <button
                          type="button"
                          disabled={actionId === record.id}
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