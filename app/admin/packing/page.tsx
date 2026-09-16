"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  priority: string;
  due_date: string | null;
  current_stage: string;
  workflow_status: string;
};

type StageWork = {
  id: string;
  order_id: string;
  status: string;
  primary_employee_id: string | null;
  started_at: string | null;
  created_at: string | null;
};

type Employee = {
  id: string;
  full_name: string;
};

const ACTIVE = ["waiting", "assigned", "in_progress", "ready_for_approval", "hold", "rework"];

function nice(value: string | null | undefined) {
  return (value || "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminPackingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees]
  );

  const workByOrder = useMemo(() => {
    const map = new Map<string, StageWork>();
    for (const work of stageWorks) {
      if (!map.has(work.order_id)) map.set(work.order_id, work);
    }
    return map;
  }, [stageWorks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) =>
      [order.order_number, order.customer_name, order.customer_mobile || "", order.product_name]
        .some((value) => value.toLowerCase().includes(q))
    );
  }, [orders, search]);

  const inProgressCount = orders.filter(
    (order) => workByOrder.get(order.id)?.status === "in_progress"
  ).length;
  const holdCount = orders.filter(
    (order) => workByOrder.get(order.id)?.status === "hold"
  ).length;

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
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

      const [ordersResult, employeesResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, customer_name, customer_mobile, product_name, quantity, priority, due_date, current_stage, workflow_status")
          .ilike("current_stage", "%packing%")
          .order("due_date", { ascending: true, nullsFirst: false }),
        supabase
          .from("employees")
          .select("id, full_name")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .eq("is_hidden", false)
          .order("full_name"),
      ]);

      const firstError = ordersResult.error || employeesResult.error;
      if (firstError) {
        setMessage(`Packing Load Error: ${firstError.message}`);
        setLoading(false);
        return;
      }

      const orderRows = (ordersResult.data || []) as Order[];
      setOrders(orderRows);
      setEmployees((employeesResult.data || []) as Employee[]);

      if (orderRows.length) {
        const workResult = await supabase
          .from("order_stage_work")
          .select("id, order_id, status, primary_employee_id, started_at, created_at")
          .in("order_id", orderRows.map((order) => order.id))
          .in("status", ACTIVE)
          .order("created_at", { ascending: false });

        if (workResult.error) {
          setMessage(`Packing Work Load Error: ${workResult.error.message}`);
        } else {
          setStageWorks((workResult.data || []) as StageWork[]);
        }
      }

      setLoading(false);
    }

    void load();
  }, [router]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Packing Queue લોડ થઈ રહી છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW PACKING</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Packing Queue</h1>
            <p className="text-sm text-blue-100 mt-1">Packing stageના બધા active orders એક જગ્યાએ.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push("/dashboard/dispatch")} className="yf-btn bg-white/10 text-white border border-white/20">🚚 Dispatch</button>
            <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">← Admin</button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="grid grid-cols-3 gap-3 mb-5">
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">PACKING QUEUE</p><p className="text-3xl font-black text-blue-700 mt-1">{orders.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">IN PROGRESS</p><p className="text-3xl font-black text-green-700 mt-1">{inProgressCount}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">ON HOLD</p><p className="text-3xl font-black text-orange-700 mt-1">{holdCount}</p></div>
        </section>

        <section className="yf-card p-4 mb-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Order / Customer / Product / Mobile..."
            className="yf-input"
          />
        </section>

        <section className="grid gap-4">
          {filtered.map((order) => {
            const work = workByOrder.get(order.id);
            const employeeName = work?.primary_employee_id
              ? employeeMap.get(work.primary_employee_id) || "Assigned Employee"
              : "Not Assigned";

            return (
              <article key={order.id} className="yf-card p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-blue-700 text-lg">{order.order_number}</span>
                      <span className="yf-badge bg-blue-100 text-blue-700">{nice(work?.status || order.workflow_status)}</span>
                      <span className="yf-badge bg-slate-100 text-slate-700">{nice(order.priority)}</span>
                    </div>
                    <h2 className="font-black text-slate-900 mt-2">{order.customer_name}</h2>
                    <p className="text-sm text-slate-600 mt-1">{order.product_name} • Qty {order.quantity}</p>
                    <div className="grid sm:grid-cols-3 gap-2 mt-3 text-xs font-semibold text-slate-500">
                      <span>👤 {employeeName}</span>
                      <span>📞 {order.customer_mobile || "-"}</span>
                      <span>📅 Due: {order.due_date || "-"}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => router.push(`/admin/orders/${order.id}`)} className="yf-btn yf-btn-primary">Open Order</button>
                  </div>
                </div>
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="yf-card p-10 text-center">
              <div className="text-4xl">📦</div>
              <p className="font-black text-slate-700 mt-3">Packing queue empty</p>
              <p className="text-sm text-slate-500 mt-1">હાલ Packing stageમાં કોઈ order નથી.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
