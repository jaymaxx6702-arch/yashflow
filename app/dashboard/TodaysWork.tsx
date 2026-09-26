"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type WorkflowStatus =
  | "waiting"
  | "assigned"
  | "in_progress"
  | "ready_for_approval"
  | "hold"
  | "rework";

type TaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "cancelled";

type StageWork = {
  id: string;
  order_id: string;
  stage_id: string;
  status: WorkflowStatus;
  primary_employee_id: string | null;
  started_at: string | null;
  hold_reason: string | null;
  rework_reason: string | null;
  created_at: string;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
};

type Stage = {
  id: string;
  name: string;
};

type Task = {
  id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: TaskStatus;
  due_date: string | null;
  employee_note: string | null;
  admin_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type Props = {
  employeeId: string;
};

function orderStatusLabel(status: WorkflowStatus) {
  if (status === "in_progress") return "In Progress";
  if (status === "ready_for_approval") return "Ready for Approval";
  if (status === "hold") return "Hold";
  if (status === "rework") return "Rework";
  if (status === "assigned") return "Assigned";
  return "Waiting";
}

function orderStatusClass(status: WorkflowStatus) {
  if (status === "in_progress") {
    return "bg-blue-100 text-blue-700";
  }

  if (status === "ready_for_approval") {
    return "bg-purple-100 text-purple-700";
  }

  if (status === "hold") {
    return "bg-amber-100 text-amber-800";
  }

  if (status === "rework") {
    return "bg-red-100 text-red-700";
  }

  if (status === "assigned") {
    return "bg-cyan-100 text-cyan-700";
  }

  return "bg-slate-100 text-slate-700";
}

function orderPriorityClass(priority: Order["priority"]) {
  if (priority === "urgent") {
    return "bg-red-100 text-red-700";
  }

  if (priority === "high") {
    return "bg-orange-100 text-orange-700";
  }

  if (priority === "low") {
    return "bg-slate-100 text-slate-600";
  }

  return "bg-blue-100 text-blue-700";
}

function taskPriorityClass(priority: Task["priority"]) {
  if (priority === "urgent") {
    return "bg-red-100 text-red-700";
  }

  if (priority === "high") {
    return "bg-orange-100 text-orange-700";
  }

  if (priority === "medium") {
    return "bg-blue-100 text-blue-700";
  }

  return "bg-slate-100 text-slate-600";
}

function taskStatusLabel(status: TaskStatus) {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function taskStatusClass(status: TaskStatus) {
  if (status === "in_progress") {
    return "bg-blue-100 text-blue-700";
  }

  if (status === "completed") {
    return "bg-green-100 text-green-700";
  }

  if (status === "cancelled") {
    return "bg-red-100 text-red-700";
  }

  return "bg-amber-100 text-amber-700";
}

function formatDate(date: string | null) {
  if (!date) return "Not Set";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function TodaysWork({ employeeId }: Props) {
  const router = useRouter();

  const [works, setWorks] = useState<StageWork[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [todayWorkOpen, setTodayWorkOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const tasksSectionRef = useRef<HTMLElement | null>(null);

  const stageMap = useMemo(
    () =>
      new Map(
        stages.map((stage) => [stage.id, stage.name])
      ),
    [stages]
  );

  const orderMap = useMemo(
    () =>
      new Map(
        orders.map((order) => [order.id, order])
      ),
    [orders]
  );

  const sortedWorks = useMemo(() => {
    const rank: Record<Order["priority"], number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    return [...works].sort((a, b) => {
      const orderA = orderMap.get(a.order_id);
      const orderB = orderMap.get(b.order_id);

      const priorityDiff =
        rank[orderB?.priority || "normal"] -
        rank[orderA?.priority || "normal"];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [works, orderMap]);

  const sortedTasks = useMemo(() => {
    const rank: Record<Task["priority"], number> = {
      urgent: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    return [...tasks].sort((a, b) => {
      const priorityDiff =
        rank[b.priority] - rank[a.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      if (a.due_date && b.due_date) {
        const dueDiff =
          new Date(a.due_date).getTime() -
          new Date(b.due_date).getTime();

        if (dueDiff !== 0) {
          return dueDiff;
        }
      }

      if (a.due_date && !b.due_date) {
        return -1;
      }

      if (!a.due_date && b.due_date) {
        return 1;
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [tasks]);

  const nextWork = useMemo(() => {
    type NextCandidate = {
      kind: "order" | "task";
      id: string;
      title: string;
      subtitle: string;
      priority: string;
      status: string;
      dueDate: string | null;
      score: number;
      reason: string;
      href: string;
    };

    const candidates: NextCandidate[] = [];
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();

    function dueScore(dueDate: string | null) {
      if (!dueDate) return { score: 0, reason: "" };

      const due = new Date(`${dueDate}T00:00:00`);
      if (Number.isNaN(due.getTime())) {
        return { score: 0, reason: "" };
      }

      const days = Math.floor(
        (due.getTime() - todayStart) / 86400000
      );

      if (days < 0) return { score: 160, reason: "Overdue" };
      if (days === 0) return { score: 130, reason: "Due Today" };
      if (days <= 2) return { score: 90, reason: "Due Soon" };
      if (days <= 7) return { score: 35, reason: "This Week" };
      return { score: 0, reason: "" };
    }

    for (const work of works) {
      if (!["assigned", "in_progress", "rework"].includes(work.status)) {
        continue;
      }

      const order = orderMap.get(work.order_id);
      if (!order) continue;

      const priorityScore =
        order.priority === "urgent"
          ? 400
          : order.priority === "high"
          ? 300
          : order.priority === "normal"
          ? 200
          : 100;

      const statusScore =
        work.status === "rework"
          ? 80
          : work.status === "in_progress"
          ? 60
          : 25;

      const due = dueScore(order.due_date);
      const reasons = [
        order.priority === "urgent"
          ? "Urgent"
          : order.priority === "high"
          ? "High Priority"
          : "",
        due.reason,
        work.status === "rework"
          ? "Rework"
          : work.status === "in_progress"
          ? "Already Started"
          : "",
      ].filter(Boolean);

      candidates.push({
        kind: "order",
        id: work.id,
        title: order.order_number,
        subtitle: `${order.product_name} • ${stageMap.get(work.stage_id) || "Stage"}`,
        priority: order.priority,
        status: orderStatusLabel(work.status),
        dueDate: order.due_date,
        score: priorityScore + statusScore + due.score,
        reason: reasons.join(" • ") || "Next Assigned Work",
        href: `/dashboard/orders/${order.id}`,
      });
    }

    for (const task of tasks) {
      if (!["pending", "in_progress"].includes(task.status)) continue;

      const priorityScore =
        task.priority === "urgent"
          ? 400
          : task.priority === "high"
          ? 300
          : task.priority === "medium"
          ? 200
          : 100;

      const statusScore = task.status === "in_progress" ? 60 : 25;
      const due = dueScore(task.due_date);
      const reasons = [
        task.priority === "urgent"
          ? "Urgent"
          : task.priority === "high"
          ? "High Priority"
          : "",
        due.reason,
        task.status === "in_progress" ? "Already Started" : "",
      ].filter(Boolean);

      candidates.push({
        kind: "task",
        id: task.id,
        title: task.title,
        subtitle: task.description || "Task",
        priority: task.priority,
        status: taskStatusLabel(task.status),
        dueDate: task.due_date,
        score: priorityScore + statusScore + due.score,
        reason: reasons.join(" • ") || "Next Assigned Work",
        href: "/dashboard/tasks",
      });
    }

    return candidates.sort((a, b) => b.score - a.score)[0] || null;
  }, [works, tasks, orderMap, stageMap]);

  async function loadWork() {
    const supabase = createClient();

    setLoading(true);
    setMessage("");

    const activeWorkStatuses = [
      "waiting",
      "assigned",
      "in_progress",
      "ready_for_approval",
      "hold",
      "rework",
    ];

    const activeTaskStatuses = ["pending", "in_progress"];

    const workSelect = `
      id,
      order_id,
      stage_id,
      status,
      primary_employee_id,
      started_at,
      hold_reason,
      rework_reason,
      created_at
    `;

    const taskSelect = `
      id,
      assigned_to,
      title,
      description,
      priority,
      status,
      due_date,
      employee_note,
      admin_note,
      started_at,
      completed_at,
      created_at
    `;

    const [
      primaryWorkResult,
      supportWorkLinkResult,
      primaryTaskResult,
      supportTaskLinkResult,
    ] = await Promise.all([
      supabase
        .from("order_stage_work")
        .select(workSelect)
        .eq("primary_employee_id", employeeId)
        .in("status", activeWorkStatuses),
      supabase
        .from("order_stage_workers")
        .select("order_stage_work_id")
        .eq("employee_id", employeeId)
        .is("left_at", null),
      supabase
        .from("tasks")
        .select(taskSelect)
        .eq("assigned_to", employeeId)
        .in("status", activeTaskStatuses),
      supabase
        .from("task_support_workers")
        .select("task_id")
        .eq("employee_id", employeeId)
        .eq("is_active", true),
    ]);

    const errors: string[] = [];

    const initialError =
      primaryWorkResult.error ||
      supportWorkLinkResult.error ||
      primaryTaskResult.error ||
      supportTaskLinkResult.error;

    if (initialError) {
      setMessage(`Today's Work Load Error: ${initialError.message}`);
      setWorks([]);
      setOrders([]);
      setStages([]);
      setTasks([]);
      setLoading(false);
      return;
    }

    const supportWorkIds = Array.from(
      new Set(
        (supportWorkLinkResult.data || [])
          .map((row) => row.order_stage_work_id)
          .filter(Boolean)
      )
    );

    const supportTaskIds = Array.from(
      new Set(
        (supportTaskLinkResult.data || [])
          .map((row) => row.task_id)
          .filter(Boolean)
      )
    );

    const [supportWorkResult, supportTaskResult] = await Promise.all([
      supportWorkIds.length > 0
        ? supabase
            .from("order_stage_work")
            .select(workSelect)
            .in("id", supportWorkIds)
            .in("status", activeWorkStatuses)
        : Promise.resolve({ data: [], error: null }),
      supportTaskIds.length > 0
        ? supabase
            .from("tasks")
            .select(taskSelect)
            .in("id", supportTaskIds)
            .in("status", activeTaskStatuses)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (supportWorkResult.error) {
      errors.push(`Support Order Work: ${supportWorkResult.error.message}`);
    }

    if (supportTaskResult.error) {
      errors.push(`Support Tasks: ${supportTaskResult.error.message}`);
    }

    const workMap = new Map<string, StageWork>();
    for (const work of [
      ...((primaryWorkResult.data || []) as StageWork[]),
      ...((supportWorkResult.data || []) as StageWork[]),
    ]) {
      workMap.set(work.id, work);
    }

    const visibleRows = Array.from(workMap.values()).sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    setWorks(visibleRows);

    if (visibleRows.length > 0) {
      const orderIds = Array.from(
        new Set(visibleRows.map((work) => work.order_id))
      );

      const stageIds = Array.from(
        new Set(visibleRows.map((work) => work.stage_id))
      );

      const [ordersResult, stagesResult] = await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            order_number,
            customer_name,
            product_name,
            quantity,
            priority,
            due_date
          `)
          .in("id", orderIds),
        supabase
          .from("workflow_stages")
          .select("id, name")
          .in("id", stageIds),
      ]);

      if (ordersResult.error) {
        errors.push(`Orders: ${ordersResult.error.message}`);
        setOrders([]);
      } else {
        setOrders((ordersResult.data || []) as Order[]);
      }

      if (stagesResult.error) {
        errors.push(`Stages: ${stagesResult.error.message}`);
        setStages([]);
      } else {
        setStages((stagesResult.data || []) as Stage[]);
      }
    } else {
      setOrders([]);
      setStages([]);
    }

    const taskMap = new Map<string, Task>();
    for (const task of [
      ...((primaryTaskResult.data || []) as Task[]),
      ...((supportTaskResult.data || []) as Task[]),
    ]) {
      taskMap.set(task.id, task);
    }

    setTasks(Array.from(taskMap.values()));

    if (errors.length > 0) {
      setMessage(`Today's Work Load Error: ${errors.join(" | ")}`);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadWork();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  useEffect(() => {
    function openTasksInline() {
      setTasksOpen(true);
      window.requestAnimationFrame(() => {
        tasksSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }

    window.addEventListener(
      "yashflow:open-employee-tasks",
      openTasksInline
    );

    return () => {
      window.removeEventListener(
        "yashflow:open-employee-tasks",
        openTasksInline
      );
    };
  }, []);

  const orderInProgress = works.filter(
    (work) =>
      work.status === "in_progress"
  ).length;

  const taskInProgress = tasks.filter(
    (task) =>
      task.status === "in_progress"
  ).length;

  const approvalPending = works.filter(
    (work) =>
      work.status ===
      "ready_for_approval"
  ).length;

  const totalInProgress =
    orderInProgress + taskInProgress;

  const totalActive =
    works.length + tasks.length;

  return (
    <>
      <section className="yf-card mt-5 overflow-hidden" id="todays-work">
        <button
          type="button"
          onClick={() => setTodayWorkOpen((current) => !current)}
          aria-expanded={todayWorkOpen}
          className="w-full text-left p-4 border-b border-slate-200 bg-white"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.15em] text-blue-700">
                TODAY&apos;S WORK
              </p>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                આજનું Pending Work
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                Assigned Orders અને priority work.
              </p>
            </div>

            <span className="shrink-0 text-xs font-black text-blue-700">
              {!loading ? `${totalActive} • ` : ""}
              {todayWorkOpen ? "Close ▲" : "Open ▼"}
            </span>
          </div>
        </button>

        {todayWorkOpen && (
          <div className="p-5 sm:p-6">
      {message && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {message}
        </div>
      )}

      {!loading && nextWork && (
        <button
          type="button"
          onClick={() => router.push(nextWork.href)}
          className="mt-5 w-full rounded-3xl border border-[#d4af37]/50 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 text-left shadow-sm transition hover:shadow-md active:scale-[0.995]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="yf-badge bg-slate-900 text-white">
                  NEXT WORK
                </span>
                <span className="yf-badge bg-amber-100 text-amber-800">
                  {nextWork.kind === "order" ? "ORDER" : "TASK"}
                </span>
                <span className="yf-badge bg-blue-100 text-blue-700">
                  {nextWork.reason}
                </span>
              </div>

              <h3 className="mt-3 text-xl font-black text-slate-900">
                {nextWork.title}
              </h3>
              <p className="mt-1 text-sm font-semibold text-slate-600 line-clamp-2">
                {nextWork.subtitle}
              </p>
              <p className="mt-2 text-xs font-bold text-slate-500">
                {nextWork.status}
                {nextWork.dueDate ? ` • Due: ${formatDate(nextWork.dueDate)}` : ""}
              </p>
            </div>

            <div className="yf-btn yf-btn-primary shrink-0">
              Open Next Work →
            </div>
          </div>
        </button>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
          <p className="text-xs font-black text-cyan-700">
            TOTAL ACTIVE
          </p>

          <p className="mt-1 text-2xl font-black text-cyan-900">
            {loading
              ? "..."
              : totalActive}
          </p>
        </div>

        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-black text-indigo-700">
            MY TASKS
          </p>

          <p className="mt-1 text-2xl font-black text-indigo-900">
            {loading
              ? "..."
              : tasks.length}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-black text-blue-700">
            IN PROGRESS
          </p>

          <p className="mt-1 text-2xl font-black text-blue-900">
            {loading
              ? "..."
              : totalInProgress}
          </p>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
          <p className="text-xs font-black text-purple-700">
            APPROVAL
          </p>

          <p className="mt-1 text-2xl font-black text-purple-900">
            {loading
              ? "..."
              : approvalPending}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.12em] text-slate-400">
              ORDERS
            </p>

            <h3 className="font-black text-slate-900">
              Assigned Orders
            </h3>
          </div>

          {!loading && (
            <span className="yf-badge bg-cyan-100 text-cyan-700">
              {works.length}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {!loading &&
            sortedWorks
              .slice(0, 4)
              .map((work) => {
                const order =
                  orderMap.get(
                    work.order_id
                  );

                if (!order) {
                  return null;
                }

                return (
                  <button
                    key={work.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        "/dashboard/orders"
                      )
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-blue-700">
                            {
                              order.order_number
                            }
                          </span>

                          <span
                            className={`yf-badge ${orderPriorityClass(
                              order.priority
                            )}`}
                          >
                            {order.priority.toUpperCase()}
                          </span>

                          <span
                            className={`yf-badge ${orderStatusClass(
                              work.status
                            )}`}
                          >
                            {orderStatusLabel(
                              work.status
                            )}
                          </span>
                        </div>

                        <p className="mt-2 font-black text-slate-900">
                          {
                            order.product_name
                          }
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {
                            order.customer_name
                          }
                          {" • "}
                          Qty:{" "}
                          {
                            order.quantity
                          }
                          {" • "}
                          Stage:{" "}
                          <span className="font-bold text-slate-700">
                            {stageMap.get(
                              work.stage_id
                            ) || "-"}
                          </span>
                        </p>

                        {order.due_date && (
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            Due:{" "}
                            {formatDate(
                              order.due_date
                            )}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-sm font-bold text-blue-700">
                        Open →
                      </div>
                    </div>
                  </button>
                );
              })}

          {!loading &&
            sortedWorks.length === 0 &&
            !message && (
              <div className="rounded-2xl border border-green-100 bg-green-50 p-5 text-center">
                <p className="font-black text-green-800">
                  હાલમાં કોઈ Assigned
                  Order Pending નથી ✅
                </p>
              </div>
            )}
        </div>
      </div>

          </div>
        )}
      </section>

      <section
        ref={tasksSectionRef}
        id="employee-tasks"
        className="yf-card mt-3 overflow-hidden scroll-mt-4"
      >
        <button
          type="button"
          onClick={() => setTasksOpen((current) => !current)}
          aria-expanded={tasksOpen}
          className="w-full text-left p-4 border-b border-slate-200 bg-white"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.15em] text-indigo-700">
                TASKS
              </p>
              <h2 className="text-xl font-black text-slate-900 mt-0.5">
                My Tasks
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                Assigned અને support tasks.
              </p>
            </div>

            <span className="shrink-0 text-xs font-black text-indigo-700">
              {!loading ? `${tasks.length} • ` : ""}
              {tasksOpen ? "Close ▲" : "Open ▼"}
            </span>
          </div>
        </button>

        {tasksOpen && (
          <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.12em] text-slate-400">
              TASKS
            </p>

            <h3 className="font-black text-slate-900">
              My Tasks
            </h3>
          </div>

          {!loading && (
            <span className="yf-badge bg-indigo-100 text-indigo-700">
              {tasks.length}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {!loading &&
            sortedTasks
              .slice(0, 4)
              .map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      "/dashboard/tasks"
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`yf-badge ${taskPriorityClass(
                            task.priority
                          )}`}
                        >
                          {task.priority.toUpperCase()}
                        </span>

                        <span
                          className={`yf-badge ${taskStatusClass(
                            task.status
                          )}`}
                        >
                          {taskStatusLabel(
                            task.status
                          )}
                        </span>
                      </div>

                      <p className="mt-2 font-black text-slate-900">
                        {task.title}
                      </p>

                      {task.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                          {
                            task.description
                          }
                        </p>
                      )}

                      <p className="mt-2 text-xs font-semibold text-slate-400">
                        Due:{" "}
                        {formatDate(
                          task.due_date
                        )}
                      </p>
                    </div>

                    <div className="shrink-0 text-sm font-bold text-indigo-700">
                      Open →
                    </div>
                  </div>
                </button>
              ))}

          {!loading &&
            sortedTasks.length === 0 &&
            !message && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center">
                <p className="font-black text-slate-600">
                  હાલમાં કોઈ Pending Task
                  નથી ✅
                </p>
              </div>
            )}
        </div>

        {!loading &&
          sortedTasks.length > 4 && (
            <button
              type="button"
              onClick={() =>
                router.push(
                  "/dashboard/tasks"
                )
              }
              className="mt-3 w-full rounded-xl py-2 text-sm font-black text-indigo-700 hover:bg-indigo-50"
            >
              View All Tasks →
            </button>
          )}
          </div>
        )}
      </section>
    </>
  );
}