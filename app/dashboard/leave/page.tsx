"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
};

type LeaveRequest = {
  id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
};

export default function LeavePage() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  const [leaveType, setLeaveType] = useState("full_day");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadLeaves(employeeId: string) {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("leave_requests")
      .select(
        `
        id,
        leave_type,
        start_date,
        end_date,
        reason,
        status,
        admin_note,
        created_at
        `
      )
      .eq("employee_id", employeeId)
      .order("created_at", {
        ascending: false,
      });

    if (!error) {
      setLeaves(data || []);
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

      const { data: empData, error: empError } =
        await supabase
          .from("employees")
          .select("id, full_name, approval_status, is_active")
          .eq("auth_user_id", user.id)
          .single();

      if (
        empError ||
        !empData ||
        empData.approval_status !== "approved" ||
        !empData.is_active
      ) {
        router.replace("/");
        return;
      }

      setEmployee(empData);

      await loadLeaves(empData.id);

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!employee) return;

    setMessage("");

    if (!startDate || !endDate || !reason.trim()) {
      setMessage("બધી જરૂરી માહિતી ભરો.");
      return;
    }

    if (endDate < startDate) {
      setMessage(
        "End Date, Start Date કરતાં પહેલાં હોઈ શકતી નથી."
      );
      return;
    }

    if (
      leaveType !== "full_day" &&
      startDate !== endDate
    ) {
      setMessage(
        "Half Day leave માટે Start Date અને End Date એક જ રાખો."
      );
      return;
    }

    setSaving(true);

    const supabase = createClient();

    const { error } = await supabase
      .from("leave_requests")
      .insert({
        employee_id: employee.id,
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
        status: "pending",
      });

    if (error) {
      setMessage(
        `Leave Request Error: ${error.message}`
      );
      setSaving(false);
      return;
    }

    setMessage(
      "Leave Request સફળતાપૂર્વક મોકલાઈ ✅"
    );

    setLeaveType("full_day");
    setStartDate("");
    setEndDate("");
    setReason("");

    await loadLeaves(employee.id);

    setSaving(false);
  }

  function getLeaveTypeLabel(type: string) {
    if (type === "first_half") {
      return "First Half";
    }

    if (type === "second_half") {
      return "Second Half";
    }

    return "Full Day";
  }

  function getStatusStyle(status: string) {
    if (status === "approved") {
      return "bg-green-100 text-green-800";
    }

    if (status === "rejected") {
      return "bg-red-100 text-red-800";
    }

    if (status === "cancelled") {
      return "bg-slate-200 text-slate-800";
    }

    return "bg-orange-100 text-orange-800";
  }

  function getStatusLabel(status: string) {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    if (status === "cancelled") return "Cancelled";

    return "Pending";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-700">
          Leave page લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-blue-600 text-white">
        <div className="max-w-5xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-white">
              YashFlow
            </h1>

            <p className="text-blue-100 text-sm font-medium">
              Leave Management
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl font-bold"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-5">
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-2xl font-black text-slate-900">
            Leave Request
          </h2>

          <p className="text-slate-700 font-semibold mt-1">
            {employee?.full_name}
          </p>

          {message && (
            <div className="mt-5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 font-semibold">
              {message}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-6 grid md:grid-cols-2 gap-5"
          >
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">
                Leave Type
              </label>

              <select
                value={leaveType}
                onChange={(e) =>
                  setLeaveType(e.target.value)
                }
                className="w-full bg-white text-slate-900 border border-slate-400 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="full_day">
                  Full Day
                </option>

                <option value="first_half">
                  First Half
                </option>

                <option value="second_half">
                  Second Half
                </option>
              </select>
            </div>

            <div className="hidden md:block" />

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">
                Start Date
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);

                  if (leaveType !== "full_day") {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full bg-white text-slate-900 border border-slate-400 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-800 mb-2">
                End Date
              </label>

              <input
                type="date"
                value={endDate}
                disabled={leaveType !== "full_day"}
                onChange={(e) =>
                  setEndDate(e.target.value)
                }
                className="w-full bg-white text-slate-900 border border-slate-400 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-700 disabled:opacity-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-800 mb-2">
                Reason
              </label>

              <textarea
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value)
                }
                rows={4}
                placeholder="Leave માટે કારણ લખો..."
                className="w-full bg-white text-slate-900 placeholder:text-slate-500 border border-slate-400 rounded-xl px-4 py-3 font-medium outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-60"
              >
                {saving
                  ? "મોકલી રહ્યા છીએ..."
                  : "Leave Request મોકલો"}
              </button>
            </div>
          </form>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl mt-5 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-200">
            <h3 className="text-xl font-black text-slate-900">
              My Leave Requests
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-slate-800">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm font-black text-slate-800">
                    Type
                  </th>

                  <th className="text-left px-5 py-4 text-sm font-black text-slate-800">
                    Date
                  </th>

                  <th className="text-left px-5 py-4 text-sm font-black text-slate-800">
                    Reason
                  </th>

                  <th className="text-left px-5 py-4 text-sm font-black text-slate-800">
                    Status
                  </th>

                  <th className="text-left px-5 py-4 text-sm font-black text-slate-800">
                    Admin Note
                  </th>
                </tr>
              </thead>

              <tbody>
                {leaves.map((leave) => (
                  <tr
                    key={leave.id}
                    className="border-t border-slate-200"
                  >
                    <td className="px-5 py-4 font-bold text-slate-900">
                      {getLeaveTypeLabel(
                        leave.leave_type
                      )}
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-800">
                      {leave.start_date ===
                      leave.end_date
                        ? leave.start_date
                        : `${leave.start_date} → ${leave.end_date}`}
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-800">
                      {leave.reason}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`${getStatusStyle(
                          leave.status
                        )} px-3 py-1.5 rounded-full text-xs font-bold`}
                      >
                        {getStatusLabel(
                          leave.status
                        )}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-medium text-slate-700">
                      {leave.admin_note || "-"}
                    </td>
                  </tr>
                ))}

                {leaves.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center font-medium text-slate-600"
                    >
                      હજી કોઈ Leave Request નથી.
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