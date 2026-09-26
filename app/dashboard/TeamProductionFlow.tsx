"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type FlowSummary = {
  activeOrders: number;
  activeTasks: number;
  totalTasks: number;
  completedTasks: number;
  completedToday: number;
};

type WorkloadRow = {
  employeeId: string;
  name: string;
  department: string | null;
  currentOrders: number;
  currentTasks: number;
  upcomingOrders: number;
};

type FlowItem = {
  type: "order" | "task";
  id: string;
  reference: string;
  title: string;
  quantity: number | null;
  priority: string;
  status: string;
  dueDate: string | null;
  currentStage: string;
  currentEmployees: string[];
  nextStage: string | null;
  nextEmployees: string[];
  updatedAt: string;
};

type FlowResponse = {
  ok: boolean;
  generatedAt: string;
  summary: FlowSummary;
  workload: WorkloadRow[];
  items: FlowItem[];
  error?: string;
};

function formatDueDate(value: string | null) {
  if (!value) return "No Due Date";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

function priorityClass(priority: string) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-blue-100 text-blue-700";
}

function statusLabel(status: string) {
  if (status === "in_progress") return "In Progress";
  if (status === "ready_for_approval") return "Ready for Approval";
  if (status === "assigned") return "Assigned";
  if (status === "waiting") return "Waiting";
  if (status === "hold") return "Hold";
  if (status === "rework") return "Rework";
  if (status === "pending") return "Pending";
  return status.replaceAll("_", " ");
}

export default function TeamProductionFlow() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FlowResponse | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return;

    try {
      const response = await fetch("/api/dashboard/team-flow", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as FlowResponse;

      if (!response.ok || !result.ok) {
        setMessage(result.error || "Team Production Flow load થયું નથી.");
        return;
      }

      setData(result);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Team Production Flow load થયું નથી."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 15000);

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void load();
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const orderItems = useMemo(
    () => data?.items.filter((item) => item.type === "order") || [],
    [data]
  );

  const taskItems = useMemo(
    () => data?.items.filter((item) => item.type === "task") || [],
    [data]
  );

  const summary = data?.summary;

  return (
    <section className="yf-card mt-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="w-full text-left p-4 border-b border-slate-200 bg-white"
      >
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.14em] text-emerald-700">
              TEAM PRODUCTION FLOW
            </p>
            <h3 className="text-lg font-black text-slate-900 mt-0.5">
              કોની પાસે શું કામ છે અને આગળ ક્યાં જશે
            </h3>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Read-only live view • દર 15 seconds refresh
            </p>
          </div>

          <span className="shrink-0 text-xs font-black text-emerald-700">
            {summary
              ? `${summary.activeOrders} Orders • ${summary.activeTasks} Tasks • `
              : ""}
            {open ? "Close ▲" : "Open ▼"}
          </span>
        </div>
      </button>

      {open && (
        <div className="p-4 sm:p-5 yf-collapse-body">
          {message && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
              {message}
            </div>
          )}

          {loading && !data ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="yf-skeleton h-16" />
                <div className="yf-skeleton h-16" />
                <div className="yf-skeleton h-16" />
                <div className="yf-skeleton h-16" />
                <div className="yf-skeleton h-16 col-span-2 sm:col-span-1" />
              </div>
              <div className="yf-skeleton h-24 w-full" />
              <div className="yf-skeleton h-24 w-full" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black text-slate-500">ACTIVE ORDERS</p>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {summary?.activeOrders ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black text-slate-500">ACTIVE TASKS</p>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {summary?.activeTasks ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-black text-slate-500">TOTAL TASKS</p>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {summary?.totalTasks ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                  <p className="text-[10px] font-black text-green-700">COMPLETED</p>
                  <p className="text-xl font-black text-green-900 mt-1">
                    {summary?.completedTasks ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-black text-blue-700">DONE TODAY</p>
                  <p className="text-xl font-black text-blue-900 mt-1">
                    {summary?.completedToday ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black tracking-[0.12em] text-violet-700">
                      TEAM LOAD
                    </p>
                    <h4 className="font-black text-slate-900 mt-0.5">
                      Employee-wise Workload
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    Now + Coming
                  </span>
                </div>

                {data?.workload.length ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
                    {data.workload.map((row) => (
                      <div
                        key={row.employeeId}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-900">
                              {row.name}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                              {row.department || "Department"}
                            </p>
                          </div>

                          {row.upcomingOrders > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-800">
                              +{row.upcomingOrders} Coming
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
                          <div className="rounded-lg bg-blue-50 px-2 py-2">
                            <p className="text-[9px] font-black text-blue-600">ORDERS</p>
                            <p className="font-black text-blue-900">{row.currentOrders}</p>
                          </div>
                          <div className="rounded-lg bg-violet-50 px-2 py-2">
                            <p className="text-[9px] font-black text-violet-600">TASKS</p>
                            <p className="font-black text-violet-900">{row.currentTasks}</p>
                          </div>
                          <div className="rounded-lg bg-amber-50 px-2 py-2">
                            <p className="text-[9px] font-black text-amber-700">NEXT</p>
                            <p className="font-black text-amber-900">{row.upcomingOrders}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-500 mt-3">
                    હાલમાં team workload નથી.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <p className="text-[10px] font-black tracking-[0.12em] text-blue-700">
                  ORDER PIPELINE
                </p>
                <h4 className="font-black text-slate-900 mt-0.5">
                  Current → Next
                </h4>

                {orderItems.length ? (
                  <div className="grid gap-3 mt-3">
                    {orderItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-900">
                              {item.reference} • {item.title}
                            </p>
                            <p className="text-xs font-semibold text-slate-500 mt-1">
                              Qty {item.quantity ?? "-"} • Due {formatDueDate(item.dueDate)}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black ${priorityClass(
                              item.priority
                            )}`}
                          >
                            {item.priority.toUpperCase()}
                          </span>
                        </div>

                        <div className="grid md:grid-cols-[1fr_auto_1fr] gap-2 items-stretch mt-3">
                          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                            <p className="text-[9px] font-black text-blue-600">CURRENT</p>
                            <p className="font-black text-blue-950 mt-1">
                              {item.currentStage}
                            </p>
                            <p className="text-xs font-bold text-blue-800 mt-1">
                              {item.currentEmployees.length
                                ? item.currentEmployees.join(", ")
                                : "Unassigned"}
                            </p>
                            <p className="text-[10px] font-bold text-blue-600 mt-1">
                              {statusLabel(item.status)}
                            </p>
                          </div>

                          <div className="hidden md:flex items-center justify-center text-xl font-black text-slate-400">
                            →
                          </div>

                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-[9px] font-black text-amber-700">NEXT</p>
                            <p className="font-black text-amber-950 mt-1">
                              {item.nextStage || "Final / No Next Stage"}
                            </p>
                            <p className="text-xs font-bold text-amber-800 mt-1">
                              {item.nextEmployees.length
                                ? item.nextEmployees.join(", ")
                                : item.nextStage
                                ? "Not Assigned"
                                : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-500 mt-3">
                    Active orders નથી.
                  </p>
                )}
              </div>

              <div className="mt-6">
                <p className="text-[10px] font-black tracking-[0.12em] text-violet-700">
                  ACTIVE TASKS
                </p>
                <h4 className="font-black text-slate-900 mt-0.5">
                  Team Tasks
                </h4>

                {taskItems.length ? (
                  <div className="grid sm:grid-cols-2 gap-2 mt-3">
                    {taskItems.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-black text-slate-900">
                              {item.title}
                            </p>
                            <p className="text-xs font-semibold text-slate-500 mt-1">
                              {item.currentEmployees.length
                                ? item.currentEmployees.join(", ")
                                : "Unassigned"}
                            </p>
                          </div>
                          <span className="text-[10px] font-black text-violet-700">
                            {statusLabel(item.status)}
                          </span>
                        </div>
                        <p className="text-[10px] font-semibold text-slate-400 mt-2">
                          Due {formatDueDate(item.dueDate)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-slate-500 mt-3">
                    Active team tasks નથી.
                  </p>
                )}
              </div>

              {data?.generatedAt && (
                <p className="text-[10px] font-semibold text-slate-400 mt-5 text-right">
                  Last sync:{" "}
                  {new Date(data.generatedAt).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
