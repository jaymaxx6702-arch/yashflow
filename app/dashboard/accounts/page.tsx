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
};

type OrderPayment = {
  order_id: string;
  payment_amount: number | null;
  payment_status:
    | "pending"
    | "partial"
    | "paid"
    | "refunded"
    | "not_applicable";
  payment_receiver_name: string | null;
  payment_note: string | null;
  updated_at: string;
};

type OrderBilling = {
  order_id: string;
  bill_created: boolean;
  bill_number: string | null;
  bill_date: string | null;
  billing_note: string | null;
  updated_at: string;
};

export default function AccountsOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [canViewPayments, setCanViewPayments] = useState(false);
  const [canManagePayments, setCanManagePayments] = useState(false);
  const [canManageBilling, setCanManageBilling] = useState(false);

  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [billing, setBilling] = useState<OrderBilling[]>([]);
  const [search, setSearch] = useState("");

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentStatus, setPaymentStatus] =
    useState<OrderPayment["payment_status"]>("pending");
  const [paymentReceiver, setPaymentReceiver] = useState("");
  const [paymentNote, setPaymentNote] = useState("");

  const [billCreated, setBillCreated] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  const [billDate, setBillDate] = useState("");
  const [billingNote, setBillingNote] = useState("");

  const [savingPayment, setSavingPayment] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);

  const paymentMap = useMemo(
    () => new Map(payments.map((row) => [row.order_id, row])),
    [payments]
  );

  const billingMap = useMemo(
    () => new Map(billing.map((row) => [row.order_id, row])),
    [billing]
  );

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      if (!q) return true;

      return (
        order.order_number.toLowerCase().includes(q) ||
        order.customer_name.toLowerCase().includes(q) ||
        order.product_name.toLowerCase().includes(q)
      );
    });
  }, [orders, search]);

  async function loadData(
    viewPayments: boolean,
    managePayments: boolean,
    manageBilling: boolean
  ) {
    const supabase = createClient();

    const orderResult = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        product_name,
        quantity,
        current_stage,
        due_date
      `)
      .order("created_at", { ascending: false });

    if (orderResult.error) {
      setMessage(`Order Load Error: ${orderResult.error.message}`);
      return;
    }

    setOrders((orderResult.data || []) as Order[]);

    if (viewPayments || managePayments) {
      const paymentResult = await supabase
        .from("order_payments")
        .select(`
          order_id,
          payment_amount,
          payment_status,
          payment_receiver_name,
          payment_note,
          updated_at
        `);

      if (paymentResult.error) {
        setMessage(`Payment Load Error: ${paymentResult.error.message}`);
        return;
      }

      setPayments((paymentResult.data || []) as OrderPayment[]);
    } else {
      setPayments([]);
    }

    if (manageBilling) {
      const billingResult = await supabase
        .from("order_billing")
        .select(`
          order_id,
          bill_created,
          bill_number,
          bill_date,
          billing_note,
          updated_at
        `);

      if (billingResult.error) {
        setMessage(`Billing Load Error: ${billingResult.error.message}`);
        return;
      }

      setBilling((billingResult.data || []) as OrderBilling[]);
    } else {
      setBilling([]);
    }
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

      const [
        ordersViewResult,
        ordersManageResult,
        paymentViewResult,
        paymentManageResult,
        billingManageResult,
      ] = await Promise.all([
        supabase.rpc("has_app_permission", {
          p_permission_key: "orders.view",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key: "orders.manage",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key: "payments.view_sensitive",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key: "payments.manage",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key: "billing.manage",
        }),
      ]);

      const firstError =
        ordersViewResult.error ||
        ordersManageResult.error ||
        paymentViewResult.error ||
        paymentManageResult.error ||
        billingManageResult.error;

      if (firstError) {
        setMessage(`Permission Error: ${firstError.message}`);
        setLoading(false);
        return;
      }

      const canViewOrders =
        Boolean(ordersViewResult.data) ||
        Boolean(ordersManageResult.data);

      const paymentManageAllowed =
        Boolean(paymentManageResult.data);

      const paymentViewAllowed =
        Boolean(paymentViewResult.data) ||
        paymentManageAllowed;

      const billingAllowed =
        Boolean(billingManageResult.data);

      if (
        !canViewOrders ||
        (!paymentViewAllowed && !billingAllowed)
      ) {
        router.replace("/dashboard");
        return;
      }

      setCanViewPayments(paymentViewAllowed);
      setCanManagePayments(paymentManageAllowed);
      setCanManageBilling(billingAllowed);

      await loadData(
        paymentViewAllowed,
        paymentManageAllowed,
        billingAllowed
      );

      setLoading(false);
    }

    loadPage();
  }, [router]);

  function openOrder(order: Order) {
    setSelectedOrder(order);

    const payment = paymentMap.get(order.id);
    const bill = billingMap.get(order.id);

    setPaymentAmount(
      payment?.payment_amount == null
        ? ""
        : String(payment.payment_amount)
    );
    setPaymentStatus(payment?.payment_status || "pending");
    setPaymentReceiver(payment?.payment_receiver_name || "");
    setPaymentNote(payment?.payment_note || "");

    setBillCreated(bill?.bill_created || false);
    setBillNumber(bill?.bill_number || "");
    setBillDate(bill?.bill_date || "");
    setBillingNote(bill?.billing_note || "");
  }

  async function savePayment() {
    if (!selectedOrder || !canManagePayments) return;

    let amount: number | null = null;

    if (paymentAmount.trim()) {
      amount = Number(paymentAmount);

      if (Number.isNaN(amount) || amount < 0) {
        setMessage("Payment Amount સાચો નાખો.");
        return;
      }
    }

    setSavingPayment(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "save_order_payment_sensitive",
      {
        p_order_id: selectedOrder.id,
        p_payment_amount: amount,
        p_payment_status: paymentStatus,
        p_payment_receiver_name: paymentReceiver.trim() || null,
        p_payment_note: paymentNote.trim() || null,
      }
    );

    if (error) {
      setMessage(`Payment Save Error: ${error.message}`);
      setSavingPayment(false);
      return;
    }

    setMessage("Payment Details Saved ✅");

    await loadData(
      canViewPayments,
      canManagePayments,
      canManageBilling
    );

    setSavingPayment(false);
  }

  async function saveBill() {
    if (!selectedOrder || !canManageBilling) return;

    if (billCreated && !billNumber.trim()) {
      setMessage("Bill Created હોય તો Bill Number જરૂરી છે.");
      return;
    }

    setSavingBilling(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "save_order_billing_sensitive",
      {
        p_order_id: selectedOrder.id,
        p_bill_created: billCreated,
        p_bill_number: billNumber.trim() || null,
        p_bill_date: billDate || null,
        p_billing_note: billingNote.trim() || null,
      }
    );

    if (error) {
      setMessage(`Billing Save Error: ${error.message}`);
      setSavingBilling(false);
      return;
    }

    setMessage("Billing Details Saved ✅");

    await loadData(
      canViewPayments,
      canManagePayments,
      canManageBilling
    );

    setSavingBilling(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">
          Accounts data લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              YASHFLOW ACCOUNTS
            </p>
            <h1 className="text-2xl font-black text-white mt-1">
              Payment & Billing
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Permission-protected financial order data
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

        <section className="yf-card p-4 mb-5">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Order / Customer / Product..."
            className="yf-input"
          />
        </section>

        <section className="yf-card overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="yf-section-title">
              Orders — Accounts View
            </h2>
            <p className="yf-section-subtitle mt-1">
              {filteredOrders.length} order(s)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr className="text-xs font-black text-slate-500 uppercase">
                  <th className="text-left px-4 py-3">Order</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Product</th>
                  {canViewPayments && (
                    <>
                      <th className="text-left px-4 py-3">Payment</th>
                      <th className="text-left px-4 py-3">Receiver</th>
                    </>
                  )}
                  {canManageBilling && (
                    <th className="text-left px-4 py-3">Bill</th>
                  )}
                  <th className="text-left px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => {
                  const payment = paymentMap.get(order.id);
                  const bill = billingMap.get(order.id);

                  return (
                    <tr
                      key={order.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-3">
                        <p className="font-black text-blue-700">
                          {order.order_number}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {order.current_stage}
                        </p>
                      </td>

                      <td className="px-4 py-3 font-bold">
                        {order.customer_name}
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-bold">
                          {order.product_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          Qty: {order.quantity}
                        </p>
                      </td>

                      {canViewPayments && (
                        <>
                          <td className="px-4 py-3">
                            <p className="font-black">
                              {payment?.payment_amount == null
                                ? "-"
                                : `₹${Number(
                                    payment.payment_amount
                                  ).toLocaleString("en-IN")}`}
                            </p>
                            <p className="text-xs text-slate-500 capitalize">
                              {payment?.payment_status?.replace(
                                /_/g,
                                " "
                              ) || "Pending"}
                            </p>
                          </td>

                          <td className="px-4 py-3">
                            {payment?.payment_receiver_name || "-"}
                          </td>
                        </>
                      )}

                      {canManageBilling && (
                        <td className="px-4 py-3">
                          {bill?.bill_created ? (
                            <>
                              <span className="yf-badge bg-green-100 text-green-700">
                                Created
                              </span>
                              <p className="text-xs font-bold mt-1">
                                {bill.bill_number}
                              </p>
                            </>
                          ) : (
                            <span className="yf-badge bg-amber-100 text-amber-700">
                              Pending
                            </span>
                          )}
                        </td>
                      )}

                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openOrder(order)}
                          className="yf-btn yf-btn-secondary"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      કોઈ Order મળ્યો નથી.
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
                  ACCOUNTS ORDER
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

            <div className="p-5 space-y-5">
              {canViewPayments && (
                <div className="yf-card p-4 border border-emerald-200">
                  <p className="text-xs font-black tracking-[0.12em] text-emerald-700">
                    PAYMENT — SENSITIVE
                  </p>

                  {canManagePayments ? (
                    <div className="grid sm:grid-cols-2 gap-3 mt-4">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentAmount}
                        onChange={(event) =>
                          setPaymentAmount(event.target.value)
                        }
                        placeholder="Payment Amount"
                        className="yf-input"
                      />

                      <select
                        value={paymentStatus}
                        onChange={(event) =>
                          setPaymentStatus(
                            event.target
                              .value as OrderPayment["payment_status"]
                          )
                        }
                        className="yf-input"
                      >
                        <option value="pending">Pending</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                        <option value="refunded">Refunded</option>
                        <option value="not_applicable">
                          Not Applicable
                        </option>
                      </select>

                      <input
                        value={paymentReceiver}
                        onChange={(event) =>
                          setPaymentReceiver(event.target.value)
                        }
                        placeholder="Payment Receiver"
                        className="yf-input sm:col-span-2"
                      />

                      <textarea
                        rows={2}
                        value={paymentNote}
                        onChange={(event) =>
                          setPaymentNote(event.target.value)
                        }
                        placeholder="Payment Note"
                        className="yf-input resize-none sm:col-span-2"
                      />

                      <button
                        type="button"
                        onClick={savePayment}
                        disabled={savingPayment}
                        className="yf-btn yf-btn-success sm:col-span-2"
                      >
                        {savingPayment
                          ? "Saving..."
                          : "Save Payment"}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2 text-sm">
                      <p>
                        <b>Amount:</b>{" "}
                        {paymentMap.get(selectedOrder.id)
                          ?.payment_amount == null
                          ? "-"
                          : `₹${Number(
                              paymentMap.get(selectedOrder.id)!
                                .payment_amount
                            ).toLocaleString("en-IN")}`}
                      </p>
                      <p>
                        <b>Status:</b>{" "}
                        {paymentMap
                          .get(selectedOrder.id)
                          ?.payment_status?.replace(/_/g, " ") ||
                          "Pending"}
                      </p>
                      <p>
                        <b>Receiver:</b>{" "}
                        {paymentMap.get(selectedOrder.id)
                          ?.payment_receiver_name || "-"}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {canManageBilling && (
                <div className="yf-card p-4 border border-indigo-200">
                  <p className="text-xs font-black tracking-[0.12em] text-indigo-700">
                    BILLING — SENSITIVE
                  </p>

                  <div className="grid sm:grid-cols-2 gap-3 mt-4">
                    <label className="flex items-center gap-3 border rounded-xl p-3 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={billCreated}
                        onChange={(event) =>
                          setBillCreated(event.target.checked)
                        }
                      />
                      <span className="font-black">
                        Bill Created
                      </span>
                    </label>

                    <input
                      value={billNumber}
                      onChange={(event) =>
                        setBillNumber(event.target.value)
                      }
                      placeholder="Bill Number"
                      className="yf-input"
                    />

                    <input
                      type="date"
                      value={billDate}
                      onChange={(event) =>
                        setBillDate(event.target.value)
                      }
                      className="yf-input"
                    />

                    <textarea
                      rows={2}
                      value={billingNote}
                      onChange={(event) =>
                        setBillingNote(event.target.value)
                      }
                      placeholder="Billing Note"
                      className="yf-input resize-none sm:col-span-2"
                    />

                    <button
                      type="button"
                      onClick={saveBill}
                      disabled={savingBilling}
                      className="yf-btn yf-btn-primary sm:col-span-2"
                    >
                      {savingBilling
                        ? "Saving..."
                        : "Save Billing"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
