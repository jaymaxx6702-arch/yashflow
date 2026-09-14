"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  employees: Employee | null;
};

type WorkloadCount = {
  tasks: number;
  orders: number;
};

export default function AdminLeavePage() {
  const router = useRouter();

  const [adminId, setAdminId] = useState<string | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [primaryHandover, setPrimaryHandover] =
    useState<Record<string, string>>({});
  const [supportHandover, setSupportHandover] =
    useState<Record<string, string>>({});
  const [workloadByEmployee, setWorkloadByEmployee] =
    useState<Record<string, WorkloadCount>>({});
  const [message, setMessage] = useState("");

  async function loadLeaves() {
    const supabase = createClient();

    const { data, error } = await supabase
  .from("leave_requests")
  .select(`
    id,
    employee_id,
    leave_type,
    start_date,
    end_date,
    reason,
    status,
    admin_note,
    created_at,
    employees!leave_requests_employee_id_fkey (
      id,
      full_name,
      mobile,
      department
    )
  `)
  .order("created_at", { ascending: false });
    if (error) {
      setMessage(`Leave Load Error: ${error.message}`);
      return;
    }

    setLeaves((data || []) as unknown as LeaveRequest[]);
  }

  async function loadHandoverData() {
    const supabase = createClient();

    const [
      employeeResult,
      taskResult,
      stageWorkResult,
      stageWorkerResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, mobile, department")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .order("full_name"),

      supabase
        .from("tasks")
        .select("id, assigned_to, status")
        .in("status", ["pending", "in_progress"]),

      supabase
        .from("order_stage_work")
        .select("id, primary_employee_id, status")
        .in("status", [
          "waiting",
          "assigned",
          "in_progress",
          "ready_for_approval",
          "hold",
          "rework",
        ]),

      supabase
        .from("order_stage_workers")
        .select("order_stage_work_id, employee_id, left_at")
        .is("left_at", null),
    ]);

    const firstError =
      employeeResult.error ||
      taskResult.error ||
      stageWorkResult.error ||
      stageWorkerResult.error;

    if (firstError) {
      setMessage(`Handover Load Error: ${firstError.message}`);
      return;
    }

    setEmployees((employeeResult.data || []) as Employee[]);

    const counts: Record<string, WorkloadCount> = {};

    for (const employee of (employeeResult.data || []) as Employee[]) {
      counts[employee.id] = { tasks: 0, orders: 0 };
    }

    for (const task of taskResult.data || []) {
      if (!counts[task.assigned_to]) {
        counts[task.assigned_to] = { tasks: 0, orders: 0 };
      }

      counts[task.assigned_to].tasks += 1;
    }

    const workEmployeePairs = new Set<string>();

    for (const work of stageWorkResult.data || []) {
      if (work.primary_employee_id) {
        workEmployeePairs.add(
          `${work.id}:${work.primary_employee_id}`
        );
      }
    }

    for (const link of stageWorkerResult.data || []) {
      workEmployeePairs.add(
        `${link.order_stage_work_id}:${link.employee_id}`
      );
    }

    for (const pair of workEmployeePairs) {
      const [, employeeId] = pair.split(":");

      if (!counts[employeeId]) {
        counts[employeeId] = { tasks: 0, orders: 0 };
      }

      counts[employeeId].orders += 1;
    }

    setWorkloadByEmployee(counts);
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

      const { data: adminData, error: adminError } =
        await supabase
          .from("employees")
          .select(
            "id, role, approval_status, is_active"
          )
          .eq("auth_user_id", user.id)
          .single();

      if (
        adminError ||
        !adminData ||
        adminData.role !== "admin" ||
        adminData.approval_status !== "approved" ||
        !adminData.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      setAdminId(adminData.id);

      await Promise.all([
        loadLeaves(),
        loadHandoverData(),
      ]);

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function approveLeave(leave: LeaveRequest) {
    if (!adminId) return;

    const primaryId =
      primaryHandover[leave.id] || null;
    const supportId =
      supportHandover[leave.id] || null;

    if (supportId && !primaryId) {
      setMessage(
        "Second/Support Employee પહેલા Primary Handover Employee select કરો."
      );
      return;
    }

    if (primaryId && primaryId === leave.employee_id) {
      setMessage(
        "Leave લેતા Employeeને જ Handover કરી શકાય નહીં."
      );
      return;
    }

    if (supportId && supportId === leave.employee_id) {
      setMessage(
        "Leave લેતા Employeeને Support તરીકે select કરી શકાય નહીં."
      );
      return;
    }

    if (primaryId && supportId && primaryId === supportId) {
      setMessage(
        "Primary અને Support Employee અલગ હોવા જોઈએ."
      );
      return;
    }

    const workload =
      workloadByEmployee[leave.employee_id] || {
        tasks: 0,
        orders: 0,
      };

    const workCount = workload.tasks + workload.orders;

    const confirmText = primaryId
      ? `Leave approve કરીને ${workload.tasks} Task(s) અને ${workload.orders} Order Stage(s) handover કરવા છે?`
      : workCount > 0
      ? `આ Employee પાસે ${workload.tasks} Task(s) અને ${workload.orders} Order Stage(s) active છે. Handover વગર Leave approve કરવી છે?`
      : "Leave approve કરવી છે?";

    if (!window.confirm(confirmText)) return;

    setActionId(leave.id);
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase.rpc(
      "admin_approve_leave_with_handover",
      {
        p_leave_id: leave.id,
        p_primary_employee_id: primaryId,
        p_support_employee_id: supportId,
        p_admin_note: notes[leave.id]?.trim() || null,
      }
    );

    if (error) {
      setMessage(`Leave Approve Error: ${error.message}`);
      setActionId(null);
      return;
    }

    const result = (data || {}) as {
      handover?: boolean;
      task_count?: number;
      order_stage_count?: number;
    };

    setMessage(
      result.handover
        ? `Leave Approved ✅ • ${result.task_count || 0} Task(s) • ${result.order_stage_count || 0} Order Stage(s) Handover`
        : "Leave Request Approved ✅"
    );

    setPrimaryHandover((current) => ({
      ...current,
      [leave.id]: "",
    }));

    setSupportHandover((current) => ({
      ...current,
      [leave.id]: "",
    }));

    await Promise.all([
      loadLeaves(),
      loadHandoverData(),
    ]);

    setActionId(null);
  }

  async function rejectLeave(leaveId: string) {
    if (!adminId) return;

    setActionId(leaveId);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("leave_requests")
      .update({
        status: "rejected",
        admin_note: notes[leaveId]?.trim() || null,
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", leaveId)
      .eq("status", "pending");

    if (error) {
      setMessage(`Update Error: ${error.message}`);
      setActionId(null);
      return;
    }

    setMessage("Leave Request Rejected.");

    await loadLeaves();
    setActionId(null);
  }

  function leaveTypeLabel(type: string) {
    if (type === "first_half") {
      return "First Half";
    }

    if (type === "second_half") {
      return "Second Half";
    }

    return "Full Day";
  }

  function statusLabel(status: string) {
    if (status === "approved") return "Approved";
    if (status === "rejected") return "Rejected";
    if (status === "cancelled") return "Cancelled";

    return "Pending";
  }

  function statusClass(status: string) {
    if (status === "approved") {
      return "bg-green-100 text-green-700";
    }

    if (status === "rejected") {
      return "bg-red-100 text-red-700";
    }

    if (status === "cancelled") {
      return "bg-slate-100 text-slate-600";
    }

    return "bg-orange-100 text-orange-700";
  }

  const pendingCount = leaves.filter(
    (leave) => leave.status === "pending"
  ).length;

  const approvedCount = leaves.filter(
    (leave) => leave.status === "approved"
  ).length;

  const rejectedCount = leaves.filter(
    (leave) => leave.status === "rejected"
  ).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Leave Management લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-blue-100 text-sm">
              Leave Management
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="bg-white/15 hover:bg-white/25 px-4 py-2 rounded-xl font-semibold"
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

        <section className="grid sm:grid-cols-3 gap-4">
          <div className="bg-white border rounded-2xl p-5">
            <p className="text-sm text-slate-500">
              Pending
            </p>

            <p className="text-3xl font-black text-orange-600 mt-2">
              {pendingCount}
            </p>
          </div>

          <div className="bg-white border rounded-2xl p-5">
            <p className="text-sm text-slate-500">
              Approved
            </p>

            <p className="text-3xl font-black text-green-600 mt-2">
              {approvedCount}
            </p>
          </div>

          <div className="bg-white border rounded-2xl p-5">
            <p className="text-sm text-slate-500">
              Rejected
            </p>

            <p className="text-3xl font-black text-red-600 mt-2">
              {rejectedCount}
            </p>
          </div>
        </section>

        <section className="bg-white border rounded-2xl mt-5 overflow-hidden">
          <div className="p-5 border-b flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black">
                Employee Leave Requests
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Leave approve કરો અને જરૂર હોય તો active Tasks / Orders 1 અથવા 2 Employeesને handover કરો.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                void Promise.all([
                  loadLeaves(),
                  loadHandoverData(),
                ])
              }
              className="border px-4 py-2 rounded-xl font-semibold hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Employee
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Department
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Leave
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Date
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Reason
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Status
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Admin Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {leaves.map((leave) => (
                  <tr
                    key={leave.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold">
                        {leave.employees?.full_name || "-"}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {leave.employees?.mobile || ""}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      {leave.employees?.department || "-"}
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {leaveTypeLabel(leave.leave_type)}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      {leave.start_date === leave.end_date
                        ? leave.start_date
                        : `${leave.start_date} → ${leave.end_date}`}
                    </td>

                    <td className="px-5 py-4 max-w-[250px]">
                      {leave.reason}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`${statusClass(
                          leave.status
                        )} px-3 py-1.5 rounded-full text-xs font-bold`}
                      >
                        {statusLabel(leave.status)}
                      </span>
                    </td>

                    <td className="px-5 py-4 min-w-[300px]">
                      {leave.status === "pending" ? (
                        <>
                          {(() => {
                            const workload =
                              workloadByEmployee[leave.employee_id] || {
                                tasks: 0,
                                orders: 0,
                              };

                            const eligibleEmployees = employees.filter(
                              (employee) =>
                                employee.id !== leave.employee_id
                            );

                            return (
                              <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                                <p className="text-xs font-black text-blue-700">
                                  ACTIVE WORK
                                </p>

                                <p className="text-sm font-bold text-slate-800 mt-1">
                                  {workload.tasks} Task(s) • {workload.orders} Order Stage(s)
                                </p>

                                <div className="grid gap-2 mt-3">
                                  <select
                                    value={primaryHandover[leave.id] || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;

                                      setPrimaryHandover((current) => ({
                                        ...current,
                                        [leave.id]: value,
                                      }));

                                      if (
                                        supportHandover[leave.id] === value
                                      ) {
                                        setSupportHandover((current) => ({
                                          ...current,
                                          [leave.id]: "",
                                        }));
                                      }
                                    }}
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 bg-white text-sm font-semibold"
                                  >
                                    <option value="">
                                      Approve Only — No Handover
                                    </option>

                                    {eligibleEmployees.map((employee) => (
                                      <option
                                        key={employee.id}
                                        value={employee.id}
                                      >
                                        Primary → {employee.full_name}
                                        {employee.department
                                          ? ` — ${employee.department}`
                                          : ""}
                                      </option>
                                    ))}
                                  </select>

                                  <select
                                    value={supportHandover[leave.id] || ""}
                                    disabled={!primaryHandover[leave.id]}
                                    onChange={(e) =>
                                      setSupportHandover((current) => ({
                                        ...current,
                                        [leave.id]: e.target.value,
                                      }))
                                    }
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 bg-white text-sm font-semibold disabled:bg-slate-100"
                                  >
                                    <option value="">
                                      Second Employee / Support (Optional)
                                    </option>

                                    {eligibleEmployees
                                      .filter(
                                        (employee) =>
                                          employee.id !==
                                          primaryHandover[leave.id]
                                      )
                                      .map((employee) => (
                                        <option
                                          key={employee.id}
                                          value={employee.id}
                                        >
                                          Support → {employee.full_name}
                                          {employee.department
                                            ? ` — ${employee.department}`
                                            : ""}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                <p className="text-[11px] text-blue-700 mt-2">
                                  Primaryને open Tasks + primary Orders મળશે. Second Employee Task/Order support તરીકે add થશે.
                                </p>
                              </div>
                            );
                          })()}

                          <input
                            type="text"
                            value={notes[leave.id] || ""}
                            onChange={(e) =>
                              setNotes((current) => ({
                                ...current,
                                [leave.id]: e.target.value,
                              }))
                            }
                            placeholder="Admin Note (optional)"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          />

                          <div className="flex gap-2 mt-3">
                            <button
                              type="button"
                              disabled={actionId === leave.id}
                              onClick={() =>
                                approveLeave(leave)
                              }
                              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                            >
                              Approve
                            </button>

                            <button
                              type="button"
                              disabled={actionId === leave.id}
                              onClick={() =>
                                rejectLeave(leave.id)
                              }
                              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        </>
                      ) : (
                        <div>
                          <p className="font-semibold">
                            {statusLabel(leave.status)}
                          </p>

                          {leave.admin_note && (
                            <p className="text-sm text-slate-500 mt-1">
                              {leave.admin_note}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {leaves.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      કોઈ Leave Request મળી નથી.
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