"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type WorkflowMode = "auto" | "admin_controlled" | "manual";

type WorkflowStatus =
  | "waiting"
  | "assigned"
  | "in_progress"
  | "ready_for_approval"
  | "hold"
  | "rework"
  | "completed"
  | "cancelled";

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  current_stage: string;
  current_stage_id: string | null;
  workflow_template_id: string | null;
  workflow_mode: WorkflowMode;
  workflow_status: WorkflowStatus;
  priority: "low" | "normal" | "high" | "urgent";
  due_date: string | null;
  product_configuration: Record<string, string> | null;
};

type Stage = {
  id: string;
  code: string;
  name: string;
};

type StageWork = {
  id: string;
  order_id: string;
  stage_id: string;
  status: WorkflowStatus;
  primary_employee_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  hold_reason: string | null;
  rework_reason: string | null;
  proof_waived: boolean;
  proof_waiver_reason: string | null;
  proof_waived_at: string | null;
  created_at: string;
};

type StageWorker = {
  id: string;
  order_stage_work_id: string;
  employee_id: string;
  worker_role: "primary" | "support";
  left_at: string | null;
};

type TemplateStageConfig = {
  id: string;
  template_id: string;
  stage_id: string;
  approval_required: boolean;
};

type StageProof = {
  id: string;
  order_id: string;
  order_stage_work_id: string;
  stage_id: string;
  uploaded_by_employee_id: string;
  file_path: string;
  file_name: string;
  file_type: "photo" | "video";
  mime_type: string | null;
  file_size: number | null;
  locked_at: string | null;
  created_at: string;
};

type CompleteStageResult = {
  success?: boolean;
  action?: "ready_for_approval" | "next_stage_created" | "order_completed";
  next_stage_name?: string;
  status?: WorkflowStatus;
};

type EmployeeOrderTab = "assigned" | "in_progress" | "attention" | "all";

function statusLabel(status: WorkflowStatus) {
  if (status === "in_progress") return "In Progress";
  if (status === "ready_for_approval") return "Submitted";
  if (status === "hold") return "Hold";
  if (status === "rework") return "Rework";
  if (status === "assigned") return "Assigned";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";

  return "Waiting";
}

function statusClass(status: WorkflowStatus) {
  if (status === "in_progress") return "bg-blue-100 text-blue-700";

  if (status === "ready_for_approval") {
    return "bg-purple-100 text-purple-700";
  }

  if (status === "hold") return "bg-amber-100 text-amber-800";
  if (status === "rework") return "bg-red-100 text-red-700";
  if (status === "assigned") return "bg-cyan-100 text-cyan-700";
  if (status === "completed") return "bg-green-100 text-green-700";

  return "bg-slate-100 text-slate-700";
}

function priorityClass(priority: Order["priority"]) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";

  return "bg-blue-100 text-blue-700";
}

export default function EmployeeOrdersPage() {
  const router = useRouter();

  const hideStageProofUi = true;
  const hideApprovalUi = true;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [stageWorkers, setStageWorkers] = useState<StageWorker[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templateStageConfigs, setTemplateStageConfigs] = useState<
    TemplateStageConfig[]
  >([]);

  const [stageProofs, setStageProofs] = useState<StageProof[]>([]);
  const [uploadingWorkId, setUploadingWorkId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [orderTab, setOrderTab] = useState<EmployeeOrderTab>("assigned");
  const [searchText, setSearchText] = useState("");

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage])),
    [stages]
  );

  const employeeMap = useMemo(
    () => new Map(employees.map((emp) => [emp.id, emp.full_name])),
    [employees]
  );

  const teamByWork = useMemo(() => {
    const map = new Map<string, StageWorker[]>();

    for (const worker of stageWorkers) {
      if (worker.left_at) continue;

      const list = map.get(worker.order_stage_work_id) || [];
      list.push(worker);
      map.set(worker.order_stage_work_id, list);
    }

    return map;
  }, [stageWorkers]);

  const employeeWorkByOrder = useMemo(() => {
    const map = new Map<string, StageWork>();

    if (!employee) return map;

    const statusRank: Record<WorkflowStatus, number> = {
      in_progress: 100,
      assigned: 90,
      rework: 85,
      hold: 80,
      ready_for_approval: 70,
      waiting: 60,
      completed: 10,
      cancelled: 0,
    };

    for (const work of stageWorks) {
      const isPrimary = work.primary_employee_id === employee.id;
      const isSupport = (teamByWork.get(work.id) || []).some(
        (worker) => worker.employee_id === employee.id
      );

      if (!isPrimary && !isSupport) continue;

      const existing = map.get(work.order_id);

      if (
        !existing ||
        statusRank[work.status] > statusRank[existing.status] ||
        (statusRank[work.status] === statusRank[existing.status] &&
          new Date(work.created_at).getTime() >
            new Date(existing.created_at).getTime())
      ) {
        map.set(work.order_id, work);
      }
    }

    return map;
  }, [stageWorks, employee, teamByWork]);

  const proofsByWork = useMemo(() => {
    const map = new Map<string, StageProof[]>();

    for (const proof of stageProofs) {
      const list = map.get(proof.order_stage_work_id) || [];
      list.push(proof);
      map.set(proof.order_stage_work_id, list);
    }

    return map;
  }, [stageProofs]);

  const templateStageConfigMap = useMemo(() => {
    const map = new Map<string, TemplateStageConfig>();

    for (const config of templateStageConfigs) {
      map.set(`${config.template_id}:${config.stage_id}`, config);
    }

    return map;
  }, [templateStageConfigs]);

  function canEmployeeAct(work: StageWork) {
    if (!employee) return false;

    if (work.primary_employee_id === employee.id) {
      return true;
    }

    return (teamByWork.get(work.id) || []).some(
      (worker) => worker.employee_id === employee.id
    );
  }

  function stageNeedsApproval(order: Order, work: StageWork) {
    // Workflow V4 rule: AUTO never waits for Admin Approval.
    if (order.workflow_mode === "auto") return false;
    if (order.workflow_mode === "admin_controlled") return true;
    if (order.workflow_mode === "manual") return true;

    if (!order.workflow_template_id) return false;

    return (
      templateStageConfigMap.get(
        `${order.workflow_template_id}:${work.stage_id}`
      )?.approval_required ?? false
    );
  }

  async function loadData() {
    const supabase = createClient();

    const { data: workRows, error: workError } = await supabase
      .from("order_stage_work")
      .select(`
        id,
        order_id,
        stage_id,
        status,
        primary_employee_id,
        started_at,
        completed_at,
        hold_reason,
        rework_reason,
        proof_waived,
        proof_waiver_reason,
        proof_waived_at,
        created_at
      `)
      .in("status", [
        "waiting",
        "assigned",
        "in_progress",
        "ready_for_approval",
        "hold",
        "rework",
      ])
      .order("created_at", {
        ascending: false,
      });

    if (workError) {
      setMessage(`Assigned Work Load Error: ${workError.message}`);
      return;
    }

    const works = (workRows || []) as StageWork[];

    setStageWorks(works);

    if (!works.length) {
      setOrders([]);
      setStageWorkers([]);
      setStages([]);
      setEmployees([]);
      setTemplateStageConfigs([]);
      setStageProofs([]);
      return;
    }

    const orderIds = Array.from(new Set(works.map((work) => work.order_id)));
    const workIds = works.map((work) => work.id);

    const [
      ordersResult,
      workersResult,
      stagesResult,
      employeesResult,
      proofsResult,
    ] = await Promise.all([
      supabase
        .from("orders")
        .select(`
          id,
          order_number,
          customer_name,
          customer_mobile,
          product_name,
          quantity,
          current_stage,
          current_stage_id,
          workflow_template_id,
          workflow_mode,
          workflow_status,
          priority,
          due_date,
          product_configuration
        `)
        .in("id", orderIds),

      supabase
        .from("order_stage_workers")
        .select(`
          id,
          order_stage_work_id,
          employee_id,
          worker_role,
          left_at
        `)
        .in("order_stage_work_id", workIds),

      supabase.from("workflow_stages").select(`
          id,
          code,
          name
        `),

      supabase
        .from("employees")
        .select(`
          id,
          full_name,
          department
        `)
        .eq("approval_status", "approved")
        .eq("is_active", true),

      supabase
        .from("order_stage_proofs")
        .select(`
          id,
          order_id,
          order_stage_work_id,
          stage_id,
          uploaded_by_employee_id,
          file_path,
          file_name,
          file_type,
          mime_type,
          file_size,
          locked_at,
          created_at
        `)
        .in("order_stage_work_id", workIds)
        .order("created_at", {
          ascending: false,
        }),
    ]);

    const firstError =
      ordersResult.error ||
      workersResult.error ||
      stagesResult.error ||
      employeesResult.error ||
      proofsResult.error;

    if (firstError) {
      setMessage(`Employee Orders Load Error: ${firstError.message}`);
      return;
    }

    const orderRows = (ordersResult.data || []) as Order[];

    setOrders(orderRows);
    setStageWorkers((workersResult.data || []) as StageWorker[]);
    setStages((stagesResult.data || []) as Stage[]);
    setEmployees((employeesResult.data || []) as Employee[]);
    setStageProofs((proofsResult.data || []) as StageProof[]);

    const templateIds = Array.from(
      new Set(
        orderRows
          .map((order) => order.workflow_template_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (!templateIds.length) {
      setTemplateStageConfigs([]);
      return;
    }

    const { data: configRows, error: configError } = await supabase
      .from("workflow_template_stages")
      .select(`
        id,
        template_id,
        stage_id,
        approval_required
      `)
      .in("template_id", templateIds);

    if (configError) {
      console.warn(
        "Template stage approval config load failed:",
        configError.message
      );
      setTemplateStageConfigs([]);
      return;
    }

    setTemplateStageConfigs((configRows || []) as TemplateStageConfig[]);
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select(`
          id,
          full_name,
          department
        `)
        .eq("auth_user_id", user.id)
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .single();

      if (profileError || !profile) {
        router.replace("/");
        return;
      }

      setEmployee(profile as Employee);

      await loadData();

      setLoading(false);
    }

    init();
  }, [router]);

  function sanitizeFileName(value: string) {
    return value
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");
  }

  async function uploadStageProof(
    work: StageWork,
    order: Order,
    files: FileList | null
  ) {
    if (!employee || !files?.length) return;

    if (!canEmployeeAct(work)) {
      setMessage("આ Stage તમને assign થયેલો નથી.");
      return;
    }

    if (work.status !== "in_progress") {
      setMessage("Proof upload કરવા પહેલા Start Work કરો.");
      return;
    }

    setUploadingWorkId(work.id);
    setMessage("");

    const supabase = createClient();

    try {
      const existingProofs = proofsByWork.get(work.id) || [];
      let photoCount = existingProofs.filter(
        (proof) => proof.file_type === "photo"
      ).length;
      let videoCount = existingProofs.filter(
        (proof) => proof.file_type === "video"
      ).length;

      for (const file of Array.from(files)) {
        const isPhoto = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isPhoto && !isVideo) {
          throw new Error(
            `${file.name}: ફક્ત Photo અથવા Video upload કરી શકાય.`
          );
        }

        if (isPhoto && photoCount >= 3) {
          throw new Error(
            "એક Stage માટે maximum 3 Photos રાખી શકાય."
          );
        }

        if (isVideo && videoCount >= 1) {
          throw new Error(
            "એક Stage માટે maximum 1 Video રાખી શકાય."
          );
        }

        const maxBytes = isPhoto
          ? 5 * 1024 * 1024
          : 25 * 1024 * 1024;

        if (file.size > maxBytes) {
          throw new Error(
            isPhoto
              ? `${file.name}: Photo maximum 5 MB હોવો જોઈએ.`
              : `${file.name}: Video maximum 25 MB હોવો જોઈએ.`
          );
        }

        const safeName = sanitizeFileName(file.name);
        const randomId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}`;

        const filePath =
          `${employee.id}/${work.id}/${randomId}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from("workflow-proofs")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });

        if (uploadError) {
          throw new Error(
            `${file.name} Upload Error: ${uploadError.message}`
          );
        }

        const { error: metadataError } = await supabase
          .from("order_stage_proofs")
          .insert({
            order_id: order.id,
            order_stage_work_id: work.id,
            stage_id: work.stage_id,
            uploaded_by_employee_id: employee.id,
            file_path: filePath,
            file_name: file.name,
            file_type: isVideo ? "video" : "photo",
            mime_type: file.type || null,
            file_size: file.size,
          });

        if (metadataError) {
          await supabase.storage
            .from("workflow-proofs")
            .remove([filePath]);

          throw new Error(
            `${file.name} Proof Save Error: ${metadataError.message}`
          );
        }

        if (isPhoto) {
          photoCount += 1;
        } else {
          videoCount += 1;
        }
      }

      setMessage("Stage Proof Upload થયું ✅");
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Proof Upload Error."
      );
    } finally {
      setUploadingWorkId(null);
    }
  }

  async function removeStageProof(
    proof: StageProof,
    work: StageWork
  ) {
    if (!employee) return;

    if (proof.uploaded_by_employee_id !== employee.id) {
      setMessage("બીજા Employeeનું Proof remove કરી શકાતું નથી.");
      return;
    }

    if (proof.locked_at) {
      setMessage(
        "આ Proof lock થઈ ગયું છે. Submitted/Completed proof remove કરી શકાતું નથી."
      );
      return;
    }

    if (work.status !== "in_progress") {
      setMessage(
        "Proof ફક્ત In Progress Stage દરમિયાન remove કરી શકાય."
      );
      return;
    }

    const confirmed = window.confirm(
      `${proof.file_name} remove કરવું છે?`
    );

    if (!confirmed) return;

    setUploadingWorkId(work.id);
    setMessage("");

    const supabase = createClient();

    const { error: storageError } = await supabase.storage
      .from("workflow-proofs")
      .remove([proof.file_path]);

    if (storageError) {
      setMessage(`Proof Remove Error: ${storageError.message}`);
      setUploadingWorkId(null);
      return;
    }

    const { error: metadataError } = await supabase
      .from("order_stage_proofs")
      .delete()
      .eq("id", proof.id);

    if (metadataError) {
      setMessage(
        `Proof Metadata Remove Error: ${metadataError.message}`
      );
      setUploadingWorkId(null);
      return;
    }

    setMessage("Wrong Proof Removed ✅");
    await loadData();
    setUploadingWorkId(null);
  }

  async function openStageProof(proof: StageProof) {
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase.storage
      .from("workflow-proofs")
      .createSignedUrl(proof.file_path, 600);

    if (error || !data?.signedUrl) {
      setMessage(
        `Proof Open Error: ${error?.message || "Signed URL મળ્યો નથી."}`
      );
      return;
    }

    window.open(
      data.signedUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function startWork(work: StageWork) {
    if (!employee) return;

    if (!canEmployeeAct(work)) {
      setMessage("આ Order તમને assign થયેલો નથી.");
      return;
    }

    if (work.status !== "assigned" && work.status !== "rework") {
      setMessage(
        `આ Stage હાલમાં ${statusLabel(
          work.status
        )} statusમાં છે. Start Work કરી શકાતું નથી.`
      );
      return;
    }

    setActionId(`start-${work.id}`);
    setMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { data: updatedWork, error: workError } = await supabase
      .from("order_stage_work")
      .update({
        status: "in_progress",
        started_at: work.started_at || now,
        updated_at: now,
      })
      .eq("id", work.id)
      .eq("status", work.status)
      .select("id")
      .maybeSingle();

    if (workError) {
      setMessage(`Start Work Error: ${workError.message}`);
      setActionId(null);
      return;
    }

    if (!updatedWork) {
      setMessage("Stage update થઈ શક્યો નથી. Page refresh કરીને ફરી try કરો.");
      setActionId(null);
      return;
    }

    const { error: orderSyncError } = await supabase
      .from("orders")
      .update({
        workflow_status: "in_progress",
        updated_at: now,
      })
      .eq("id", work.order_id);

    if (orderSyncError) {
      console.warn(
        "Order workflow_status sync failed:",
        orderSyncError.message
      );
    }

    const { error: historyError } = await supabase
      .from("order_workflow_history")
      .insert({
        order_id: work.order_id,
        order_stage_work_id: work.id,
        action_type: "employee_started_work",
        from_stage_id: work.stage_id,
        to_stage_id: work.stage_id,
        from_status: work.status,
        to_status: "in_progress",
        employee_id: employee.id,
      });

    if (historyError) {
      console.warn("Workflow history insert failed:", historyError.message);
    }

    setMessage("Work Started ✅");
    await loadData();
    setActionId(null);
  }

  async function completeWithoutProofV3(
    work: StageWork,
    order: Order
  ) {
    if (!employee) return;

    if (!canEmployeeAct(work)) {
      setMessage("આ Order તમને assign થયેલો નથી.");
      return;
    }

    if (work.status !== "in_progress") {
      setMessage("ફક્ત In Progress Stage complete કરી શકાય.");
      return;
    }

    if (stageNeedsApproval(order, work)) {
      setMessage(
        "Approval Required Stageમાં Without Proof allowed નથી."
      );
      return;
    }

    const reason = window.prompt(
      "Photo Proof વગર Stage complete કરવાનું કારણ લખો:"
    );

    if (reason === null) return;

    if (!reason.trim()) {
      setMessage("Without Proof માટે Reason જરૂરી છે.");
      return;
    }

    const confirmed = window.confirm(
      "આ Auto Stage Photo Proof વગર complete થશે અને reason auditમાં save થશે. Continue?"
    );

    if (!confirmed) return;

    setActionId(`waive-${work.id}`);
    setMessage("");

    const supabase = createClient();

    const { error: waiveError } = await supabase.rpc(
      "employee_waive_stage_proof",
      {
        p_work_id: work.id,
        p_reason: reason.trim(),
      }
    );

    if (waiveError) {
      setMessage(`Without Proof Error: ${waiveError.message}`);
      setActionId(null);
      return;
    }

    const { data, error } = await supabase.rpc(
      "employee_complete_stage_v4",
      {
        p_work_id: work.id,
      }
    );

    if (error) {
      setMessage(`Complete Stage Error: ${error.message}`);
      setActionId(null);
      return;
    }

    const result = (data || {}) as CompleteStageResult;

    if (result.action === "order_completed") {
      setMessage(
        `${order.order_number} Completed Without Proof ✅`
      );
    } else if (result.action === "next_stage_created") {
      setMessage(
        result.next_stage_name
          ? `${order.order_number} → ${result.next_stage_name} Auto Progress ✅ (Proof Waived)`
          : "Next Stage Automatic શરૂ થયો ✅ (Proof Waived)"
      );
    } else {
      setMessage("Stage Completed Without Proof ✅");
    }

    await loadData();
    setActionId(null);
  }

  async function completeStageV3(work: StageWork, order: Order) {
    if (!employee) return;

    if (!canEmployeeAct(work)) {
      setMessage("આ Order તમને assign થયેલો નથી.");
      return;
    }

    if (work.status !== "in_progress") {
      setMessage("ફક્ત In Progress Stage complete કરી શકાય.");
      return;
    }

    const currentProofs = proofsByWork.get(work.id) || [];
    const hasPhotoProof = currentProofs.some(
      (proof) => proof.file_type === "photo"
    );

    if (!hasPhotoProof && hideStageProofUi) {
      const supabase = createClient();
      const { error: waiveError } = await supabase.rpc(
        "employee_waive_stage_proof",
        {
          p_work_id: work.id,
          p_reason: "Stage proof UI disabled by admin",
        }
      );

      if (waiveError) {
        setMessage(`Complete Stage Error: ${waiveError.message}`);
        return;
      }
    } else if (!hasPhotoProof) {
      setMessage(
        "Stage complete કરવા ઓછામાં ઓછો 1 Photo Proof ફરજિયાત છે."
      );
      return;
    }

    const needsApproval = stageNeedsApproval(order, work);

    const confirmed = window.confirm(
      "આ Stageનું કામ પૂર્ણ છે? Complete કરવું છે?"
    );

    if (!confirmed) return;

    setActionId(`complete-${work.id}`);
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase.rpc("employee_complete_stage_v4", {
      p_work_id: work.id,
    });

    if (error) {
      setMessage(`Complete Stage Error: ${error.message}`);
      setActionId(null);
      return;
    }

    const result = (data || {}) as CompleteStageResult;

    if (result.action === "ready_for_approval") {
      setMessage("Stage Submitted ✅");
    } else if (result.action === "order_completed") {
      setMessage(`${order.order_number} Completed ✅`);
    } else if (result.action === "next_stage_created") {
      setMessage(
        result.next_stage_name
          ? `${order.order_number} → ${result.next_stage_name} Auto Progress ✅`
          : "Next Stage Automatic શરૂ થયો ✅"
      );
    } else {
      setMessage("Stage Completed ✅");
    }

    await loadData();
    setActionId(null);
  }

  const myOrders = useMemo(() => {
    if (!employee) return [];

    return orders
      .filter((order) => {
        const work = employeeWorkByOrder.get(order.id);

        if (!work) return false;

        const isPrimary = work.primary_employee_id === employee.id;

        const isSupport = (teamByWork.get(work.id) || []).some(
          (worker) => worker.employee_id === employee.id
        );

        return isPrimary || isSupport;
      })
      .sort((a, b) => {
        const priorityRank: Record<Order["priority"], number> = {
          urgent: 4,
          high: 3,
          normal: 2,
          low: 1,
        };

        return priorityRank[b.priority] - priorityRank[a.priority];
      });
  }, [orders, employee, employeeWorkByOrder, teamByWork]);

  const assignedCount = myOrders.filter(
    (order) => employeeWorkByOrder.get(order.id)?.status === "assigned"
  ).length;

  const inProgressCount = myOrders.filter(
    (order) => employeeWorkByOrder.get(order.id)?.status === "in_progress"
  ).length;

  const readyCount = myOrders.filter(
    (order) => employeeWorkByOrder.get(order.id)?.status === "ready_for_approval"
  ).length;

  const attentionCount = myOrders.filter((order) => {
    const status = employeeWorkByOrder.get(order.id)?.status;
    return (
      status === "waiting" ||
      status === "ready_for_approval" ||
      status === "hold" ||
      status === "rework"
    );
  }).length;

  const filteredMyOrders = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return myOrders.filter((order) => {
      const status = employeeWorkByOrder.get(order.id)?.status;
      const searchMatch =
        !query ||
        order.order_number.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.product_name.toLowerCase().includes(query);

      let tabMatch = true;
      if (orderTab === "assigned") tabMatch = status === "assigned";
      if (orderTab === "in_progress") tabMatch = status === "in_progress";
      if (orderTab === "attention") {
        tabMatch =
          status === "waiting" ||
          status === "ready_for_approval" ||
          status === "hold" ||
          status === "rework";
      }

      return searchMatch && tabMatch;
    });
  }, [myOrders, searchText, orderTab, employeeWorkByOrder]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          My Orders લોડ થઈ રહ્યા છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black tracking-[0.15em] text-blue-100">
              YASHFLOW WORKFLOW V4
            </p>

            <h1 className="text-lg sm:text-xl font-black text-white mt-0.5">
              My Assigned Orders
            </h1>

            <p className="text-blue-100 text-[10px] sm:text-xs font-semibold mt-0.5">
              {employee?.full_name} • {employee?.department || "Employee"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <section className="yf-card p-3 sm:p-4 mb-3">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              ["assigned", "Assigned", assignedCount],
              ["in_progress", "In Progress", inProgressCount],
              ["attention", "Attention", attentionCount],
              ["all", "All", myOrders.length],
            ].map(([tab, label, count]) => (
              <button
                type="button"
                key={String(tab)}
                onClick={() => setOrderTab(tab as EmployeeOrderTab)}
                className={`rounded-xl border px-2 py-2.5 text-center ${
                  orderTab === tab
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <p className="text-[9px] sm:text-[10px] font-black leading-tight">
                  {label}
                </p>
                <p className="text-base sm:text-lg font-black mt-0.5">
                  {count}
                </p>
              </button>
            ))}
          </div>

          <input
            type="text"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search Order / Customer / Product..."
            className="yf-input mt-3"
          />

          {!hideApprovalUi && readyCount > 0 && (
            <p className="mt-2 text-[10px] font-black text-purple-700">
              {readyCount} item Admin Approval માટે pending છે.
            </p>
          )}
        </section>

        <section className="space-y-2">
          {filteredMyOrders.map((order) => {
            const work = employeeWorkByOrder.get(order.id);

            if (!work) return null;

            const stage = stageMap.get(work.stage_id);
            const team = teamByWork.get(work.id) || [];
            const teamNames = team
              .map((worker) => employeeMap.get(worker.employee_id))
              .filter(Boolean) as string[];

            const isPrimary = work.primary_employee_id === employee?.id;
            const canAct = canEmployeeAct(work);
            const needsApproval = stageNeedsApproval(order, work);
            const workProofs = proofsByWork.get(work.id) || [];
            const photoProofs = workProofs.filter(
              (proof) => proof.file_type === "photo"
            );
            const videoProofs = workProofs.filter(
              (proof) => proof.file_type === "video"
            );
            const hasPhotoProof = photoProofs.length > 0;

            return (
              <article key={order.id} className="yf-card p-3 sm:p-4">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                        className="text-base sm:text-lg font-black text-blue-700 hover:underline"
                      >
                        {order.order_number}
                      </button>

                      <span className={`yf-badge ${priorityClass(order.priority)}`}>
                        {order.priority.toUpperCase()}
                      </span>

                      <span className={`yf-badge ${statusClass(work.status)}`}>
                        {statusLabel(work.status)}
                      </span>

                      {!hideApprovalUi && work.status === "in_progress" && (
                        <span
                          className={`yf-badge ${
                            needsApproval
                              ? "bg-purple-100 text-purple-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {needsApproval ? "Approval Required" : "Auto Progress"}
                        </span>
                      )}
                    </div>

                    <h3 className="font-black text-sm sm:text-base text-slate-900 mt-1">
                      {order.product_name}
                    </h3>

                    <p className="text-xs text-slate-500 mt-1">
                      Customer:{" "}
                      <span className="font-bold text-slate-700">
                        {order.customer_name}
                      </span>
                      {" • "}
                      Qty:{" "}
                      <span className="font-bold text-slate-700">
                        {order.quantity}
                      </span>
                    </p>

                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <div className="rounded-xl bg-blue-50 p-2.5 min-w-0">
                        <p className="text-xs font-black text-blue-500">STAGE</p>
                        <p className="font-black text-blue-900 mt-1">
                          {stage?.name || order.current_stage}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-2.5 min-w-0">
                        <p className="text-xs font-black text-slate-400">ROLE</p>
                        <p className="font-black text-slate-800 mt-1">
                          {isPrimary ? "Primary Employee" : "Support Employee"}
                        </p>
                      </div>

                      <div className="rounded-xl bg-slate-50 p-2.5 min-w-0">
                        <p className="text-xs font-black text-slate-400">
                          DUE DATE
                        </p>
                        <p className="font-black text-slate-800 mt-1">
                          {order.due_date || "-"}
                        </p>
                      </div>
                    </div>

                    {teamNames.length > 0 && (
                      <p className="text-sm text-slate-500 mt-3">
                        Team:{" "}
                        <span className="font-bold text-slate-700">
                          {teamNames.join(" + ")}
                        </span>
                      </p>
                    )}

                    {work.started_at && (
                      <p className="text-xs text-slate-400 mt-2">
                        Started:{" "}
                        {new Date(work.started_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })}
                      </p>
                    )}

                    {!hideStageProofUi && (
                    <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50">
                      <summary className="cursor-pointer list-none px-3 py-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-black text-slate-700">
                          📎 Stage Proof • Photos {photoProofs.length} • Videos {videoProofs.length}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${
                          hasPhotoProof
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {hasPhotoProof ? "Photo Ready" : "Photo Required"}
                        </span>
                      </summary>

                      <div className="border-t border-slate-200 p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-xs font-black tracking-[0.12em] text-slate-500">
                            STAGE PROOF
                          </p>

                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span
                              className={`yf-badge ${
                                hasPhotoProof
                                  ? "bg-green-100 text-green-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              📷 Photo {hasPhotoProof ? "Ready" : "Required"}
                            </span>

                            <span className="yf-badge bg-blue-100 text-blue-700">
                              Photos {photoProofs.length}
                            </span>

                            <span className="yf-badge bg-purple-100 text-purple-700">
                              Videos {videoProofs.length}
                            </span>

                            {work.proof_waived && (
                              <span className="yf-badge bg-amber-100 text-amber-800">
                                ⚠ Proof Waived
                              </span>
                            )}
                          </div>

                          {work.proof_waived && work.proof_waiver_reason && (
                            <p className="text-xs font-bold text-amber-700 mt-2">
                              Reason: {work.proof_waiver_reason}
                            </p>
                          )}
                        </div>

                        {canAct && work.status === "in_progress" && (
                          <label
                            className={`yf-btn yf-btn-secondary cursor-pointer ${
                              uploadingWorkId === work.id
                                ? "opacity-50 pointer-events-none"
                                : ""
                            }`}
                          >
                            {uploadingWorkId === work.id
                              ? "Uploading..."
                              : "＋ Upload Proof"}

                            <input
                              type="file"
                              accept="image/*,video/mp4,video/webm,video/quicktime"
                              multiple
                              className="hidden"
                              disabled={uploadingWorkId === work.id}
                              onChange={(event) => {
                                void uploadStageProof(
                                  work,
                                  order,
                                  event.currentTarget.files
                                );
                                event.currentTarget.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>

                      {workProofs.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {workProofs.map((proof) => {
                            const canRemoveProof =
                              work.status === "in_progress" &&
                              !proof.locked_at &&
                              proof.uploaded_by_employee_id === employee?.id;

                            return (
                              <div
                                key={proof.id}
                                className="inline-flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white"
                              >
                                <button
                                  type="button"
                                  onClick={() => void openStageProof(proof)}
                                  className="px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                >
                                  {proof.file_type === "photo" ? "📷" : "🎥"}{" "}
                                  {proof.file_name}
                                </button>

                                {canRemoveProof && (
                                  <button
                                    type="button"
                                    disabled={uploadingWorkId === work.id}
                                    onClick={() =>
                                      void removeStageProof(proof, work)
                                    }
                                    className="border-l border-slate-200 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                                    title="Remove wrong proof"
                                  >
                                    ✕ Remove
                                  </button>
                                )}

                                {proof.locked_at && (
                                  <span
                                    className="border-l border-slate-200 px-2 py-2 text-xs"
                                    title="Submitted proof locked"
                                  >
                                    🔒
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {!hasPhotoProof && work.status === "in_progress" && (
                        <p className="text-xs font-bold text-red-600 mt-3">
                          Complete Stage / Ready for Approval પહેલાં ઓછામાં ઓછો 1 Photo upload ફરજિયાત છે.
                        </p>
                      )}
                      </div>
                    </details>
                    )}
                  </div>

                  <div className="grid grid-cols-2 lg:flex lg:flex-col gap-2 lg:min-w-[190px]">
                    {canAct &&
                      (work.status === "assigned" || work.status === "rework") && (
                        <button
                          type="button"
                          disabled={actionId === `start-${work.id}`}
                          onClick={() => startWork(work)}
                          className="yf-btn yf-btn-action disabled:opacity-50"
                        >
                          {actionId === `start-${work.id}`
                            ? "Starting..."
                            : "▶ Start Work"}
                        </button>
                      )}

                    {canAct && work.status === "in_progress" && (
                      <button
                        type="button"
                        disabled={actionId === `complete-${work.id}`}
                        onClick={() => completeStageV3(work, order)}
                        className="yf-btn yf-btn-success disabled:opacity-50"
                        title={undefined}
                      >
                        {actionId === `complete-${work.id}`
                          ? "Processing..."
                          : "✓ Complete Stage"}
                      </button>
                    )}

                    {!hideStageProofUi &&
                      canAct &&
                      work.status === "in_progress" &&
                      !needsApproval &&
                      !hasPhotoProof && (
                        <button
                          type="button"
                          disabled={actionId === `waive-${work.id}`}
                          onClick={() =>
                            completeWithoutProofV3(work, order)
                          }
                          className="yf-btn bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          {actionId === `waive-${work.id}`
                            ? "Processing..."
                            : "⚠ Complete Without Proof"}
                        </button>
                      )}

                    {work.status === "waiting" && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-bold text-amber-800">
                        Needs Assignment
                      </div>
                    )}

                    {!hideApprovalUi && work.status === "ready_for_approval" && (
                      <div className="rounded-xl bg-purple-50 border border-purple-100 px-4 py-3 text-sm font-bold text-purple-700">
                        Admin Approval Pending
                      </div>
                    )}

                    {work.status === "hold" && (
                      <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
                        Hold: {work.hold_reason || "-"}
                      </div>
                    )}

                    {!canAct && (
                      <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm font-bold text-red-700">
                        Action Not Allowed
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                      className="yf-btn yf-btn-secondary"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredMyOrders.length === 0 && (
            <div className="yf-card p-10 text-center">
              <p className="text-2xl">✅</p>
              <h3 className="font-black text-slate-900 mt-2">
                હાલમાં કોઈ Assigned Order નથી
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                નવું કામ assign થશે ત્યારે અહીં દેખાશે.
              </p>
            </div>
          )}
        </section>
      </div>

    </main>
  );
}
