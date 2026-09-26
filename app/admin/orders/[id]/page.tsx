"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  order_source: string;
  current_stage: string;
  workflow_status: string;
  priority: string;
  order_date: string;
  due_date: string | null;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
  completed_at: string | null;
};

type HistoryRow = {
  id: string;
  from_stage: string | null;
  to_stage: string;
  note: string | null;
  changed_at: string;
  employees: {
    id: string;
    full_name: string;
    department: string | null;
  } | null;
};

function formatStage(stage: string | null) {
  if (!stage) return "Start";

  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();

  const orderId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [message, setMessage] = useState("");
  const [completeLoading, setCompleteLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

      const {
        data: adminProfile,
        error: adminError,
      } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        adminError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        adminProfile.approval_status !== "approved" ||
        !adminProfile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      const {
        data: orderData,
        error: orderError,
      } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          customer_mobile,
          product_name,
          quantity,
          order_source,
          current_stage,
          workflow_status,
          priority,
          order_date,
          due_date,
          customer_note,
          admin_note,
          created_at,
          completed_at
        `)
        .eq("id", orderId)
        .single();

      if (orderError || !orderData) {
        setMessage(
          orderError
            ? `Order Load Error: ${orderError.message}`
            : "Order મળ્યો નથી."
        );

        setLoading(false);
        return;
      }

      const {
        data: historyData,
        error: historyError,
      } = await supabase
        .from("order_stage_history")
        .select(`
          id,
          from_stage,
          to_stage,
          note,
          changed_at,
          employees!order_stage_history_changed_by_fkey (
            id,
            full_name,
            department
          )
        `)
        .eq("order_id", orderId)
        .order("changed_at", {
          ascending: true,
        });

      if (historyError) {
        setMessage(
          `History Load Error: ${historyError.message}`
        );
      }

      setOrder(orderData as Order);
      setHistory(
        (historyData || []) as unknown as HistoryRow[]
      );

      setLoading(false);
    }

    if (orderId) {
      loadPage();
    }
  }, [orderId, router, refreshKey]);

  async function completeOrderDirectly() {
    if (!order) return;

    const confirmed = window.confirm(
      `${order.order_number} ને Direct Complete કરવો છે?\n\nCurrent stage સહિત બધા active stages બંધ થશે અને Order Completed થશે. આ action આગળના normal workflow steps bypass કરશે.\n\nContinue?`
    );

    if (!confirmed) return;

    setCompleteLoading(true);
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.rpc(
      "admin_complete_order_v1",
      {
        p_order_id: order.id,
        p_note: "Admin direct completed order from Full Details / History",
      }
    );

    if (error) {
      setMessage(`Direct Complete Error: ${error.message}`);
      setCompleteLoading(false);
      return;
    }

    const result = (data || {}) as {
      ok?: boolean;
      already_completed?: boolean;
    };

    setMessage(
      result.already_completed
        ? `${order.order_number} પહેલેથી Completed છે ✅`
        : `${order.order_number} Completed ✅`
    );

    setCompleteLoading(false);
    setRefreshKey((current) => current + 1);
  }

  const canDirectComplete =
    Boolean(order) &&
    order?.current_stage !== "completed" &&
    order?.workflow_status !== "completed" &&
    order?.current_stage !== "cancelled" &&
    order?.workflow_status !== "cancelled";

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Order Details લોડ થઈ રહ્યા છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-5 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              Order Details
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Production Workflow Timeline
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin/orders")}
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold"
          >
            ← Order Management
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-5">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4 font-semibold text-blue-800">
            {message}
          </div>
        )}

        {order && (
          <>
            <section className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                <div>
                  <p className="text-sm font-bold text-blue-600">
                    ORDER
                  </p>

                  <h2 className="text-3xl font-black text-slate-900 mt-1">
                    {order.order_number}
                  </h2>

                  <p className="text-slate-500 mt-2">
                    {order.product_name}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full text-xs font-bold">
                    {formatStage(order.current_stage)}
                  </span>

                  <span className="bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold">
                    {order.priority.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
                <div>
                  <p className="text-xs font-bold text-slate-400">
                    CUSTOMER
                  </p>
                  <p className="font-semibold mt-1">
                    {order.customer_name}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    MOBILE
                  </p>
                  <p className="font-semibold mt-1">
                    {order.customer_mobile || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    QUANTITY
                  </p>
                  <p className="font-semibold mt-1">
                    {order.quantity}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    SOURCE
                  </p>
                  <p className="font-semibold mt-1 capitalize">
                    {order.order_source}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    ORDER DATE
                  </p>
                  <p className="font-semibold mt-1">
                    {order.order_date}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    DUE DATE
                  </p>
                  <p className="font-semibold mt-1">
                    {order.due_date || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    CREATED
                  </p>
                  <p className="font-semibold mt-1">
                    {formatDateTime(order.created_at)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400">
                    COMPLETED
                  </p>
                  <p className="font-semibold mt-1">
                    {order.completed_at
                      ? formatDateTime(order.completed_at)
                      : "-"}
                  </p>
                </div>
              </div>

              {order.customer_note && (
                <div className="mt-6 bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500">
                    Customer Note
                  </p>

                  <p className="mt-1 text-slate-800">
                    {order.customer_note}
                  </p>
                </div>
              )}

              {order.admin_note && (
                <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-700">
                    Admin Note
                  </p>

                  <p className="mt-1 text-slate-800">
                    {order.admin_note}
                  </p>
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl mt-5 p-6">
              <div>
                <p className="text-sm font-bold text-purple-600">
                  WORKFLOW HISTORY
                </p>

                <h2 className="text-2xl font-black text-slate-900 mt-1">
                  Order Timeline
                </h2>
              </div>

              <div className="mt-6">
                {history.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative pl-10 pb-8"
                  >
                    {index !== history.length - 1 && (
                      <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-200" />
                    )}

                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-blue-600 border-4 border-blue-100" />

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900">
                            {formatStage(item.from_stage)}
                            {" → "}
                            {formatStage(item.to_stage)}
                          </p>

                          <p className="text-sm text-slate-500 mt-1">
                            Changed by:{" "}
                            <span className="font-semibold text-slate-700">
                              {item.employees?.full_name ||
                                "Unknown"}
                            </span>

                            {item.employees?.department
                              ? ` — ${item.employees.department}`
                              : ""}
                          </p>
                        </div>

                        <div className="text-sm font-semibold text-slate-500">
                          {formatDateTime(item.changed_at)}
                        </div>
                      </div>

                      {item.note && (
                        <div className="mt-3 text-sm text-slate-600">
                          {item.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {history.length === 0 && (
                  <div className="text-center py-10 text-slate-400">
                    આ Order માટે હજુ History નથી.
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl mt-5 p-6">
              <p className="text-sm font-bold text-slate-500">
                ADMIN ORDER ACTION
              </p>

              <h2 className="text-xl font-black text-slate-900 mt-1">
                Order Completion
              </h2>

              {canDirectComplete ? (
                <>
                  <p className="text-sm font-semibold text-slate-600 mt-2">
                    Direct Complete current workflowને bypass કરીને Orderને Completed કરશે.
                    જરૂરી હોય ત્યારે જ આ action વાપરો.
                  </p>

                  <button
                    type="button"
                    onClick={completeOrderDirectly}
                    disabled={completeLoading}
                    className="mt-4 rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {completeLoading
                      ? "Completing..."
                      : "✓ Complete Order"}
                  </button>
                </>
              ) : (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-black text-green-700">
                  {order.completed_at
                    ? `Order Completed • ${formatDateTime(order.completed_at)}`
                    : "Order completion action unavailable for this status."}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}