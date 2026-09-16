"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Stage = {
  id: string;
  code: string;
  name: string;
};

type TemplateStage = {
  id: string;
  stage_id: string;
  sequence_no: number;
};

type StageWork = {
  id: string;
  stage_id: string;
  status: string;
  primary_employee_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  hold_reason: string | null;
  rework_reason: string | null;
  created_at: string | null;
};

type StageWorker = {
  order_stage_work_id: string;
  employee_id: string;
  left_at: string | null;
};

type Employee = {
  id: string;
  full_name: string;
};

function pretty(value: string) {
  if (value === "ready_for_approval") return "Submitted";
  if (value === "upcoming") return "Upcoming";

  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusClass(status: string) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  if (status === "ready_for_approval") return "bg-purple-100 text-purple-700";
  if (status === "assigned") return "bg-cyan-100 text-cyan-700";
  if (status === "hold") return "bg-amber-100 text-amber-800";
  if (status === "rework") return "bg-red-100 text-red-700";
  if (status === "waiting") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-600";
}

function formatDateTime(value: string | null) {
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

export default function AllWorkflowStages() {
  const params = useParams();
  const orderId = Array.isArray(params?.id)
    ? params.id[0]
    : typeof params?.id === "string"
    ? params.id
    : "";

  const [host, setHost] = useState<HTMLElement | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templateStages, setTemplateStages] = useState<TemplateStage[]>([]);
  const [works, setWorks] = useState<StageWork[]>([]);
  const [workers, setWorkers] = useState<StageWorker[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const containers = Array.from(
        document.querySelectorAll("main.yf-page > .yf-container")
      ) as HTMLElement[];

      const mainContainer = containers[containers.length - 1];
      if (!mainContainer) return;

      const mount = document.createElement("div");
      mount.dataset.yfAllStages = "true";

      if (mainContainer.lastElementChild) {
        mainContainer.insertBefore(mount, mainContainer.lastElementChild);
      } else {
        mainContainer.appendChild(mount);
      }

      setHost(mount);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      const mount = document.querySelector(
        '[data-yf-all-stages="true"]'
      );
      mount?.remove();
    };
  }, []);

  useEffect(() => {
    async function loadStages() {
      if (!orderId) {
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, workflow_template_id")
        .eq("id", orderId)
        .maybeSingle();

      if (orderError || !order) {
        setLoading(false);
        return;
      }

      const [stagesResult, worksResult] = await Promise.all([
        supabase
          .from("workflow_stages")
          .select("id, code, name")
          .order("sort_order", { ascending: true }),

        supabase
          .from("order_stage_work")
          .select(`
            id,
            stage_id,
            status,
            primary_employee_id,
            started_at,
            completed_at,
            hold_reason,
            rework_reason,
            created_at
          `)
          .eq("order_id", orderId)
          .order("created_at", { ascending: true }),
      ]);

      if (stagesResult.error || worksResult.error) {
        setLoading(false);
        return;
      }

      const workRows = (worksResult.data || []) as StageWork[];
      setStages((stagesResult.data || []) as Stage[]);
      setWorks(workRows);

      if (order.workflow_template_id) {
        const { data: templateData } = await supabase
          .from("workflow_template_stages")
          .select("id, stage_id, sequence_no")
          .eq("template_id", order.workflow_template_id)
          .order("sequence_no", { ascending: true });

        setTemplateStages((templateData || []) as TemplateStage[]);
      }

      const workIds = workRows.map((work) => work.id);
      let workerRows: StageWorker[] = [];

      if (workIds.length > 0) {
        const { data: workerData } = await supabase
          .from("order_stage_workers")
          .select("order_stage_work_id, employee_id, left_at")
          .in("order_stage_work_id", workIds);

        workerRows = (workerData || []) as StageWorker[];
        setWorkers(workerRows);
      }

      const employeeIds = Array.from(
        new Set([
          ...workRows
            .map((work) => work.primary_employee_id)
            .filter((id): id is string => Boolean(id)),
          ...workerRows.map((worker) => worker.employee_id),
        ])
      );

      if (employeeIds.length > 0) {
        const { data: employeeData } = await supabase
          .from("employees")
          .select("id, full_name")
          .in("id", employeeIds)
          .eq("is_hidden", false);

        setEmployees((employeeData || []) as Employee[]);
      }

      setLoading(false);
    }

    void loadStages();
  }, [orderId]);

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages]
  );

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees]
  );

  const workersByWork = useMemo(() => {
    const map = new Map<string, StageWorker[]>();

    for (const worker of workers) {
      const list = map.get(worker.order_stage_work_id) || [];
      list.push(worker);
      map.set(worker.order_stage_work_id, list);
    }

    return map;
  }, [workers]);

  const timeline = useMemo(() => {
    if (templateStages.length > 0) {
      return templateStages.map((templateStage) => ({
        key: templateStage.id,
        stageId: templateStage.stage_id,
        work:
          [...works]
            .reverse()
            .find((work) => work.stage_id === templateStage.stage_id) || null,
      }));
    }

    return works.map((work) => ({
      key: work.id,
      stageId: work.stage_id,
      work,
    }));
  }, [templateStages, works]);

  function teamNames(work: StageWork | null) {
    if (!work) return "Not Assigned Yet";

    const ids = new Set<string>();
    if (work.primary_employee_id) ids.add(work.primary_employee_id);

    for (const worker of workersByWork.get(work.id) || []) {
      if (!worker.left_at) ids.add(worker.employee_id);
    }

    const names = Array.from(ids).map(
      (id) => employeeMap.get(id) || "Employee"
    );

    return names.join(" + ") || "-";
  }

  if (!host) return null;

  return createPortal(
    <section className="yf-card mt-4 overflow-hidden">
      <div className="p-5 border-b border-slate-200">
        <p className="text-xs font-black tracking-[0.12em] text-cyan-700">
          COMPLETE WORKFLOW
        </p>
        <h2 className="text-xl font-black text-slate-900 mt-1">
          All Stages
        </h2>
        <p className="text-xs font-semibold text-slate-500 mt-1">
          Completed, Current અને Upcoming બધા Stage અહીં દેખાશે.
        </p>
      </div>

      <div className="p-4 sm:p-5 space-y-3">
        {loading && (
          <div className="py-8 text-center font-semibold text-slate-500">
            Workflow stages લોડ થઈ રહ્યા છે...
          </div>
        )}

        {!loading &&
          timeline.map((item, index) => {
            const work = item.work;
            const stage = stageMap.get(item.stageId);
            const status = work?.status || "upcoming";

            return (
              <article
                key={item.key}
                className={`rounded-2xl border p-4 ${
                  work
                    ? "border-slate-200 bg-white"
                    : "border-dashed border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-400">
                      STAGE {index + 1}
                    </p>
                    <h3 className="text-lg font-black text-slate-900 mt-1">
                      {stage?.name || "Workflow Stage"}
                    </h3>
                    <p className="text-sm font-semibold text-slate-500 mt-1">
                      Team: {teamNames(work)}
                    </p>
                  </div>

                  <span className={`yf-badge ${statusClass(status)}`}>
                    {pretty(status)}
                  </span>
                </div>

                {work && (
                  <div className="grid sm:grid-cols-3 gap-3 mt-4">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-black text-slate-400">
                        CREATED
                      </p>
                      <p className="text-sm font-bold mt-1">
                        {formatDateTime(work.created_at)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-black text-slate-400">
                        STARTED
                      </p>
                      <p className="text-sm font-bold mt-1">
                        {formatDateTime(work.started_at)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-black text-slate-400">
                        COMPLETED
                      </p>
                      <p className="text-sm font-bold mt-1">
                        {formatDateTime(work.completed_at)}
                      </p>
                    </div>
                  </div>
                )}

                {work?.hold_reason && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                    Hold: {work.hold_reason}
                  </div>
                )}

                {work?.rework_reason && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">
                    Rework: {work.rework_reason}
                  </div>
                )}
              </article>
            );
          })}

        {!loading && timeline.length === 0 && (
          <div className="py-8 text-center font-semibold text-slate-500">
            Workflow Stage data મળ્યો નથી.
          </div>
        )}
      </div>
    </section>,
    host
  );
}
