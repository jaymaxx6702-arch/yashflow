"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  priority: "low" | "normal" | "high" | "urgent";
  order_date: string | null;
  due_date: string | null;
  current_stage: string;
  current_stage_id: string | null;
  workflow_status: string;
  workflow_mode: string;
  product_configuration: Record<string, string> | null;
  customer_note: string | null;
  admin_note: string | null;
};

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
};

type Stage = {
  id: string;
  code: string;
  name: string;
};

type StageWork = {
  id: string;
  order_id: string;
  stage_id: string;
  status: string;
  primary_employee_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  hold_reason: string | null;
  rework_reason: string | null;
  created_at: string | null;
};

type StageWorker = {
  id: string;
  order_stage_work_id: string;
  employee_id: string;
  worker_role: "primary" | "support";
  left_at: string | null;
};

function pretty(value: string | null | undefined) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

function statusClass(status: string) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  if (status === "ready_for_approval") return "bg-purple-100 text-purple-700";
  if (status === "hold") return "bg-amber-100 text-amber-800";
  if (status === "rework") return "bg-red-100 text-red-700";
  if (status === "assigned") return "bg-cyan-100 text-cyan-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function priorityClass(priority: Order["priority"]) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-blue-100 text-blue-700";
}

export default function EmployeeOrderDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const orderId = Array.isArray(params?.id)
    ? params.id[0]
    : typeof params?.id === "string"
    ? params.id
    : "";

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [stageWorkers, setStageWorkers] = useState<StageWorker[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages]
  );

  const employeeMap = useMemo(
    () => new Map(employees.map((item) => [item.id, item])),
    [employees]
  );

  const workersByWork = useMemo(() => {
    const map = new Map<string, StageWorker[]>();
    for (const worker of stageWorkers) {
      const current = map.get(worker.order_stage_work_id) || [];
      current.push(worker);
      map.set(worker.order_stage_work_id, current);
    }
    return map;
  }, [stageWorkers]);

  const currentWork = useMemo(() => {
    const activeStatuses = [
      "waiting",
      "assigned",
      "in_progress",
      "ready_for_approval",
      "hold",
      "rework",
    ];

    return (
      [...stageWorks]
        .reverse()
        .find((work) => activeStatuses.includes(work.status)) ||
      stageWorks[stageWorks.length - 1] ||
      null
    );
  }, [stageWorks]);

  function employeeName(id: string | null | undefined) {
    if (!id) return "-";
    return employeeMap.get(id)?.full_name || "Employee";
  }

  function teamNames(work: StageWork) {
    const ids = new Set<string>();
    if (work.primary_employee_id) ids.add(work.primary_employee_id);

    for (const link of workersByWork.get(work.id) || []) {
      if (!link.left_at) ids.add(link.employee_id);
    }

    return Array.from(ids).map(employeeName);
  }

  useEffect(() => {
    async function loadPage() {
      if (!orderId) {
        setMessage("Order ID મળ્યો નથી.");
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("id, full_name, department")
        .eq("auth_user_id", user.id)
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .single();

      if (profileError || !profile) {
        router.replace("/");
        return;
      }

      setEmployee(profile as Employee);

      const [orderResult, stageWorksResult, stagesResult] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            order_number,
            customer_name,
            customer_mobile,
            product_name,
            quantity,
            priority,
            order_date,
            due_date,
            current_stage,
            current_stage_id,
            workflow_status,
            workflow_mode,
            product_configuration,
            customer_note,
            admin_note
          `)
          .eq("id", orderId)
          .maybeSingle(),

        supabase
          .from("order_stage_work")
          .select(`
            id,
            order_id,
            stage_id,
            status,
            primary_employee_id,
            started_at,
            completed_at,
            hold_reason,
            rework_reason,
            created_at
          `)
          .eq("order_id", orderId)
          .order("created_at", { ascending: true }),

        supabase
          .from("workflow_stages")
          .select("id, code, name")
          .order("sort_order", { ascending: true }),
      ]);

      const firstError =
        orderResult.error || stageWorksResult.error || stagesResult.error;

      if (firstError) {
        setMessage(`Order Load Error: ${firstError.message}`);
        setLoading(false);
        return;
      }

      if (!orderResult.data) {
        setMessage("Order મળ્યો નથી અથવા તમને આ Orderનો access નથી.");
        setLoading(false);
        return;
      }

      const workRows = (stageWorksResult.data || []) as StageWork[];
      const workIds = workRows.map((work) => work.id);

      let workerRows: StageWorker[] = [];

      if (workIds.length > 0) {
        const { data: workerData, error: workerError } = await supabase
          .from("order_stage_workers")
          .select(`
            id,
            order_stage_work_id,
            employee_id,
            worker_role,
            left_at
          `)
          .in("order_stage_work_id", workIds);

        if (workerError) {
          setMessage(`Order Team Load Error: ${workerError.message}`);
          setLoading(false);
          return;
        }

        workerRows = (workerData || []) as StageWorker[];
      }

      const employeeIds = Array.from(
        new Set([
          profile.id,
          ...workRows
            .map((work) => work.primary_employee_id)
            .filter((id): id is string => Boolean(id)),
          ...workerRows.map((worker) => worker.employee_id),
        ])
      );

      let employeeRows: Employee[] = [];

      if (employeeIds.length > 0) {
        const { data: employeeData, error: employeeError } = await supabase
          .from("employees")
          .select("id, full_name, department")
          .in("id", employeeIds);

        if (employeeError) {
          setMessage(`Employee Load Error: ${employeeError.message}`);
          setLoading(false);
          return;
        }

        employeeRows = (employeeData || []) as Employee[];
      }

      setOrder(orderResult.data as unknown as Order);
      setStageWorks(workRows);
      setStageWorkers(workerRows);
      setStages((stagesResult.data || []) as Stage[]);
      setEmployees(employeeRows);
      setLoading(false);
    }

    void loadPage();
  }, [orderId, router]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Order Details લોડ થઈ રહ્યા છે...
        </div>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="yf-page">
        <div className="yf-container py-10">
          <div className="yf-card p-8 text-center">
            <h1 className="text-xl font-black text-slate-900">
              Order Open થઈ શક્યો નથી
            </h1>
            <p className="text-sm font-semibold text-red-600 mt-2">
              {message || "Order મળ્યો નથી."}
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard/orders")}
              className="yf-btn yf-btn-primary mt-5"
            >
              ← My Orders
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              EMPLOYEE ORDER DETAILS
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h1 className="text-2xl sm:text-3xl font-black text-white">
                {order.order_number}
              </h1>
              <span className={`yf-badge ${priorityClass(order.priority)}`}>
                {order.priority.toUpperCase()}
              </span>
              <span
                className={`yf-badge ${statusClass(
                  currentWork?.status || order.workflow_status
                )}`}
              >
                {pretty(currentWork?.status || order.workflow_status)}
              </span>
            </div>
            <p className="text-blue-100 text-sm font-semibold mt-1">
              {employee?.full_name} • Full Order View
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard/orders")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← My Orders
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <section className="grid lg:grid-cols-3 gap-4">
          <div className="yf-card p-5 lg:col-span-2">
            <p className="text-xs font-black tracking-[0.12em] text-blue-700">
              ORDER DETAILS
            </p>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-xs font-black text-slate-400">CUSTOMER</p>
                <p className="font-black text-slate-900 mt-1">
                  {order.customer_name}
                </p>
                <p className="text-sm font-semibold text-slate-500 mt-1">
                  {order.customer_mobile || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-black text-slate-400">PRODUCT</p>
                <p className="font-black text-slate-900 mt-1">
                  {order.product_name}
                </p>
                <p className="text-sm font-semibold text-slate-500 mt-1">
                  Qty: {order.quantity}
                </p>
              </div>
              <div>
                <p className="text-xs font-black text-slate-400">ORDER DATE</p>
                <p className="font-black text-slate-900 mt-1">
                  {formatDate(order.order_date)}
                </p>
              </div>
              <div>
                <p className="text-xs font-black text-slate-400">DUE DATE</p>
                <p className="font-black text-slate-900 mt-1">
                  {formatDate(order.due_date)}
                </p>
              </div>
            </div>
          </div>

          <div className="yf-card p-5">
            <p className="text-xs font-black tracking-[0.12em] text-purple-700">
              CURRENT WORK
            </p>
            <p className="text-lg font-black text-slate-900 mt-3">
              {currentWork
                ? stageMap.get(currentWork.stage_id)?.name ||
                  pretty(order.current_stage)
                : pretty(order.current_stage)}
            </p>
            <span
              className={`yf-badge mt-2 ${statusClass(
                currentWork?.status || order.workflow_status
              )}`}
            >
              {pretty(currentWork?.status || order.workflow_status)}
            </span>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-xs font-black text-slate-400">ASSIGNED TEAM</p>
              <p className="font-bold text-slate-800 mt-2">
                {currentWork
                  ? teamNames(currentWork).join(" + ") || "Needs Assignment"
                  : "-"}
              </p>
            </div>
          </div>
        </section>

        {(order.customer_note || order.admin_note) && (
          <section className="yf-card p-5 mt-4">
            <p className="text-xs font-black tracking-[0.12em] text-amber-700">
              ORDER NOTES
            </p>
            <div className="grid md:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-black text-blue-700">CUSTOMER NOTE</p>
                <p className="text-sm font-semibold text-slate-800 mt-2 whitespace-pre-wrap">
                  {order.customer_note || "No Customer Note"}
                </p>
              </div>
              <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
                <p className="text-xs font-black text-purple-700">ADMIN NOTE</p>
                <p className="text-sm font-semibold text-slate-800 mt-2 whitespace-pre-wrap">
                  {order.admin_note || "No Admin Note"}
                </p>
              </div>
            </div>
          </section>
        )}

        {order.product_configuration &&
          Object.keys(order.product_configuration).length > 0 && (
            <section className="yf-card p-5 mt-4">
              <p className="text-xs font-black tracking-[0.12em] text-blue-700">
                PRODUCT CONFIGURATION
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                {Object.entries(order.product_configuration).map(
                  ([key, value]) => (
                    <div
                      key={key}
                      className="rounded-xl border border-blue-100 bg-blue-50 p-3"
                    >
                      <p className="text-xs font-black text-blue-500">
                        {key.toUpperCase()}
                      </p>
                      <p className="font-black text-blue-900 mt-1">{value}</p>
                    </div>
                  )
                )}
              </div>
            </section>
          )}

        <section className="yf-card mt-4 overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <p className="text-xs font-black tracking-[0.12em] text-cyan-700">
              WORKFLOW
            </p>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Stage Timeline
            </h2>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {stageWorks.map((work, index) => (
              <div
                key={work.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-400">
                      STAGE {index + 1}
                    </p>
                    <h3 className="text-lg font-black text-slate-900 mt-1">
                      {stageMap.get(work.stage_id)?.name || "Workflow Stage"}
                    </h3>
                    <p className="text-sm font-semibold text-slate-500 mt-1">
                      Team: {teamNames(work).join(" + ") || "-"}
                    </p>
                  </div>
                  <span className={`yf-badge ${statusClass(work.status)}`}>
                    {pretty(work.status)}
                  </span>
                </div>

                <div className="grid sm:grid-cols-3 gap-3 mt-4">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-400">CREATED</p>
                    <p className="text-sm font-bold mt-1">
                      {formatDateTime(work.created_at)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-400">STARTED</p>
                    <p className="text-sm font-bold mt-1">
                      {formatDateTime(work.started_at)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-400">COMPLETED</p>
                    <p className="text-sm font-bold mt-1">
                      {formatDateTime(work.completed_at)}
                    </p>
                  </div>
                </div>

                {work.hold_reason && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-black text-amber-700">HOLD REASON</p>
                    <p className="text-sm font-semibold text-amber-900 mt-1">
                      {work.hold_reason}
                    </p>
                  </div>
                )}

                {work.rework_reason && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-black text-red-700">REWORK REASON</p>
                    <p className="text-sm font-semibold text-red-900 mt-1">
                      {work.rework_reason}
                    </p>
                  </div>
                )}
              </div>
            ))}

            {stageWorks.length === 0 && (
              <div className="py-10 text-center text-slate-500 font-semibold">
                Workflow Stage data મળ્યો નથી.
              </div>
            )}
          </div>
        </section>

        <div className="py-5">
          <button
            type="button"
            onClick={() => router.push("/dashboard/orders")}
            className="yf-btn yf-btn-secondary w-full sm:w-auto"
          >
            ← Back to My Orders
          </button>
        </div>
      </div>
    </main>
  );
}
