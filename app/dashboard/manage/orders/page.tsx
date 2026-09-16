"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Priority = "low" | "normal" | "high" | "urgent";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  priority: Priority;
  current_stage: string;
  workflow_status: string;
  due_date: string | null;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
};

type EditForm = {
  customer_name: string;
  customer_mobile: string;
  quantity: string;
  priority: Priority;
  due_date: string;
  customer_note: string;
  admin_note: string;
};

export default function PermissionOrderEditorPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editorEmployeeId, setEditorEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>({
    customer_name: "",
    customer_mobile: "",
    quantity: "1",
    priority: "normal",
    due_date: "",
    customer_note: "",
    admin_note: "",
  });

  async function ensureAccess() {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/");
      return false;
    }

    const { data: profile, error: profileError } = await supabase
      .from("employees")
      .select("id, role, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.approval_status !== "approved" ||
      !profile.is_active
    ) {
      router.replace("/dashboard");
      return false;
    }

    setEditorEmployeeId(profile.id);

    if (profile.role === "admin") return true;

    const { data, error } = await supabase.rpc("has_app_permission", {
      p_permission_key: "orders.manage",
    });

    if (error || !data) {
      setMessage(
        error
          ? `Permission Check Error: ${error.message}`
          : "Order Edit permission નથી."
      );
      router.replace("/dashboard/manage");
      return false;
    }

    return true;
  }

  async function loadOrders() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_mobile,
        product_name,
        quantity,
        priority,
        current_stage,
        workflow_status,
        due_date,
        customer_note,
        admin_note,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Order Load Error: ${error.message}`);
      return;
    }

    setOrders((data || []) as Order[]);
  }

  useEffect(() => {
    async function init() {
      const allowed = await ensureAccess();
      if (!allowed) {
        setLoading(false);
        return;
      }

      await loadOrders();
      setLoading(false);
    }

    void init();
  }, []);

  const filteredOrders = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) return orders;

    return orders.filter(
      (order) =>
        order.order_number.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.product_name.toLowerCase().includes(query) ||
        (order.customer_mobile || "").toLowerCase().includes(query)
    );
  }, [orders, searchText]);

  function openEdit(order: Order) {
    setSelectedOrder(order);
    setForm({
      customer_name: order.customer_name,
      customer_mobile: order.customer_mobile || "",
      quantity: String(order.quantity),
      priority: order.priority,
      due_date: order.due_date || "",
      customer_note: order.customer_note || "",
      admin_note: order.admin_note || "",
    });
    setMessage("");
  }

  async function saveOrder() {
    if (!selectedOrder || !editorEmployeeId) return;

    const quantity = Number(form.quantity);

    if (!form.customer_name.trim()) {
      setMessage("Customer Name જરૂરી છે.");
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("Quantity સાચી નાખો.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("orders")
      .update({
        customer_name: form.customer_name.trim(),
        customer_mobile: form.customer_mobile.trim() || null,
        quantity,
        priority: form.priority,
        due_date: form.due_date || null,
        customer_note: form.customer_note.trim() || null,
        admin_note: form.admin_note.trim() || null,
        updated_at: now,
      })
      .eq("id", selectedOrder.id);

    if (error) {
      setMessage(`Order Edit Error: ${error.message}`);
      setSaving(false);
      return;
    }

    const historyResult = await supabase.from("order_workflow_history").insert({
      order_id: selectedOrder.id,
      action_type: "order_details_updated",
      employee_id: editorEmployeeId,
      note: "Permission user edited order details",
    });

    if (historyResult.error) {
      console.warn(
        "Order edit history save skipped:",
        historyResult.error.message
      );
    }

    setMessage(`${selectedOrder.order_number} Updated ✅`);
    setSelectedOrder(null);
    await loadOrders();
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Orders લોડ થઈ રહ્યા છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-blue-100">
              ORDER MANAGEMENT
            </p>
            <h1 className="text-2xl font-black text-white mt-1">
              Order Edit Access
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard/manage")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← Management
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-4">{message}</div>
        )}

        <section className="yf-card p-4 mb-4">
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search Order / Customer / Product / Mobile..."
            className="yf-input"
          />
        </section>

        <section className="space-y-3">
          {filteredOrders.map((order) => (
            <article key={order.id} className="yf-card p-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-blue-700">
                      {order.order_number}
                    </span>
                    <span className="yf-badge bg-slate-100 text-slate-700">
                      {order.priority.toUpperCase()}
                    </span>
                    <span className="yf-badge bg-blue-100 text-blue-700">
                      {order.workflow_status.replace(/_/g, " ")}
                    </span>
                  </div>

                  <h2 className="font-black text-slate-900 mt-2">
                    {order.product_name}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    {order.customer_name} • Qty {order.quantity} • Stage {order.current_stage}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Due: {order.due_date || "-"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => openEdit(order)}
                  className="yf-btn yf-btn-primary"
                >
                  ✏ Edit Order
                </button>
              </div>
            </article>
          ))}

          {filteredOrders.length === 0 && (
            <div className="yf-card p-8 text-center text-slate-500 font-semibold">
              કોઈ Order મળ્યો નથી.
            </div>
          )}
        </section>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-[90] bg-black/40 p-4 flex items-center justify-center">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black text-blue-700">EDIT ORDER</p>
                <h2 className="text-xl font-black mt-1">
                  {selectedOrder.order_number}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-10 h-10 rounded-xl bg-slate-100 font-black"
              >
                ✕
              </button>
            </div>

            <div className="p-5 grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-black text-slate-700">
                  Customer Name
                </label>
                <input
                  className="yf-input mt-2"
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      customer_name: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Customer Mobile
                </label>
                <input
                  className="yf-input mt-2"
                  value={form.customer_mobile}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      customer_mobile: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  className="yf-input mt-2"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      quantity: e.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-sm font-black text-slate-700">
                  Priority
                </label>
                <select
                  className="yf-input mt-2"
                  value={form.priority}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      priority: e.target.value as Priority,
                    }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-black text-slate-700">
                  Due Date
                </label>
                <input
                  type="date"
                  className="yf-input mt-2"
                  value={form.due_date}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      due_date: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-black text-slate-700">
                  Customer Note
                </label>
                <textarea
                  rows={3}
                  className="yf-input mt-2"
                  value={form.customer_note}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      customer_note: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-black text-slate-700">
                  Admin Note
                </label>
                <textarea
                  rows={3}
                  className="yf-input mt-2"
                  value={form.admin_note}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      admin_note: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2 flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="yf-btn yf-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveOrder()}
                  className="yf-btn yf-btn-primary disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
