"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  current_stage: string;
  due_date: string | null;
  created_at: string;
};

type Payment = {
  order_id: string;
  payment_amount: number | null;
  payment_status: string | null;
  payment_receiver_name: string | null;
  updated_at: string | null;
};

type Billing = {
  order_id: string;
  bill_created: boolean;
  bill_number: string | null;
  bill_date: string | null;
  updated_at: string | null;
};

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AdminAccountsSummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [billing, setBilling] = useState<Billing[]>([]);
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [billFilter, setBillFilter] = useState("all");

  const paymentMap = useMemo(
    () => new Map(payments.map((row) => [row.order_id, row])),
    [payments]
  );

  const billingMap = useMemo(
    () => new Map(billing.map((row) => [row.order_id, row])),
    [billing]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      const payment = paymentMap.get(order.id);
      const bill = billingMap.get(order.id);
      const pStatus = payment?.payment_status || "pending";
      const billed = Boolean(bill?.bill_created);

      const matchesSearch =
        !q ||
        order.order_number.toLowerCase().includes(q) ||
        order.customer_name.toLowerCase().includes(q) ||
        order.product_name.toLowerCase().includes(q) ||
        (payment?.payment_receiver_name || "").toLowerCase().includes(q) ||
        (bill?.bill_number || "").toLowerCase().includes(q);

      const matchesPayment = paymentFilter === "all" || pStatus === paymentFilter;
      const matchesBill =
        billFilter === "all" ||
        (billFilter === "created" && billed) ||
        (billFilter === "pending" && !billed);

      return matchesSearch && matchesPayment && matchesBill;
    });
  }, [orders, paymentMap, billingMap, search, paymentFilter, billFilter]);

  const totals = useMemo(() => {
    const amount = payments.reduce(
      (sum, row) => sum + Number(row.payment_amount || 0),
      0
    );
    const paid = payments.filter((row) => row.payment_status === "paid").length;
    const partial = payments.filter((row) => row.payment_status === "partial").length;
    const pending = orders.filter((order) => {
      const row = paymentMap.get(order.id);
      return !row || row.payment_status === "pending";
    }).length;
    const billed = billing.filter((row) => row.bill_created).length;

    return { amount, paid, partial, pending, billed };
  }, [orders, payments, billing, paymentMap]);

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

      const [orderResult, paymentResult, billingResult] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, customer_name, product_name, quantity, current_stage, due_date, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("order_payments")
          .select("order_id, payment_amount, payment_status, payment_receiver_name, updated_at"),
        supabase
          .from("order_billing")
          .select("order_id, bill_created, bill_number, bill_date, updated_at"),
      ]);

      const firstError = orderResult.error || paymentResult.error || billingResult.error;
      if (firstError) {
        setMessage(`Accounts Load Error: ${firstError.message}`);
        setLoading(false);
        return;
      }

      setOrders((orderResult.data || []) as Order[]);
      setPayments((paymentResult.data || []) as Payment[]);
      setBilling((billingResult.data || []) as Billing[]);
      setLoading(false);
    }

    void load();
  }, [router]);

  function exportCsv() {
    const header = [
      "Order",
      "Customer",
      "Product",
      "Quantity",
      "Stage",
      "Payment Amount",
      "Payment Status",
      "Receiver",
      "Bill Created",
      "Bill Number",
      "Bill Date",
    ];

    const rows = filtered.map((order) => {
      const payment = paymentMap.get(order.id);
      const bill = billingMap.get(order.id);
      return [
        order.order_number,
        order.customer_name,
        order.product_name,
        order.quantity,
        order.current_stage,
        payment?.payment_amount ?? "",
        payment?.payment_status || "pending",
        payment?.payment_receiver_name || "",
        bill?.bill_created ? "Yes" : "No",
        bill?.bill_number || "",
        bill?.bill_date || "",
      ];
    });

    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yashflow-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Accounts Summary લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW ACCOUNTS</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Accounts / Billing Summary</h1>
            <p className="text-sm text-blue-100 mt-1">Payments, billing status, filters અને export એક જગ્યાએ.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => router.push("/dashboard/accounts")} className="yf-btn bg-white/10 text-white border border-white/20">
              ✏ Payment / Billing Editor
            </button>
            <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">← Admin</button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">RECORDED AMOUNT</p><p className="text-2xl font-black text-green-700 mt-1">₹{totals.amount.toLocaleString("en-IN")}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">PAID</p><p className="text-3xl font-black text-green-700 mt-1">{totals.paid}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">PARTIAL</p><p className="text-3xl font-black text-amber-700 mt-1">{totals.partial}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">PAYMENT PENDING</p><p className="text-3xl font-black text-red-700 mt-1">{totals.pending}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">BILLS CREATED</p><p className="text-3xl font-black text-blue-700 mt-1">{totals.billed}</p></div>
        </section>

        <section className="yf-card p-4 mb-5">
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
            <input className="yf-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Order / Customer / Product / Receiver / Bill No..." />
            <select className="yf-input" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}>
              <option value="all">All Payments</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="not_applicable">Not Applicable</option>
            </select>
            <select className="yf-input" value={billFilter} onChange={(e) => setBillFilter(e.target.value)}>
              <option value="all">All Bills</option>
              <option value="created">Bill Created</option>
              <option value="pending">Bill Pending</option>
            </select>
            <button type="button" onClick={exportCsv} className="yf-btn yf-btn-primary">⬇ CSV</button>
          </div>
        </section>

        <section className="yf-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-50">
                <tr className="text-xs font-black uppercase text-slate-500">
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Product</th>
                  <th className="text-left px-4 py-3">Payment</th>
                  <th className="text-left px-4 py-3">Receiver</th>
                  <th className="text-left px-4 py-3">Bill</th>
                  <th className="text-left px-4 py-3">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const payment = paymentMap.get(order.id);
                  const bill = billingMap.get(order.id);
                  return (
                    <tr key={order.id} className="border-t border-slate-100">
                      <td className="px-4 py-3"><p className="font-black text-blue-700">{order.order_number}</p><p className="text-xs text-slate-500">{order.current_stage}</p></td>
                      <td className="px-4 py-3 font-bold">{order.customer_name}</td>
                      <td className="px-4 py-3"><p className="font-bold">{order.product_name}</p><p className="text-xs text-slate-500">Qty {order.quantity}</p></td>
                      <td className="px-4 py-3"><p className="font-black">{payment?.payment_amount == null ? "-" : `₹${Number(payment.payment_amount).toLocaleString("en-IN")}`}</p><p className="text-xs capitalize text-slate-500">{(payment?.payment_status || "pending").replace(/_/g, " ")}</p></td>
                      <td className="px-4 py-3">{payment?.payment_receiver_name || "-"}</td>
                      <td className="px-4 py-3">{bill?.bill_created ? <><span className="yf-badge bg-green-100 text-green-700">Created</span><p className="text-xs font-bold mt-1">{bill.bill_number || "-"}</p></> : <span className="yf-badge bg-amber-100 text-amber-700">Pending</span>}</td>
                      <td className="px-4 py-3">{order.due_date || "-"}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">કોઈ record મળ્યો નથી.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
