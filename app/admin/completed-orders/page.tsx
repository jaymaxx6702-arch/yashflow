"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type CompletedOrder = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  order_source: string;
  priority: string;
  order_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  current_stage: string;
  workflow_status: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function CompletedOrdersPage() {
  const router = useRouter();

  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

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

      const { data: admin, error: adminError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        adminError ||
        !admin ||
        admin.role !== "admin" ||
        admin.approval_status !== "approved" ||
        !admin.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      const { data, error } = await supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          customer_mobile,
          product_name,
          quantity,
          order_source,
          priority,
          order_date,
          due_date,
          completed_at,
          created_at,
          current_stage,
          workflow_status
        `)
        .or("current_stage.eq.completed,workflow_status.eq.completed")
        .order("completed_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Completed Orders Load Error: ${error.message}`);
        setLoading(false);
        return;
      }

      setOrders((data || []) as CompletedOrder[]);
      setLoading(false);
    }

    void loadPage();
  }, [router]);

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

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Completed Orders લોડ થઈ રહ્યા છે...
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
              ORDER ARCHIVE
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Completed Orders
            </h1>
            <p className="text-blue-100 text-sm font-semibold mt-1">
              પૂર્ણ થયેલા Orders અહીં અલગ રાખવામાં આવ્યા છે.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-4">{message}</div>
        )}

        <section className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="yf-card p-4">
            <p className="text-[10px] font-black tracking-[0.14em] text-green-700">
              TOTAL COMPLETED
            </p>
            <p className="text-3xl font-black text-slate-900 mt-1">
              {orders.length}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
              SEARCH RESULT
            </p>
            <p className="text-3xl font-black text-slate-900 mt-1">
              {filteredOrders.length}
            </p>
          </div>
        </section>

        <section className="yf-card p-4 mb-4">
          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search Order / Customer / Mobile / Product..."
            className="yf-input"
          />
        </section>

        <section className="space-y-2">
          {filteredOrders.map((order) => (
            <article
              key={order.id}
              className="yf-card p-4 hover:border-green-300 hover:shadow-sm transition"
            >
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
                      className="text-lg font-black text-blue-700 hover:underline"
                    >
                      {order.order_number}
                    </button>

                    <span className="yf-badge bg-green-100 text-green-700">
                      ✓ Completed
                    </span>

                    <span className="yf-badge bg-slate-100 text-slate-700">
                      {order.priority.toUpperCase()}
                    </span>
                  </div>

                  <h2 className="font-black text-slate-900 mt-2">
                    {order.customer_name}
                  </h2>

                  <p className="text-sm font-semibold text-slate-500 mt-1">
                    {order.product_name} • Qty {order.quantity}
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[9px] font-black text-slate-400">
                        MOBILE
                      </p>
                      <p className="text-xs font-bold text-slate-800 mt-1">
                        {order.customer_mobile || "-"}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[9px] font-black text-slate-400">
                        SOURCE
                      </p>
                      <p className="text-xs font-bold text-slate-800 mt-1 capitalize">
                        {order.order_source}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-[9px] font-black text-slate-400">
                        ORDER DATE
                      </p>
                      <p className="text-xs font-bold text-slate-800 mt-1">
                        {formatDate(order.order_date)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-green-50 p-3">
                      <p className="text-[9px] font-black text-green-600">
                        COMPLETED
                      </p>
                      <p className="text-xs font-bold text-green-900 mt-1">
                        {formatDateTime(order.completed_at)}
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                  className="yf-btn yf-btn-secondary shrink-0"
                >
                  View Details →
                </button>
              </div>
            </article>
          ))}

          {filteredOrders.length === 0 && (
            <div className="yf-card p-10 text-center">
              <p className="text-3xl">✅</p>
              <h2 className="text-lg font-black text-slate-900 mt-2">
                Completed Order મળ્યો નથી
              </h2>
              <p className="text-sm font-semibold text-slate-500 mt-1">
                Search બદલીને ફરી જુઓ.
              </p>
            </div>
          )}
        </section>

        <div className="py-5">
          <button
            type="button"
            onClick={() => router.push("/admin/orders")}
            className="yf-btn yf-btn-secondary"
          >
            ← Active Orders
          </button>
        </div>
      </div>
    </main>
  );
}
