"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
  role: string | null;
  approval_status: "pending" | "approved" | "rejected";
  is_active: boolean;
};

export default function EmployeeApprovalPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadEmployees() {
    setLoading(true);
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("employees")
      .select(
        `
        id,
        full_name,
        mobile,
        department,
        role,
        approval_status,
        is_active
      `
      )
      .neq("role", "admin")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("કર્મચારીઓની માહિતી લાવવામાં સમસ્યા આવી.");
      setLoading(false);
      return;
    }

    setEmployees((data || []) as Employee[]);
    setLoading(false);
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  async function updateStatus(
    employeeId: string,
    status: "approved" | "rejected"
  ) {
    setUpdatingId(employeeId);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("employees")
      .update({
        approval_status: status,
        is_active: status === "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", employeeId);

    if (error) {
      setMessage("Status update કરવામાં સમસ્યા આવી.");
      setUpdatingId(null);
      return;
    }

    await loadEmployees();
    setUpdatingId(null);
  }

  function statusLabel(status: string) {
    if (status === "approved") return "મંજૂર";
    if (status === "rejected") return "નામંજૂર";
    return "મંજૂરી બાકી";
  }

  function statusClass(status: string) {
    if (status === "approved") {
      return "bg-green-100 text-green-700";
    }

    if (status === "rejected") {
      return "bg-red-100 text-red-700";
    }

    return "bg-amber-100 text-amber-700";
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <Link
              href="/admin"
              className="text-sm font-semibold text-blue-600"
            >
              ← Admin Dashboard
            </Link>

            <h1 className="text-3xl font-black text-slate-900 mt-2">
              કર્મચારી મંજૂરી
            </h1>

            <p className="text-slate-500 mt-1">
              નવા કર્મચારીઓને મંજૂર અથવા નામંજૂર કરો
            </p>
          </div>

          <button
            type="button"
            onClick={loadEmployees}
            className="bg-white border border-slate-300 px-5 py-3 rounded-xl font-semibold hover:bg-slate-100"
          >
            Refresh
          </button>
        </div>

        {message && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 font-semibold">
            {message}
          </div>
        )}

        <div className="mt-8 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-slate-500">
              માહિતી લોડ થઈ રહી છે...
            </div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              કોઈ કર્મચારી મળ્યો નથી.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold text-slate-900">
                        {employee.full_name}
                      </h2>

                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${statusClass(
                          employee.approval_status
                        )}`}
                      >
                        {statusLabel(employee.approval_status)}
                      </span>
                    </div>

                    <div className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                      <p>
                        <span className="font-semibold text-slate-600">
                          મોબાઇલ:
                        </span>{" "}
                        {employee.mobile}
                      </p>

                      <p>
                        <span className="font-semibold text-slate-600">
                          વિભાગ:
                        </span>{" "}
                        {employee.department || "-"}
                      </p>

                      <p>
                        <span className="font-semibold text-slate-600">
                          Role:
                        </span>{" "}
                        {employee.role || "employee"}
                      </p>

                      <p>
                        <span className="font-semibold text-slate-600">
                          Account:
                        </span>{" "}
                        {employee.is_active ? "Active" : "Inactive"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={
                        updatingId === employee.id ||
                        employee.approval_status === "approved"
                      }
                      onClick={() =>
                        updateStatus(employee.id, "approved")
                      }
                      className="px-5 py-3 rounded-xl bg-green-600 disabled:bg-slate-300 text-white font-bold"
                    >
                      {updatingId === employee.id
                        ? "અપડેટ..."
                        : "મંજૂર કરો"}
                    </button>

                    <button
                      type="button"
                      disabled={
                        updatingId === employee.id ||
                        employee.approval_status === "rejected"
                      }
                      onClick={() =>
                        updateStatus(employee.id, "rejected")
                      }
                      className="px-5 py-3 rounded-xl bg-red-600 disabled:bg-slate-300 text-white font-bold"
                    >
                      નામંજૂર કરો
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}