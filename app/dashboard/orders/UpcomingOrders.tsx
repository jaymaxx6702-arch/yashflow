"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type PlanWorker = {
  order_stage_plan_id: string;
  worker_role: "primary" | "support";
};

type StagePlan = {
  id: string;
  order_id: string;
  stage_id: string;
  sequence_no: number;
  primary_employee_id: string | null;
  activated_at: string | null;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  current_stage_id: string | null;
  current_stage: string;
  workflow_status: string;
};

type Stage = {
  id: string;
  name: string;
};

type UpcomingItem = {
  plan: StagePlan;
  order: Order;
  role: "primary" | "support";
};

function priorityClass(priority: Order["priority"]) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-blue-100 text-blue-700";
}

export default function UpcomingOrders({
  employeeId,
}: {
  employeeId: string;
}) {
  const [items, setItems] = useState<UpcomingItem[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage.name])),
    [stages]
  );

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data: workerRows, error: workerError } = await supabase
        .from("order_stage_plan_workers")
        .select("order_stage_plan_id, worker_role")
        .eq("employee_id", employeeId);

      if (workerError || !workerRows?.length) {
        setItems([]);
        setLoading(false);
        return;
      }

      const planIds = workerRows.map(
        (row) => row.order_stage_plan_id
      );

      const { data: planRows, error: planError } = await supabase
        .from("order_stage_plans")
        .select(
          "id, order_id, stage_id, sequence_no, primary_employee_id, activated_at"
        )
        .in("id", planIds)
        .is("activated_at", null);

      if (planError || !planRows?.length) {
        setItems([]);
        setLoading(false);
        return;
      }

      const orderIds = Array.from(
        new Set(planRows.map((plan) => plan.order_id))
      );

      const stageIds = Array.from(
        new Set(planRows.map((plan) => plan.stage_id))
      );

      const [ordersResult, stagesResult] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, order_number, customer_name, product_name, quantity, priority, due_date, current_stage_id, current_stage, workflow_status"
          )
          .in("id", orderIds),
        supabase
          .from("workflow_stages")
          .select("id, name")
          .in("id", stageIds),
      ]);

      if (ordersResult.error || stagesResult.error) {
        setItems([]);
        setLoading(false);
        return;
      }

      const orderMap = new Map(
        ((ordersResult.data || []) as Order[]).map((order) => [
          order.id,
          order,
        ])
      );

      const roleMap = new Map(
        workerRows.map((row) => [
          row.order_stage_plan_id,
          row.worker_role as "primary" | "support",
        ])
      );

      const nextItems = (planRows as StagePlan[])
        .map((plan) => {
          const order = orderMap.get(plan.order_id);
          const role = roleMap.get(plan.id);

          if (!order || !role) return null;

          if (
            order.workflow_status === "completed" ||
            order.workflow_status === "cancelled" ||
            order.current_stage_id === plan.stage_id
          ) {
            return null;
          }

          return {
            plan,
            order,
            role,
          };
        })
        .filter(
          (item): item is UpcomingItem => Boolean(item)
        )
        .sort((a, b) => {
          const rank = {
            urgent: 4,
            high: 3,
            normal: 2,
            low: 1,
          };

          const priorityDiff =
            rank[b.order.priority] - rank[a.order.priority];

          if (priorityDiff !== 0) return priorityDiff;

          return a.plan.sequence_no - b.plan.sequence_no;
        });

      setStages((stagesResult.data || []) as Stage[]);
      setItems(nextItems);
      setLoading(false);
    }

    void load();
  }, [employeeId]);

  if (loading || items.length === 0) return null;

  return (
    <section className="yf-card p-4 mb-3 border border-cyan-200 bg-cyan-50/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.14em] text-cyan-700">
            UPCOMING WORK
          </p>
          <h2 className="font-black text-slate-900 mt-1">
            આગળ તમારા Stageમાં આવનાર Orders
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Read-only preview • હાલ action કરવાની જરૂર નથી.
          </p>
        </div>

        <span className="yf-badge bg-cyan-100 text-cyan-800">
          {items.length} Upcoming
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {items.slice(0, 8).map(({ plan, order, role }) => (
          <article
            key={plan.id}
            className="rounded-2xl border border-cyan-100 bg-white p-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-cyan-800">
                    {order.order_number}
                  </span>
                  <span
                    className={`yf-badge ${priorityClass(
                      order.priority
                    )}`}
                  >
                    {order.priority.toUpperCase()}
                  </span>
                  <span className="yf-badge bg-slate-100 text-slate-700">
                    {role === "primary" ? "Primary" : "Support"}
                  </span>
                </div>

                <p className="font-black text-slate-900 mt-1">
                  {order.product_name} • Qty {order.quantity}
                </p>

                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Customer: {order.customer_name}
                </p>
              </div>

              <div className="sm:text-right">
                <p className="text-[10px] font-black text-slate-400">
                  YOUR UPCOMING STAGE
                </p>
                <p className="font-black text-cyan-800">
                  {stageMap.get(plan.stage_id) || "Stage"}
                </p>
                <p className="text-[10px] font-semibold text-slate-500 mt-1">
                  Current: {order.current_stage}
                  {order.due_date ? ` • Due ${order.due_date}` : ""}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
