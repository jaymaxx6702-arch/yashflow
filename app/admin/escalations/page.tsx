"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  due_date: string | null;
  current_stage: string;
  workflow_status: string;
};

type StageWork = {
  id: string;
  order_id: string;
  status: string;
  primary_employee_id: string | null;
  created_at: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  assigned_to: string;
  priority: string;
  status: string;
  due_date: string | null;
};

type InventoryRow = {
  id: string;
  item_code: string;
  item_name: string;
  current_stock: number;
  minimum_stock: number;
  unit: string;
};

const ACTIVE_STAGE_STATUSES = [
  "waiting",
  "assigned",
  "in_progress",
  "ready_for_approval",
  "hold",
  "rework",
];

function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nice(value: string | null | undefined) {
  return (value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminEscalationsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<Set<string>>(new Set());

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);

  const employeeMap = useMemo(
    () => new Map(employees.map((row) => [row.id, row.full_name])),
    [employees]
  );

  const latestWorkByOrder = useMemo(() => {
    const map = new Map<string, StageWork>();
    for (const row of stageWorks) {
      if (!map.has(row.order_id)) map.set(row.order_id, row);
    }
    return map;
  }, [stageWorks]);

  const today = indiaToday();

  const overdueOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          Boolean(order.due_date) &&
          String(order.due_date) < today &&
          order.current_stage !== "completed" &&
          order.workflow_status !== "completed"
      ),
    [orders, today]
  );

  const overdueTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          Boolean(task.due_date) &&
          String(task.due_date) < today &&
          (task.status === "pending" || task.status === "in_progress")
      ),
    [tasks, today]
  );

  const stalledWorks = useMemo(
    () => stageWorks.filter((row) => row.status === "hold" || row.status === "rework"),
    [stageWorks]
  );

  const submittedWorks = useMemo(
    () => stageWorks.filter((row) => row.status === "ready_for_approval"),
    [stageWorks]
  );

  const lowStock = useMemo(
    () => inventory.filter((row) => Number(row.current_stock) <= Number(row.minimum_stock)),
    [inventory]
  );

  const orderMap = useMemo(
    () => new Map(orders.map((row) => [row.id, row])),
    [orders]
  );

  async function loadData() {
    const supabase = createClient();

    const [employeeResult, orderResult, workResult, taskResult, inventoryResult] =
      await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .eq("is_hidden", false)
          .order("full_name"),
        supabase
          .from("orders")
          .select("id, order_number, customer_name, product_name, due_date, current_stage, workflow_status")
          .order("created_at", { ascending: false }),
        supabase
          .from("order_stage_work")
          .select("id, order_id, status, primary_employee_id, created_at")
          .in("status", ACTIVE_STAGE_STATUSES)
          .order("created_at", { ascending: false }),
        supabase
          .from("tasks")
          .select("id, title, assigned_to, priority, status, due_date")
          .in("status", ["pending", "in_progress"])
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("inventory_items")
          .select("id, item_code, item_name, current_stock, minimum_stock, unit")
          .eq("is_active", true)
          .order("item_name"),
      ]);

    const firstError =
      employeeResult.error ||
      orderResult.error ||
      workResult.error ||
      taskResult.error ||
      inventoryResult.error;

    if (firstError) {
      setMessage(`Escalation Load Error: ${firstError.message}`);
      return;
    }

    setEmployees((employeeResult.data || []) as Employee[]);
    setOrders((orderResult.data || []) as OrderRow[]);
    setStageWorks((workResult.data || []) as StageWork[]);
    setTasks((taskResult.data || []) as TaskRow[]);
    setInventory((inventoryResult.data || []) as InventoryRow[]);
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

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.role !== "admin" ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      await loadData();
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  async function sendReminder(args: {
    key: string;
    employeeId: string | null;
    title: string;
    body: string;
    relatedType: "order" | "task";
    relatedId: string;
  }) {
    if (!args.employeeId) {
      setMessage("Assigned Employee મળ્યો નથી.");
      return;
    }

    setActionKey(args.key);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.from("notifications").insert({
      employee_id: args.employeeId,
      notification_type: "escalation",
      title: args.title,
      message: args.body,
      related_type: args.relatedType,
      related_id: args.relatedId,
    });

    if (error) {
      setMessage(`Reminder Error: ${error.message}`);
      setActionKey(null);
      return;
    }

    setSentKeys((current) => new Set([...current, args.key]));
    setMessage("Reminder sent ✅");
    setActionKey(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Escalation Center લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW ALERTS</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Escalation Center</h1>
            <p className="text-sm text-blue-100 mt-1">Overdue work, stalled workflow અને low stock એક જગ્યાએ.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">OVERDUE ORDERS</p><p className="text-3xl font-black text-red-700 mt-1">{overdueOrders.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">OVERDUE TASKS</p><p className="text-3xl font-black text-orange-700 mt-1">{overdueTasks.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">HOLD / REWORK</p><p className="text-3xl font-black text-purple-700 mt-1">{stalledWorks.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">SUBMITTED STAGES</p><p className="text-3xl font-black text-blue-700 mt-1">{submittedWorks.length}</p></div>
          <button type="button" onClick={() => router.push("/admin/reorder")} className="yf-card p-4 text-left hover:shadow-md transition"><p className="text-xs font-black text-slate-500">LOW STOCK</p><p className="text-3xl font-black text-amber-700 mt-1">{lowStock.length}</p><p className="text-xs font-bold text-blue-700 mt-2">Open Reorder Center ›</p></button>
        </section>

        <section className="yf-card overflow-hidden mb-5">
          <div className="p-5 border-b border-slate-200 bg-red-50">
            <h2 className="yf-section-title">🚨 Overdue Orders</h2>
            <p className="yf-section-subtitle mt-1">Due date પસાર થયેલા active orders.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {overdueOrders.map((order) => {
              const work = latestWorkByOrder.get(order.id);
              const employeeId = work?.primary_employee_id || null;
              const employeeName = employeeId ? employeeMap.get(employeeId) || "Assigned Employee" : "Not Assigned";
              const key = `order-${order.id}`;
              return (
                <div key={order.id} className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-black text-blue-700">{order.order_number}</p>
                    <p className="font-bold text-slate-900 mt-1">{order.customer_name} • {order.product_name}</p>
                    <p className="text-xs text-slate-500 mt-1">Due: {order.due_date || "-"} • Stage: {nice(order.current_stage)} • 👤 {employeeName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => router.push("/admin/orders")} className="yf-btn yf-btn-secondary">Open</button>
                    <button
                      type="button"
                      disabled={!employeeId || actionKey === key || sentKeys.has(key)}
                      onClick={() => void sendReminder({
                        key,
                        employeeId,
                        title: "Overdue Order Reminder",
                        body: `${order.order_number} ની due date પસાર થઈ ગઈ છે. કૃપા કરીને current stage update/complete કરો.`,
                        relatedType: "order",
                        relatedId: order.id,
                      })}
                      className="yf-btn yf-btn-primary disabled:opacity-50"
                    >
                      {sentKeys.has(key) ? "Sent ✅" : actionKey === key ? "Sending..." : "Send Reminder"}
                    </button>
                  </div>
                </div>
              );
            })}
            {overdueOrders.length === 0 && <div className="p-8 text-center text-slate-400 font-bold">No overdue orders ✅</div>}
          </div>
        </section>

        <section className="yf-card overflow-hidden mb-5">
          <div className="p-5 border-b border-slate-200 bg-orange-50">
            <h2 className="yf-section-title">📋 Overdue Tasks</h2>
            <p className="yf-section-subtitle mt-1">Pending / In Progress tasks whose due date has passed.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {overdueTasks.map((task) => {
              const employeeName = employeeMap.get(task.assigned_to) || "Assigned Employee";
              const key = `task-${task.id}`;
              return (
                <div key={task.id} className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-black text-slate-900">{task.title}</p>
                    <p className="text-xs text-slate-500 mt-1">Due: {task.due_date || "-"} • {nice(task.priority)} • {nice(task.status)} • 👤 {employeeName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => router.push("/admin/tasks")} className="yf-btn yf-btn-secondary">Open</button>
                    <button
                      type="button"
                      disabled={!employeeMap.has(task.assigned_to) || actionKey === key || sentKeys.has(key)}
                      onClick={() => void sendReminder({
                        key,
                        employeeId: employeeMap.has(task.assigned_to) ? task.assigned_to : null,
                        title: "Overdue Task Reminder",
                        body: `${task.title} ની due date પસાર થઈ ગઈ છે. કૃપા કરીને task status update/complete કરો.`,
                        relatedType: "task",
                        relatedId: task.id,
                      })}
                      className="yf-btn yf-btn-primary disabled:opacity-50"
                    >
                      {sentKeys.has(key) ? "Sent ✅" : actionKey === key ? "Sending..." : "Send Reminder"}
                    </button>
                  </div>
                </div>
              );
            })}
            {overdueTasks.length === 0 && <div className="p-8 text-center text-slate-400 font-bold">No overdue tasks ✅</div>}
          </div>
        </section>

        <section className="yf-card overflow-hidden mb-5">
          <div className="p-5 border-b border-slate-200 bg-purple-50">
            <h2 className="yf-section-title">⏸ Hold / Rework</h2>
            <p className="yf-section-subtitle mt-1">Active workflow stages needing follow-up.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {stalledWorks.map((work) => {
              const order = orderMap.get(work.order_id);
              if (!order) return null;
              const employeeId = work.primary_employee_id;
              const employeeName = employeeId ? employeeMap.get(employeeId) || "Assigned Employee" : "Not Assigned";
              const key = `work-${work.id}`;
              return (
                <div key={work.id} className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-black text-blue-700">{order.order_number}</p>
                    <p className="font-bold text-slate-900 mt-1">{nice(work.status)} • {order.product_name}</p>
                    <p className="text-xs text-slate-500 mt-1">Stage: {nice(order.current_stage)} • 👤 {employeeName}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => router.push("/admin/orders")} className="yf-btn yf-btn-secondary">Open</button>
                    <button
                      type="button"
                      disabled={!employeeId || actionKey === key || sentKeys.has(key)}
                      onClick={() => void sendReminder({
                        key,
                        employeeId,
                        title: "Workflow Follow-up",
                        body: `${order.order_number} હાલમાં ${nice(work.status)} પર છે. કૃપા કરીને update કરો અથવા Admin સાથે coordinate કરો.`,
                        relatedType: "order",
                        relatedId: order.id,
                      })}
                      className="yf-btn yf-btn-primary disabled:opacity-50"
                    >
                      {sentKeys.has(key) ? "Sent ✅" : actionKey === key ? "Sending..." : "Send Reminder"}
                    </button>
                  </div>
                </div>
              );
            })}
            {stalledWorks.length === 0 && <div className="p-8 text-center text-slate-400 font-bold">No Hold / Rework items ✅</div>}
          </div>
        </section>

        <section className="yf-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 bg-blue-50">
            <h2 className="yf-section-title">📨 Submitted Stages</h2>
            <p className="yf-section-subtitle mt-1">Backend stage status currently submitted / waiting for next Admin action.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {submittedWorks.map((work) => {
              const order = orderMap.get(work.order_id);
              if (!order) return null;
              return (
                <div key={work.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-blue-700">{order.order_number}</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">{order.customer_name} • {order.product_name}</p>
                  </div>
                  <button type="button" onClick={() => router.push("/admin/orders")} className="yf-btn yf-btn-primary">Open Orders</button>
                </div>
              );
            })}
            {submittedWorks.length === 0 && <div className="p-8 text-center text-slate-400 font-bold">No submitted stages ✅</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
