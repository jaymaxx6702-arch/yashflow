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
  current_stage: string;
  workflow_status: string;
  due_date: string | null;
};

type OperationDetails = {
  id?: string;
  order_id: string;
  material: string | null;
  size_details: string | null;
  print_size: string | null;
  email_to_print_status: "pending" | "sent" | "not_required";
  print_taken_status: "pending" | "done" | "not_required";
  print_job_given_by: string | null;
  print_received_status: "pending" | "received" | "not_required";
  job_start_folder_details: string | null;
  production_note: string | null;
};

type FormState = {
  material: string;
  size_details: string;
  print_size: string;
  email_to_print_status: "pending" | "sent" | "not_required";
  print_taken_status: "pending" | "done" | "not_required";
  print_job_given_by: string;
  print_received_status: "pending" | "received" | "not_required";
  job_start_folder_details: string;
  production_note: string;
};

const EMPTY_FORM: FormState = {
  material: "",
  size_details: "",
  print_size: "",
  email_to_print_status: "pending",
  print_taken_status: "pending",
  print_job_given_by: "",
  print_received_status: "pending",
  job_start_folder_details: "",
  production_note: "",
};

export default function OrderOperationDetailsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [details, setDetails] = useState<OperationDetails[]>([]);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    function handleNativeBack(event: Event) {
      if (!selectedOrder) return;
      event.preventDefault();
      setSelectedOrder(null);
    }

    window.addEventListener(
      "yashflow:native-back",
      handleNativeBack as EventListener
    );

    return () => {
      window.removeEventListener(
        "yashflow:native-back",
        handleNativeBack as EventListener
      );
    };
  }, [selectedOrder]);

  const [editorEmployeeId, setEditorEmployeeId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const detailMap = useMemo(
    () => new Map(details.map((row) => [row.order_id, row])),
    [details]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;

    return orders.filter((order) =>
      [
        order.order_number,
        order.customer_name,
        order.customer_mobile || "",
        order.product_name,
        order.current_stage,
      ].some((value) => value.toLowerCase().includes(q))
    );
  }, [orders, search]);

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
      router.replace("/dashboard/manage");
      return false;
    }

    return true;
  }

  async function loadData() {
    const supabase = createClient();
    const [ordersResult, detailsResult] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, customer_name, customer_mobile, product_name, quantity, current_stage, workflow_status, due_date"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("order_operation_details")
        .select(
          "id, order_id, material, size_details, print_size, email_to_print_status, print_taken_status, print_job_given_by, print_received_status, payment_receiver, bill_created, bill_number, job_start_folder_details, production_note"
        ),
    ]);

    const error = ordersResult.error || detailsResult.error;
    if (error) {
      setMessage(`Order Details Load Error: ${error.message}`);
      return;
    }

    setOrders((ordersResult.data || []) as Order[]);
    setDetails((detailsResult.data || []) as OperationDetails[]);
  }

  useEffect(() => {
    async function init() {
      const allowed = await ensureAccess();
      if (!allowed) {
        setLoading(false);
        return;
      }

      await loadData();
      setLoading(false);
    }

    void init();
  }, []);

  function openEditor(order: Order) {
    const existing = detailMap.get(order.id);
    setSelectedOrder(order);
    setForm(
      existing
        ? {
            material: existing.material || "",
            size_details: existing.size_details || "",
            print_size: existing.print_size || "",
            email_to_print_status: existing.email_to_print_status,
            print_taken_status: existing.print_taken_status,
            print_job_given_by: existing.print_job_given_by || "",
            print_received_status: existing.print_received_status,
            job_start_folder_details: existing.job_start_folder_details || "",
            production_note: existing.production_note || "",
          }
        : EMPTY_FORM
    );
    setMessage("");
  }

  async function saveDetails() {
    if (!selectedOrder || !editorEmployeeId) return;

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.from("order_operation_details").upsert(
      {
        order_id: selectedOrder.id,
        material: form.material.trim() || null,
        size_details: form.size_details.trim() || null,
        print_size: form.print_size.trim() || null,
        email_to_print_status: form.email_to_print_status,
        print_taken_status: form.print_taken_status,
        print_job_given_by: form.print_job_given_by.trim() || null,
        print_received_status: form.print_received_status,
        job_start_folder_details: form.job_start_folder_details.trim() || null,
        production_note: form.production_note.trim() || null,
        updated_by: editorEmployeeId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "order_id" }
    );

    if (error) {
      setMessage(`Order Details Save Error: ${error.message}`);
      setSaving(false);
      return;
    }

    setMessage(`${selectedOrder.order_number} operational details saved ✅`);
    setSelectedOrder(null);
    await loadData();
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Order Details લોડ થઈ રહ્યા છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              YASHFLOW ORDER DETAILS
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Production Order Details
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Material → Print → Payment/Bill → Job Folder details
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn bg-white text-blue-700"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="yf-card p-4 mb-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Order / Customer / Product / Mobile / Stage..."
            className="yf-input"
          />
        </section>

        <section className="grid gap-4">
          {filteredOrders.map((order) => {
            const row = detailMap.get(order.id);
            const complete = Boolean(
              row?.material ||
                row?.size_details ||
                row?.print_size ||
                row?.job_start_folder_details
            );

            return (
              <article key={order.id} className="yf-card p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-blue-700">{order.order_number}</span>
                      <span className={`yf-badge ${complete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                        {complete ? "Details Added" : "Details Pending"}
                      </span>
                      <span className="yf-badge bg-slate-100 text-slate-700">
                        {order.current_stage}
                      </span>
                    </div>

                    <h2 className="text-lg font-black text-slate-900 mt-2">
                      {order.customer_name}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {order.product_name} • Qty {order.quantity}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Material: {row?.material || "-"} • Size: {row?.size_details || "-"} • Print: {row?.print_size || "-"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditor(order)}
                    className="yf-btn yf-btn-primary"
                  >
                    ✏ Manage Details
                  </button>
                </div>
              </article>
            );
          })}

          {filteredOrders.length === 0 && (
            <div className="yf-card p-10 text-center text-slate-400">કોઈ Order મળ્યો નથી.</div>
          )}
        </section>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-[100] bg-black/40 p-3 sm:p-5 flex items-center justify-center">
          <div className="w-full max-w-3xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 p-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black text-blue-700">PRODUCTION DETAILS</p>
                <h2 className="text-xl font-black mt-1">{selectedOrder.order_number}</h2>
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

            <div className="p-5 grid md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-black text-slate-700">Material</span>
                <input className="yf-input mt-2" value={form.material} onChange={(e) => setForm((x) => ({ ...x, material: e.target.value }))} />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Size / Dimensions</span>
                <input className="yf-input mt-2" value={form.size_details} onChange={(e) => setForm((x) => ({ ...x, size_details: e.target.value }))} />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Print Size</span>
                <input className="yf-input mt-2" value={form.print_size} onChange={(e) => setForm((x) => ({ ...x, print_size: e.target.value }))} />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Email to Print</span>
                <select className="yf-input mt-2" value={form.email_to_print_status} onChange={(e) => setForm((x) => ({ ...x, email_to_print_status: e.target.value as FormState["email_to_print_status"] }))}>
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="not_required">Not Required</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Print Taken</span>
                <select className="yf-input mt-2" value={form.print_taken_status} onChange={(e) => setForm((x) => ({ ...x, print_taken_status: e.target.value as FormState["print_taken_status"] }))}>
                  <option value="pending">Pending</option>
                  <option value="done">Done</option>
                  <option value="not_required">Not Required</option>
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Print Job Given By</span>
                <input className="yf-input mt-2" value={form.print_job_given_by} onChange={(e) => setForm((x) => ({ ...x, print_job_given_by: e.target.value }))} />
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-700">Print Received</span>
                <select className="yf-input mt-2" value={form.print_received_status} onChange={(e) => setForm((x) => ({ ...x, print_received_status: e.target.value as FormState["print_received_status"] }))}>
                  <option value="pending">Pending</option>
                  <option value="received">Received</option>
                  <option value="not_required">Not Required</option>
                </select>
              </label>

              <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-900">
                  💳 Payment & Billing
                </p>
                <p className="text-xs font-semibold text-amber-800 mt-1">
                  Financial details Accounts moduleમાં જ manage થશે જેથી એક જ source of truth રહે.
                </p>
              </div>

              <label className="md:col-span-2 block">
                <span className="text-sm font-black text-slate-700">Job Start Folder Details</span>
                <textarea rows={3} className="yf-input mt-2" value={form.job_start_folder_details} onChange={(e) => setForm((x) => ({ ...x, job_start_folder_details: e.target.value }))} />
              </label>

              <label className="md:col-span-2 block">
                <span className="text-sm font-black text-slate-700">Production Note</span>
                <textarea rows={3} className="yf-input mt-2" value={form.production_note} onChange={(e) => setForm((x) => ({ ...x, production_note: e.target.value }))} />
              </label>

              <div className="md:col-span-2 flex gap-3 justify-end">
                <button type="button" onClick={() => setSelectedOrder(null)} className="yf-btn yf-btn-secondary">Cancel</button>
                <button type="button" disabled={saving} onClick={() => void saveDetails()} className="yf-btn yf-btn-primary disabled:opacity-50">
                  {saving ? "Saving..." : "Save Production Details"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
