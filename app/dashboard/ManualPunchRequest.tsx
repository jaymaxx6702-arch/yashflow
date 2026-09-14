"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type ManualPunchRequestRow = {
  id: string;
  attendance_date: string;
  punch_in_time: string | null;
  punch_out_time: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  admin_note: string | null;
};

type Props = {
  employeeId: string;
  timezone?: string;
};

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

function subtractDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatTime(value: string | null) {
  if (!value) return "-";

  const [hourString, minuteString] = value.split(":");
  const hour = Number(hourString);
  const minute = Number(minuteString);

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function statusClass(status: ManualPunchRequestRow["status"]) {
  if (status === "approved") {
    return "bg-green-100 text-green-800 border-green-200";
  }

  if (status === "rejected") {
    return "bg-red-100 text-red-800 border-red-200";
  }

  return "bg-amber-100 text-amber-800 border-amber-200";
}

export default function ManualPunchRequest({
  employeeId,
  timezone = "Asia/Kolkata",
}: Props) {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<ManualPunchRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const today = useMemo(
    () => getDateInTimeZone(timezone),
    [timezone]
  );

  const minDate = useMemo(
    () => subtractDays(today, 7),
    [today]
  );

  const [attendanceDate, setAttendanceDate] = useState(today);
  const [punchIn, setPunchIn] = useState("");
  const [punchOut, setPunchOut] = useState("");
  const [reason, setReason] = useState("");

  async function loadRequests() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("manual_attendance_requests")
      .select(`
        id,
        attendance_date,
        punch_in_time,
        punch_out_time,
        reason,
        status,
        requested_at,
        reviewed_at,
        admin_note
      `)
      .eq("employee_id", employeeId)
      .order("requested_at", { ascending: false })
      .limit(10);

    if (error) {
      setMessage(`Manual Punch Load Error: ${error.message}`);
      setLoading(false);
      return;
    }

    setRequests((data || []) as ManualPunchRequestRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!employeeId) return;
    void loadRequests();
  }, [employeeId]);

  function openForm() {
    setAttendanceDate(today);
    setPunchIn("");
    setPunchOut("");
    setReason("");
    setMessage("");
    setOpen(true);
  }

  async function submitRequest() {
    if (!attendanceDate) {
      setMessage("Attendance Date જરૂરી છે.");
      return;
    }

    if (!punchIn && !punchOut) {
      setMessage("Punch In અથવા Punch Outમાંથી ઓછામાં ઓછો એક સમય આપવો જરૂરી છે.");
      return;
    }

    if (punchIn && punchOut && punchOut <= punchIn) {
      setMessage("Punch Out time Punch In પછીનો હોવો જોઈએ.");
      return;
    }

    if (reason.trim().length < 3) {
      setMessage("Reason જરૂરી છે.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "employee_create_manual_punch_request",
      {
        p_attendance_date: attendanceDate,
        p_punch_in: punchIn || null,
        p_punch_out: punchOut || null,
        p_reason: reason.trim(),
      }
    );

    if (error) {
      setMessage(`Manual Punch Error: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadRequests();

    setPunchIn("");
    setPunchOut("");
    setReason("");
    setSaving(false);
    setOpen(false);
    setMessage("Manual Punch Request Admin Approval માટે મોકલાઈ ✅");
  }

  return (
    <>
      <div className="mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.12em] text-amber-700">
              MANUAL PUNCH
            </p>

            <p className="text-sm font-semibold text-slate-600 mt-1">
              Punch ભૂલી ગયા હો તો આજે અથવા છેલ્લા 7 દિવસ માટે request મોકલો.
            </p>
          </div>

          <button
            type="button"
            onClick={openForm}
            className="yf-btn bg-amber-500 text-white hover:bg-amber-600"
          >
            🕘 Manual Punch Request
          </button>
        </div>

        {message && (
          <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
            {message}
          </div>
        )}

        {!loading && requests.length > 0 && (
          <div className="mt-4 grid gap-2">
            {requests.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-black text-slate-900">
                      {formatDate(item.attendance_date)}
                    </p>

                    <p className="text-sm font-semibold text-slate-600 mt-1">
                      {formatTime(item.punch_in_time)}
                      {" → "}
                      {formatTime(item.punch_out_time)}
                    </p>
                  </div>

                  <span
                    className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black ${statusClass(
                      item.status
                    )}`}
                  >
                    {item.status === "pending"
                      ? "Pending Approval ⏳"
                      : item.status === "approved"
                      ? "Approved ✓"
                      : "Rejected ✕"}
                  </span>
                </div>

                <p className="text-xs text-slate-500 font-semibold mt-2">
                  Reason: {item.reason}
                </p>

                {item.admin_note && (
                  <p className="text-xs text-blue-700 font-bold mt-1">
                    Admin Note: {item.admin_note}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-[110] bg-slate-950/50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl yf-card overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-amber-700">
                  MANUAL ATTENDANCE
                </p>

                <h3 className="text-2xl font-black text-slate-900 mt-1">
                  Manual Punch Request
                </h3>

                <p className="text-sm font-semibold text-slate-500 mt-1">
                  Request approve થયા પછી જ Attendance update થશે.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-black"
              >
                ✕
              </button>
            </div>

            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Attendance Date
                </label>

                <input
                  type="date"
                  min={minDate}
                  max={today}
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="yf-input"
                />

                <p className="text-xs font-semibold text-slate-400 mt-1">
                  Today + past 7 days only
                </p>
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Punch In
                </label>

                <input
                  type="time"
                  value={punchIn}
                  onChange={(e) => setPunchIn(e.target.value)}
                  className="yf-input"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Punch Out
                </label>

                <input
                  type="time"
                  value={punchOut}
                  onChange={(e) => setPunchOut(e.target.value)}
                  className="yf-input"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Reason *
                </label>

                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="ઉદાહરણ: સવારે Punch In કરવાનું ભૂલી ગયો હતો."
                  rows={4}
                  className="yf-input resize-none"
                />
              </div>

              <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                Punch In / Punch Outમાંથી જે ભૂલાયું હોય તે જ સમય આપી શકો છો.
                બંને ભૂલાયા હોય તો બંને સમય આપો.
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setOpen(false)}
                className="yf-btn yf-btn-secondary"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={submitRequest}
                className="yf-btn bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {saving
                  ? "Submitting..."
                  : "Submit for Approval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
