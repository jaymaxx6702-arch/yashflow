"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type OrderStage =
  | "design"
  | "cutting"
  | "production"
  | "final_assembly"
  | "packing"
  | "dispatch"
  | "completed"
  | "cancelled";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  priority: "low" | "normal" | "high" | "urgent";
  current_stage: OrderStage;
  due_date: string | null;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
};

const stageFlow: Record<string, OrderStage> = {
  design: "cutting",
  cutting: "production",
  production: "final_assembly",
  final_assembly: "packing",
  packing: "dispatch",
  dispatch: "completed",
};

function departmentToStage(
  department: string | null
): OrderStage | null {
  if (!department) return null;

  const value = department
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "_");

  if (value === "design") return "design";
  if (value === "cutting") return "cutting";
  if (value === "production") return "production";

  if (
    value === "final_assembly" ||
    value === "finalassembly"
  ) {
    return "final_assembly";
  }

  if (value === "packing") return "packing";
  if (value === "dispatch") return "dispatch";

  return null;
}

function formatStage(stage: string) {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

export default function DepartmentOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] =
    useState<string | null>(null);

  const [employeeId, setEmployeeId] =
    useState<string | null>(null);

  const [employeeName, setEmployeeName] =
    useState("");

  const [department, setDepartment] =
    useState<string | null>(null);

  const [stage, setStage] =
    useState<OrderStage | null>(null);

  const [orders, setOrders] =
    useState<Order[]>([]);

  const [message, setMessage] =
    useState("");

  async function loadOrders(
    departmentStage: OrderStage
  ) {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        product_name,
        quantity,
        priority,
        current_stage,
        due_date,
        customer_note,
        admin_note,
        created_at
      `)
      .eq("current_stage", departmentStage)
      .order("priority", {
        ascending: false,
      })
      .order("due_date", {
        ascending: true,
        nullsFirst: false,
      });

    if (error) {
      setMessage(
        `Order Load Error: ${error.message}`
      );
      return;
    }

    setOrders((data || []) as Order[]);
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

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("employees")
        .select(`
          id,
          full_name,
          department,
          approval_status,
          is_active
        `)
        .eq("auth_user_id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/");
        return;
      }

      setEmployeeId(profile.id);
      setEmployeeName(profile.full_name);
      setDepartment(profile.department);

      const departmentStage =
        departmentToStage(profile.department);

      setStage(departmentStage);

      if (departmentStage) {
        await loadOrders(departmentStage);
      }

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleMoveNext(order: Order) {
    if (!employeeId || !stage) return;

    const nextStage = stageFlow[stage];

    if (!nextStage) {
      setMessage(
        "આ stage માટે Next Stage configured નથી."
      );
      return;
    }

    setMovingId(order.id);
    setMessage("");

    const supabase = createClient();

    const updateData: {
      current_stage: OrderStage;
      updated_at: string;
      completed_at?: string;
    } = {
      current_stage: nextStage,
      updated_at: new Date().toISOString(),
    };

    if (nextStage === "completed") {
      updateData.completed_at =
        new Date().toISOString();
    }

    const { error: updateError } =
      await supabase
        .from("orders")
        .update(updateData)
        .eq("id", order.id)
        .eq("current_stage", stage);

    if (updateError) {
      setMessage(
        `Order Update Error: ${updateError.message}`
      );
      setMovingId(null);
      return;
    }

    const { error: historyError } =
      await supabase
        .from("order_stage_history")
        .insert({
          order_id: order.id,
          from_stage: stage,
          to_stage: nextStage,
          changed_by: employeeId,
          note: `${department || "Department"} completed`,
        });

    if (historyError) {
      setMessage(
        `Order આગળ ગયો, પરંતુ History Error: ${historyError.message}`
      );
    } else {
      setMessage(
        `${order.order_number} → ${formatStage(
          nextStage
        )} મોકલાયો ✅`
      );
    }

    await loadOrders(stage);

    setMovingId(null);
  }

  function priorityStyle(priority: string) {
    if (priority === "urgent")
      return "bg-red-100 text-red-700";

    if (priority === "high")
      return "bg-orange-100 text-orange-700";

    if (priority === "low")
      return "bg-slate-100 text-slate-600";

    return "bg-blue-100 text-blue-700";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Department Orders લોડ થઈ રહ્યા છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Department Orders
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/dashboard")
            }
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-5">
        <section className="bg-white border border-slate-200 rounded-2xl p-6 mb-5">
          <p className="text-sm font-semibold text-slate-500">
            Employee
          </p>

          <h2 className="text-2xl font-black text-slate-900 mt-1">
            {employeeName}
          </h2>

          <div className="flex gap-3 flex-wrap mt-4">
            <span className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-bold">
              {department || "No Department"}
            </span>

            {stage && (
              <span className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full text-sm font-bold">
                Stage: {formatStage(stage)}
              </span>
            )}
          </div>
        </section>

        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4 font-semibold text-blue-800">
            {message}
          </div>
        )}

        {!stage ? (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-8">
            <h2 className="font-black text-amber-800 text-xl">
              Production Stage નથી
            </h2>

            <p className="text-amber-700 mt-2">
              તમારા Department માટે Order Workflow
              stage configured નથી.
            </p>
          </section>
        ) : (
          <>
            <section className="flex items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-2xl font-black text-slate-900">
                  {formatStage(stage)} Orders
                </h2>

                <p className="text-slate-500 mt-1">
                  Total Pending: {orders.length}
                </p>
              </div>
            </section>

            <div className="grid gap-4">
              {orders.map((order) => {
                const nextStage =
                  stageFlow[order.current_stage];

                return (
                  <section
                    key={order.id}
                    className="bg-white border border-slate-200 rounded-2xl p-6"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="text-xl font-black text-slate-900">
                            {order.order_number}
                          </h3>

                          <span
                            className={`px-3 py-1 rounded-full text-xs font-bold ${priorityStyle(
                              order.priority
                            )}`}
                          >
                            {order.priority.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
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
                              PRODUCT
                            </p>

                            <p className="font-semibold mt-1">
                              {order.product_name}
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
                              DUE DATE
                            </p>

                            <p className="font-semibold mt-1">
                              {order.due_date || "-"}
                            </p>
                          </div>
                        </div>

                        {order.customer_note && (
                          <div className="mt-5 bg-slate-50 rounded-xl p-4">
                            <p className="text-xs font-bold text-slate-500">
                              Customer Note
                            </p>

                            <p className="mt-1">
                              {order.customer_note}
                            </p>
                          </div>
                        )}

                        {order.admin_note && (
                          <div className="mt-3 bg-amber-50 rounded-xl p-4">
                            <p className="text-xs font-bold text-amber-700">
                              Admin Note
                            </p>

                            <p className="mt-1">
                              {order.admin_note}
                            </p>
                          </div>
                        )}
                      </div>

                      {nextStage && (
                        <button
                          type="button"
                          disabled={
                            movingId === order.id
                          }
                          onClick={() =>
                            handleMoveNext(order)
                          }
                          className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50 whitespace-nowrap"
                        >
                          {movingId === order.id
                            ? "Moving..."
                            : `Send to ${formatStage(
                                nextStage
                              )} →`}
                        </button>
                      )}
                    </div>
                  </section>
                );
              })}

              {orders.length === 0 && (
                <section className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
                  <p className="text-slate-400 font-semibold">
                    આ Departmentમાં હાલમાં કોઈ Order
                    Pending નથી.
                  </p>
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}