"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type DispatchStatus =
  | "ready"
  | "packed"
  | "dispatched"
  | "delivered"
  | "returned"
  | "cancelled";

type DispatchMethod =
  | "courier"
  | "local_delivery"
  | "customer_pickup"
  | "transport"
  | "other";

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
  id: string;
  order_id: string;
  status: DispatchStatus;
  dispatch_method: DispatchMethod | null;
  package_count: number;
  courier_name: string | null;
  tracking_number: string | null;
  vehicle_number: string | null;
  dispatch_date: string | null;
  delivery_date: string | null;
  note: string | null;
  updated_at: string;
};

type DispatchForm = {
  status: DispatchStatus;
  dispatch_method: "" | DispatchMethod;
  package_count: string;
  courier_name: string;
  tracking_number: string;
  vehicle_number: string;
  dispatch_date: string;
  delivery_date: string;
  note: string;
};

export default function DispatchManagementPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [canManage, setCanManage] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [records, setRecords] = useState<DispatchRecord[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<DispatchForm>({
    status: "ready",
    dispatch_method: "",
    package_count: "1",
    courier_name: "",
    tracking_number: "",
    vehicle_number: "",
    dispatch_date: "",
    delivery_date: "",
    note: "",
  });

  const recordMap = useMemo(
    () => new Map(records.map((record) => [record.order_id, record])),
    [records]
  );

  async function loadData() {
    const supabase = createClient();

    const [orderResult, recordResult] = await Promise.all([
      supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          customer_mobile,
          product_name,
          quantity,
          completed_at
        `)
        .eq("current_stage", "completed")
        .order("completed_at", { ascending: false }),

      supabase
        .from("order_dispatch_records")
        .select(`
          id,
          order_id,
          status,
          dispatch_method,
          package_count,
          courier_name,
          tracking_number,
          vehicle_number,
          dispatch_date,
          delivery_date,
          note,
          updated_at
        `)
        .order("updated_at", { ascending: false }),
    ]);

    const firstError = orderResult.error || recordResult.error;

    if (firstError) {
      setMessage(`Dispatch Load Error: ${firstError.message}`);
      return;
    }

    setOrders((orderResult.data || []) as Order[]);
    setRecords((recordResult.data || []) as DispatchRecord[]);
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

      const [viewResult, manageResult] = await Promise.all([
        supabase.rpc("has_app_permission", {
          p_permission_key: "dispatch.view",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key: "dispatch.manage",
        }),
      ]);

      const firstError = viewResult.error || manageResult.error;

      if (firstError) {
        setMessage(`Permission Error: ${firstError.message}`);
        setLoading(false);
        return;
      }

      const manageAllowed = Boolean(manageResult.data);
      const viewAllowed = Boolean(viewResult.data) || manageAllowed;

      if (!viewAllowed) {
        router.replace("/dashboard");
        return;
      }

      setCanManage(manageAllowed);

      await loadData();
      setLoading(false);
    }

    loadPage();
  }, [router]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      const record = recordMap.get(order.id);
      const status = record?.status || "ready";

      const searchMatch =
        !q ||
        order.order_number.toLowerCase().includes(q) ||
        order.customer_name.toLowerCase().includes(q) ||
        order.product_name.toLowerCase().includes(q) ||
        (order.customer_mobile || "").toLowerCase().includes(q);

      const statusMatch =
        statusFilter === "all" || status === statusFilter;

      return searchMatch && statusMatch;
    });
  }, [orders, recordMap, search, statusFilter]);

  const readyCount = orders.filter(
    (order) => (recordMap.get(order.id)?.status || "ready") === "ready"
  ).length;

  const packedCount = orders.filter(
    (order) => recordMap.get(order.id)?.status === "packed"
  ).length;

  const dispatchedCount = orders.filter(
    (order) => recordMap.get(order.id)?.status === "dispatched"
  ).length;

  const deliveredCount = orders.filter(
    (order) => recordMap.get(order.id)?.status === "delivered"
  ).length;

  function statusClass(status: DispatchStatus) {
    if (status === "delivered") return "bg-green-100 text-green-700";
    if (status === "dispatched") return "bg-blue-100 text-blue-700";
    if (status === "packed") return "bg-purple-100 text-purple-700";
    if (status === "returned") return "bg-red-100 text-red-700";
    if (status === "cancelled") return "bg-slate-100 text-slate-600";
    return "bg-amber-100 text-amber-800";
  }

  function statusLabel(status: DispatchStatus) {
    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function openOrder(order: Order) {
    const record = recordMap.get(order.id);

    setSelectedOrder(order);

    setForm({
      status: record?.status || "ready",
      dispatch_method: record?.dispatch_method || "",
      package_count: String(record?.package_count || 1),
      courier_name: record?.courier_name || "",
      tracking_number: record?.tracking_number || "",
      vehicle_number: record?.vehicle_number || "",
      dispatch_date: record?.dispatch_date || "",
      delivery_date: record?.delivery_date || "",
      note: record?.note || "",
    });
  }

  async function saveDispatch() {
    if (!selectedOrder || !canManage) return;

    const packageCount = Number(form.package_count);

    if (!Number.isInteger(packageCount) || packageCount <= 0) {
      setMessage("Package Count સાચો નાખો.");
      return;
    }

    if (
      ["dispatched", "delivered"].includes(form.status) &&
      !form.dispatch_method
    ) {
      setMessage("Dispatch Method select કરો.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc("save_order_dispatch", {
      p_order_id: selectedOrder.id,
      p_status: form.status,
      p_dispatch_method: form.dispatch_method || null,
      p_package_count: packageCount,
      p_courier_name: form.courier_name.trim() || null,
      p_tracking_number: form.tracking_number.trim() || null,
      p_vehicle_number: form.vehicle_number.trim() || null,
      p_dispatch_date: form.dispatch_date || null,
      p_delivery_date: form.delivery_date || null,
      p_note: form.note.trim() || null,
    });

    if (error) {
      setMessage(`Dispatch Save Error: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage("Dispatch Details Saved ✅");
    await loadData();
    setSelectedOrder(null);
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">
          Dispatch Management લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              YASHFLOW DISPATCH
            </p>

            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Dispatch Management
            </h1>

            <p className="text-sm text-blue-100 mt-1">
              {canManage ? "Manage Access" : "View Only"} • Ready → Packed → Dispatched → Delivered
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="yf-btn bg-white text-blue-700"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">READY</p>
            <p className="text-3xl font-black text-amber-700 mt-1">
              {readyCount}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">PACKED</p>
            <p className="text-3xl font-black text-purple-700 mt-1">
              {packedCount}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">DISPATCHED</p>
            <p className="text-3xl font-black text-blue-700 mt-1">
              {dispatchedCount}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">DELIVERED</p>
            <p className="text-3xl font-black text-green-700 mt-1">
              {deliveredCount}
            </p>
          </div>
        </section>

        <section className="yf-card p-4 sm:p-5 mb-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Order / Customer / Product / Mobile..."
              className="yf-input"
            />

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="yf-input"
            >
              <option value="all">All Status</option>
              <option value="ready">Ready</option>
              <option value="packed">Packed</option>
              <option value="dispatched">Dispatched</option>
              <option value="delivered">Delivered</option>
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </section>

        <section className="yf-card overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="yf-section-title">
              Completed Orders — Dispatch Queue
            </h2>
            <p className="yf-section-subtitle mt-1">
              {filteredOrders.length} order(s)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="bg-slate-50">
                <tr className="text-xs font-black uppercase text-slate-500">
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Packages</th>
                  <th className="text-left px-4 py-3">Method</th>
                  <th className="text-left px-4 py-3">Tracking</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => {
                  const record = recordMap.get(order.id);
                  const status = record?.status || "ready";

                  return (
                    <tr key={order.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-black text-blue-700">
                          {order.order_number}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {order.completed_at
                            ? new Date(order.completed_at).toLocaleString("en-IN", {
                                timeZone: "Asia/Kolkata",
                              })
                            : ""}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-bold">{order.customer_name}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {order.customer_mobile || "-"}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-bold">{order.product_name}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Qty: {order.quantity}
                        </p>
                      </td>

                      <td className="px-4 py-3 font-black">
                        {record?.package_count || 1}
                      </td>

                      <td className="px-4 py-3 font-semibold capitalize">
                        {record?.dispatch_method?.replace(/_/g, " ") || "-"}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-semibold">
                          {record?.tracking_number || "-"}
                        </p>
                        {record?.courier_name && (
                          <p className="text-xs text-slate-400 mt-1">
                            {record.courier_name}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className={`yf-badge ${statusClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openOrder(order)}
                          className="yf-btn yf-btn-secondary"
                        >
                          {canManage ? "Update" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      Dispatch માટે કોઈ completed order નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black text-blue-700">
                  DISPATCH ORDER
                </p>
                <h2 className="text-2xl font-black mt-1">
                  {selectedOrder.order_number}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedOrder.customer_name} • {selectedOrder.product_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 font-black"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="yf-card p-4">
                <p className="text-xs font-black tracking-[0.12em] text-blue-700">
                  DISPATCH DETAILS
                </p>

                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  <select
                    value={form.status}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as DispatchStatus,
                      }))
                    }
                    className="yf-input disabled:bg-slate-100"
                  >
                    <option value="ready">Ready</option>
                    <option value="packed">Packed</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered</option>
                    <option value="returned">Returned</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

                  <select
                    value={form.dispatch_method}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dispatch_method: event.target.value as "" | DispatchMethod,
                      }))
                    }
                    className="yf-input disabled:bg-slate-100"
                  >
                    <option value="">Dispatch Method</option>
                    <option value="courier">Courier</option>
                    <option value="local_delivery">Local Delivery</option>
                    <option value="customer_pickup">Customer Pickup</option>
                    <option value="transport">Transport</option>
                    <option value="other">Other</option>
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={form.package_count}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        package_count: event.target.value,
                      }))
                    }
                    placeholder="Package Count"
                    className="yf-input disabled:bg-slate-100"
                  />

                  <input
                    value={form.courier_name}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        courier_name: event.target.value,
                      }))
                    }
                    placeholder="Courier / Transport Name"
                    className="yf-input disabled:bg-slate-100"
                  />

                  <input
                    value={form.tracking_number}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        tracking_number: event.target.value,
                      }))
                    }
                    placeholder="Tracking / LR Number"
                    className="yf-input disabled:bg-slate-100"
                  />

                  <input
                    value={form.vehicle_number}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        vehicle_number: event.target.value,
                      }))
                    }
                    placeholder="Vehicle Number"
                    className="yf-input disabled:bg-slate-100"
                  />

                  <input
                    type="date"
                    value={form.dispatch_date}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        dispatch_date: event.target.value,
                      }))
                    }
                    className="yf-input disabled:bg-slate-100"
                  />

                  <input
                    type="date"
                    value={form.delivery_date}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        delivery_date: event.target.value,
                      }))
                    }
                    className="yf-input disabled:bg-slate-100"
                  />

                  <textarea
                    rows={3}
                    value={form.note}
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        note: event.target.value,
                      }))
                    }
                    placeholder="Dispatch Note"
                    className="yf-input resize-none sm:col-span-2 disabled:bg-slate-100"
                  />

                  {canManage && (
                    <button
                      type="button"
                      onClick={saveDispatch}
                      disabled={saving}
                      className="yf-btn yf-btn-primary sm:col-span-2 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Dispatch"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
