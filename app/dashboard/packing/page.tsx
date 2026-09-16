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
  completed_at: string | null;
};

type DispatchRecord = {
  order_id: string;
  status: "ready" | "packed" | "dispatched" | "delivered" | "returned" | "cancelled";
  package_count: number;
  dispatch_method: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  vehicle_number: string | null;
  dispatch_date: string | null;
  delivery_date: string | null;
  note: string | null;
};

export default function PackingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [packageCounts, setPackageCounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const recordMap = useMemo(
    () => new Map(records.map((row) => [row.order_id, row])),
    [records]
  );

  async function loadData() {
    const supabase = createClient();

    const [ordersResult, recordsResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_mobile, product_name, quantity, completed_at")
        .eq("current_stage", "completed")
        .order("completed_at", { ascending: false }),
      supabase
        .from("order_dispatch_records")
        .select("order_id, status, package_count, dispatch_method, courier_name, tracking_number, vehicle_number, dispatch_date, delivery_date, note"),
    ]);

    const error = ordersResult.error || recordsResult.error;
    if (error) {
      setMessage(`Packing Load Error: ${error.message}`);
      return;
    }

    const orderRows = (ordersResult.data || []) as Order[];
    const recordRows = (recordsResult.data || []) as DispatchRecord[];

    setOrders(orderRows);
    setRecords(recordRows);

    const nextCounts: Record<string, string> = {};
    const nextNotes: Record<string, string> = {};
    const map = new Map(recordRows.map((row) => [row.order_id, row]));

    for (const order of orderRows) {
      const record = map.get(order.id);
      nextCounts[order.id] = String(record?.package_count || 1);
      nextNotes[order.id] = record?.note || "";
    }

    setPackageCounts(nextCounts);
    setNotes(nextNotes);
  }

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const [viewResult, manageResult] = await Promise.all([
        supabase.rpc("has_app_permission", { p_permission_key: "dispatch.view" }),
        supabase.rpc("has_app_permission", { p_permission_key: "dispatch.manage" }),
      ]);

      const error = viewResult.error || manageResult.error;
      if (error) {
        setMessage(`Permission Error: ${error.message}`);
        setLoading(false);
        return;
      }

      const manageAllowed = Boolean(manageResult.data);
      if (!Boolean(viewResult.data) && !manageAllowed) {
        router.replace("/dashboard");
        return;
      }

      setCanManage(manageAllowed);
      await loadData();
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  const packingOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      const status = recordMap.get(order.id)?.status || "ready";
      if (status !== "ready" && status !== "packed") return false;

      if (!q) return true;
      return (
        order.order_number.toLowerCase().includes(q) ||
        order.customer_name.toLowerCase().includes(q) ||
        order.product_name.toLowerCase().includes(q) ||
        (order.customer_mobile || "").toLowerCase().includes(q)
      );
    });
  }, [orders, recordMap, search]);

  const readyCount = orders.filter(
    (order) => (recordMap.get(order.id)?.status || "ready") === "ready"
  ).length;

  const packedCount = orders.filter(
    (order) => recordMap.get(order.id)?.status === "packed"
  ).length;

  async function savePacking(order: Order, nextStatus: "ready" | "packed") {
    if (!canManage) return;

    const count = Number(packageCounts[order.id] || "1");
    if (!Number.isInteger(count) || count <= 0) {
      setMessage("Package Count સાચો નાખો.");
      return;
    }

    setSavingId(order.id);
    setMessage("");

    const current = recordMap.get(order.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("save_order_dispatch", {
      p_order_id: order.id,
      p_status: nextStatus,
      p_dispatch_method: current?.dispatch_method || null,
      p_package_count: count,
      p_courier_name: current?.courier_name || null,
      p_tracking_number: current?.tracking_number || null,
      p_vehicle_number: current?.vehicle_number || null,
      p_dispatch_date: current?.dispatch_date || null,
      p_delivery_date: current?.delivery_date || null,
      p_note: notes[order.id]?.trim() || null,
    });

    if (error) {
      setMessage(`Packing Save Error: ${error.message}`);
      setSavingId(null);
      return;
    }

    setMessage(nextStatus === "packed" ? "Order Packed ✅" : "Packing reset to Ready ✅");
    await loadData();
    setSavingId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Packing Workflow લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW PACKING</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Packing Workflow</h1>
            <p className="text-sm text-blue-100 mt-1">Completed → Ready for Packing → Packed → Dispatch</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-900">{message}</div>}

        <section className="grid grid-cols-2 gap-3 mb-5">
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">READY TO PACK</p>
            <p className="text-3xl font-black text-amber-700 mt-1">{readyCount}</p>
          </div>
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">PACKED</p>
            <p className="text-3xl font-black text-purple-700 mt-1">{packedCount}</p>
          </div>
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
          {packingOrders.map((order) => {
            const status = recordMap.get(order.id)?.status || "ready";
            const packed = status === "packed";

            return (
              <article key={order.id} className="yf-card p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-blue-700">{order.order_number}</span>
                      <span className={`yf-badge ${packed ? "bg-purple-100 text-purple-700" : "bg-amber-100 text-amber-800"}`}>
                        {packed ? "Packed" : "Ready"}
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mt-2">{order.customer_name}</h2>
                    <p className="text-sm text-slate-600 mt-1">{order.product_name} • Qty {order.quantity}</p>
                    {order.customer_mobile && <p className="text-xs text-slate-400 mt-1">{order.customer_mobile}</p>}
                  </div>

                  <div className="grid sm:grid-cols-2 lg:grid-cols-[140px_260px_auto] gap-3 w-full lg:w-auto">
                    <input
                      type="number"
                      min="1"
                      value={packageCounts[order.id] || "1"}
                      onChange={(event) => setPackageCounts((old) => ({ ...old, [order.id]: event.target.value }))}
                      disabled={!canManage}
                      className="yf-input"
                      placeholder="Packages"
                    />
                    <input
                      value={notes[order.id] || ""}
                      onChange={(event) => setNotes((old) => ({ ...old, [order.id]: event.target.value }))}
                      disabled={!canManage}
                      className="yf-input"
                      placeholder="Packing Note"
                    />
                    {canManage && (
                      <button
                        type="button"
                        disabled={savingId === order.id}
                        onClick={() => void savePacking(order, packed ? "ready" : "packed")}
                        className={`yf-btn ${packed ? "yf-btn-secondary" : "yf-btn-primary"} disabled:opacity-50`}
                      >
                        {savingId === order.id ? "Saving..." : packed ? "Undo Packed" : "Mark Packed"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {packingOrders.length === 0 && (
            <div className="yf-card p-10 text-center text-slate-400">Packing queue ખાલી છે ✅</div>
          )}
        </section>
      </div>
    </main>
  );
}
