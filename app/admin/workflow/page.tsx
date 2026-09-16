"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type TabKey = "stages" | "products" | "templates";

type Department = {
  id: number;
  name: string;
};

type Product = {
  id: string;
  name: string;
  is_active: boolean;
};

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  role: string | null;
};

type EmployeeDepartment = {
  employee_id: string;
  department_id: number;
  is_primary: boolean;
};

type Stage = {
  id: string;
  code: string;
  name: string;
  department_id: number | null;
  sort_order: number;
  is_active: boolean;
  requires_admin_approval: boolean;
  is_system: boolean;
};

type WorkflowMode = "auto" | "admin_controlled" | "manual";

type Template = {
  id: string;
  name: string;
  description: string | null;
  product_id: string | null;
  workflow_mode: WorkflowMode;
  is_default: boolean;
  is_active: boolean;
};

type AssignmentRule =
  | "manual"
  | "single_default"
  | "default_team"
  | "auto_assign";

type AutoMethod = "least_workload" | "round_robin";

type TemplateStage = {
  id: string;
  template_id: string;
  stage_id: string;
  sequence_no: number;
  approval_required: boolean;
  assignment_rule: AssignmentRule;
  default_employee_id: string | null;
  auto_method: AutoMethod;
  last_assigned_employee_id: string | null;
};

type TemplateStageWorker = {
  id: string;
  workflow_template_stage_id: string;
  employee_id: string;
  is_primary: boolean;
  sort_order: number;
};

type StageForm = {
  id?: string;
  name: string;
  code: string;
  department_id: string;
  requires_admin_approval: boolean;
  is_active: boolean;
};

const emptyStageForm: StageForm = {
  name: "",
  code: "",
  department_id: "",
  requires_admin_approval: false,
  is_active: true,
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function modeLabel(mode: WorkflowMode) {
  if (mode === "auto") return "Auto";
  if (mode === "manual") return "Manual / Custom";
  return "Admin Controlled";
}

export default function WorkflowSettingsPage() {
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("products");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeDepartments, setEmployeeDepartments] =
    useState<EmployeeDepartment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateStages, setTemplateStages] = useState<TemplateStage[]>([]);
  const [templateStageWorkers, setTemplateStageWorkers] =
    useState<TemplateStageWorker[]>([]);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const [stageForm, setStageForm] = useState<StageForm>(emptyStageForm);
  const [showStageForm, setShowStageForm] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const departmentMap = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments]
  );

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products]
  );

  const employeeMap = useMemo(
    () => new Map(employees.map((e) => [e.id, e.full_name])),
    [employees]
  );

  const stageMap = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages]
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  const selectedTemplateStages = useMemo(
    () =>
      templateStages
        .filter((x) => x.template_id === selectedTemplateId)
        .sort((a, b) => a.sequence_no - b.sequence_no),
    [templateStages, selectedTemplateId]
  );

  const productTemplate = useMemo(
    () =>
      templates.find(
        (t) =>
          t.product_id === selectedProductId &&
          t.is_active
      ) || null,
    [templates, selectedProductId]
  );

  const availableStages = useMemo(() => {
    const used = new Set(selectedTemplateStages.map((x) => x.stage_id));
    return stages.filter((s) => s.is_active && !used.has(s.id));
  }, [stages, selectedTemplateStages]);

  function workersForTemplateStage(templateStageId: string) {
    return templateStageWorkers
      .filter(
        (worker) =>
          worker.workflow_template_stage_id === templateStageId
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  function workerIdsForTemplateStage(templateStageId: string) {
    return workersForTemplateStage(templateStageId).map(
      (worker) => worker.employee_id
    );
  }

  function eligibleEmployeesForStage(stage?: Stage | null) {
    const base = employees.filter((employee) => {
      const role = (employee.role || "").trim().toLowerCase();
      const department = (employee.department || "").trim().toLowerCase();

      return role !== "admin" && department !== "admin";
    });

    if (!stage?.department_id) return base;

    const stageDepartmentName = (
      departmentMap.get(stage.department_id) || ""
    )
      .trim()
      .toLowerCase();

    return base.filter((employee) => {
      const hasDepartmentAssignment = employeeDepartments.some(
        (assignment) =>
          assignment.employee_id === employee.id &&
          assignment.department_id === stage.department_id
      );

      const legacyDepartmentMatch =
        stageDepartmentName &&
        (employee.department || "").trim().toLowerCase() ===
          stageDepartmentName;

      return hasDepartmentAssignment || legacyDepartmentMatch;
    });
  }


  async function loadAll() {
    const supabase = createClient();
    setMessage("");

    const [
      departmentsResult,
      employeesResult,
      employeeDepartmentsResult,
      productsResult,
      stagesResult,
      templatesResult,
      templateStagesResult,
      templateStageWorkersResult,
    ] = await Promise.all([
      supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        
        .order("sort_order", { ascending: true }),

      supabase
        .from("employees")
        .select("id, full_name, department, role")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_hidden", false)
        .order("full_name", { ascending: true }),

      supabase
        .from("employee_departments")
        .select("employee_id, department_id, is_primary"),

      supabase
        .from("products")
        .select("id, name, is_active")
        .eq("is_active", true)
        
        .order("name", { ascending: true }),

      supabase
        .from("workflow_stages")
        .select(`
          id,
          code,
          name,
          department_id,
          sort_order,
          is_active,
          requires_admin_approval,
          is_system
        `)
        .order("sort_order", { ascending: true }),

      supabase
        .from("workflow_templates")
        .select(`
          id,
          name,
          description,
          product_id,
          workflow_mode,
          is_default,
          is_active
        `)
        .order("created_at", { ascending: true }),

      supabase
        .from("workflow_template_stages")
        .select(`
          id,
          template_id,
          stage_id,
          sequence_no,
          approval_required,
          assignment_rule,
          default_employee_id,
          auto_method,
          last_assigned_employee_id
        `)
        .order("sequence_no", { ascending: true }),

      supabase
        .from("workflow_template_stage_workers")
        .select(`
          id,
          workflow_template_stage_id,
          employee_id,
          is_primary,
          sort_order
        `)
        .order("sort_order", { ascending: true }),
    ]);

    const firstError =
      departmentsResult.error ||
      employeesResult.error ||
      employeeDepartmentsResult.error ||
      productsResult.error ||
      stagesResult.error ||
      templatesResult.error ||
      templateStagesResult.error ||
      templateStageWorkersResult.error;

    if (firstError) {
      setMessage(`Load Error: ${firstError.message}`);
      return;
    }

    const departmentData = (departmentsResult.data || []) as Department[];
    const employeeData = (employeesResult.data || []) as Employee[];
    const employeeDepartmentData =
      (employeeDepartmentsResult.data || []) as EmployeeDepartment[];
    const productData = (productsResult.data || []) as Product[];
    const stageData = (stagesResult.data || []) as Stage[];
    const templateData = (templatesResult.data || []) as Template[];
    const templateStageData =
      (templateStagesResult.data || []) as TemplateStage[];
    const templateStageWorkerData =
      (templateStageWorkersResult.data || []) as TemplateStageWorker[];

    setDepartments(departmentData);
    setEmployees(employeeData);
    setEmployeeDepartments(employeeDepartmentData);
    setProducts(productData);
    setStages(stageData);
    setTemplates(templateData);
    setTemplateStages(templateStageData);
    setTemplateStageWorkers(templateStageWorkerData);

    setSelectedProductId((current) => {
      if (current && productData.some((p) => p.id === current)) {
        return current;
      }
      return productData[0]?.id || "";
    });

    setSelectedTemplateId((current) => {
      if (current && templateData.some((t) => t.id === current)) {
        return current;
      }
      const defaultTemplate =
        templateData.find((t) => t.is_default && t.is_active) ||
        templateData.find((t) => t.is_active);
      return defaultTemplate?.id || "";
    });
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

      const { data: adminProfile, error: adminError } =
        await supabase
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

      setAdminId(adminProfile.id);
      await loadAll();
      setLoading(false);
    }

    init();
  }, [router]);

  useEffect(() => {
    if (!selectedProductId) return;

    const existing = templates.find(
      (t) => t.product_id === selectedProductId && t.is_active
    );

    if (existing) {
      setSelectedTemplateId(existing.id);
    }
  }, [selectedProductId, templates]);

  function openAddStage() {
    setStageForm(emptyStageForm);
    setShowStageForm(true);
    setMessage("");
  }

  function openEditStage(stage: Stage) {
    setStageForm({
      id: stage.id,
      name: stage.name,
      code: stage.code,
      department_id: stage.department_id
        ? String(stage.department_id)
        : "",
      requires_admin_approval: stage.requires_admin_approval,
      is_active: stage.is_active,
    });

    setShowStageForm(true);
    setMessage("");
  }

  async function saveStage() {
    if (!stageForm.name.trim()) {
      setMessage("Stage Name જરૂરી છે.");
      return;
    }

    const stageCode =
      (stageForm.code.trim() || slugify(stageForm.name)).trim();

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    if (stageForm.id) {
      const { error } = await supabase
        .from("workflow_stages")
        .update({
          name: stageForm.name.trim(),
          code: stageCode,
          department_id: stageForm.department_id
            ? Number(stageForm.department_id)
            : null,
          requires_admin_approval:
            stageForm.requires_admin_approval,
          is_active: stageForm.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stageForm.id);

      if (error) {
        setMessage(`Stage Update Error: ${error.message}`);
        setSaving(false);
        return;
      }

      setMessage("Stage Updated ✅");
    } else {
      const nextSort =
        stages.length > 0
          ? Math.max(...stages.map((s) => s.sort_order)) + 10
          : 10;

      const { error } = await supabase
        .from("workflow_stages")
        .insert({
          name: stageForm.name.trim(),
          code: stageCode,
          department_id: stageForm.department_id
            ? Number(stageForm.department_id)
            : null,
          sort_order: nextSort,
          requires_admin_approval:
            stageForm.requires_admin_approval,
          is_active: stageForm.is_active,
          is_system: false,
        });

      if (error) {
        setMessage(`Stage Create Error: ${error.message}`);
        setSaving(false);
        return;
      }

      setMessage("New Stage Added ✅");
    }

    setShowStageForm(false);
    setStageForm(emptyStageForm);
    await loadAll();
    setSaving(false);
  }

  async function toggleStage(stage: Stage) {
    setActionId(stage.id);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_stages")
      .update({
        is_active: !stage.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", stage.id);

    if (error) {
      setMessage(`Stage Status Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setActionId(null);
  }

  async function createProductWorkflow() {
    if (!selectedProduct) return;

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const existing = templates.find(
      (t) => t.product_id === selectedProduct.id && t.is_active
    );

    if (existing) {
      setSelectedTemplateId(existing.id);
      setMessage("આ Product માટે Workflow પહેલેથી છે.");
      setSaving(false);
      return;
    }

    const { data: newTemplate, error } = await supabase
      .from("workflow_templates")
      .insert({
        name: `${selectedProduct.name} Workflow`,
        description: `${selectedProduct.name} માટે production workflow`,
        product_id: selectedProduct.id,
        workflow_mode: "auto",
        is_default: false,
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !newTemplate) {
      setMessage(`Workflow Create Error: ${error?.message || "Unknown error"}`);
      setSaving(false);
      return;
    }

    const defaultTemplate = templates.find(
      (t) => t.is_default && t.is_active
    );

    if (defaultTemplate) {
      const defaultStages = templateStages
        .filter((x) => x.template_id === defaultTemplate.id)
        .sort((a, b) => a.sequence_no - b.sequence_no);

      if (defaultStages.length > 0) {
        const payload = defaultStages.map((item) => ({
          template_id: newTemplate.id,
          stage_id: item.stage_id,
          sequence_no: item.sequence_no,
          is_required: true,
          auto_assign_department: true,
          approval_required: item.approval_required,
          assignment_rule: "manual",
          default_employee_id: null,
          auto_method: "least_workload",
          last_assigned_employee_id: null,
        }));

        const { error: copyError } = await supabase
          .from("workflow_template_stages")
          .insert(payload);

        if (copyError) {
          setMessage(
            `Workflow બન્યો, પણ default stages copy થયા નહીં: ${copyError.message}`
          );
          setSaving(false);
          await loadAll();
          setSelectedTemplateId(newTemplate.id);
          return;
        }
      }
    }

    await loadAll();
    setSelectedTemplateId(newTemplate.id);
    setMessage(`${selectedProduct.name} Workflow Created ✅`);
    setSaving(false);
  }

  async function updateTemplateMode(
    templateId: string,
    mode: WorkflowMode
  ) {
    setActionId(`mode-${templateId}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_templates")
      .update({
        workflow_mode: mode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId);

    if (error) {
      setMessage(`Workflow Mode Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage(`Workflow Mode: ${modeLabel(mode)} ✅`);
    setActionId(null);
  }

  async function addStageToSelectedTemplate(stageId: string) {
    if (!selectedTemplate) return;

    setActionId(`add-${stageId}`);
    setMessage("");

    const supabase = createClient();

    const nextSequence =
      selectedTemplateStages.length > 0
        ? Math.max(
            ...selectedTemplateStages.map((x) => x.sequence_no)
          ) + 10
        : 10;

    const stage = stageMap.get(stageId);

    const { error } = await supabase
      .from("workflow_template_stages")
      .insert({
        template_id: selectedTemplate.id,
        stage_id: stageId,
        sequence_no: nextSequence,
        is_required: true,
        auto_assign_department: true,
        approval_required:
          stage?.requires_admin_approval ?? false,
        assignment_rule: "manual",
        default_employee_id: null,
        auto_method: "least_workload",
        last_assigned_employee_id: null,
      });

    if (error) {
      setMessage(`Add Stage Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage("Stage Workflowમાં Added ✅");
    setActionId(null);
  }

  async function updateStageAssignmentRule(
    item: TemplateStage,
    rule: AssignmentRule
  ) {
    const selectedWorkers = workersForTemplateStage(item.id);
    const primary =
      selectedWorkers.find((worker) => worker.is_primary) ||
      selectedWorkers[0] ||
      null;

    setActionId(`assign-rule-${item.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_template_stages")
      .update({
        assignment_rule: rule,
        default_employee_id:
          rule === "single_default" || rule === "default_team"
            ? primary?.employee_id || null
            : null,
      })
      .eq("id", item.id);

    if (error) {
      setMessage(`Assignment Rule Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();

    if (
      (rule === "default_team" || rule === "auto_assign") &&
      selectedWorkers.length < 2
    ) {
      setMessage(
        "Rule selected ✅ હવે આ Stage માટે ઓછામાં ઓછા 2 eligible workers પસંદ કરો."
      );
    } else if (rule === "single_default" && selectedWorkers.length === 0) {
      setMessage(
        "Single Default selected ✅ હવે Default Worker પસંદ કરો."
      );
    } else {
      setMessage("Assignment Rule Updated ✅");
    }

    setActionId(null);
  }

  async function setSingleDefaultWorker(
    item: TemplateStage,
    employeeId: string
  ) {
    setActionId(`single-${item.id}`);
    setMessage("");

    const supabase = createClient();

    const { error: deleteError } = await supabase
      .from("workflow_template_stage_workers")
      .delete()
      .eq("workflow_template_stage_id", item.id);

    if (deleteError) {
      setMessage(`Default Worker Error: ${deleteError.message}`);
      setActionId(null);
      return;
    }

    if (!employeeId) {
      const { error } = await supabase
        .from("workflow_template_stages")
        .update({
          assignment_rule: "single_default",
          default_employee_id: null,
        })
        .eq("id", item.id);

      if (error) {
        setMessage(`Default Worker Error: ${error.message}`);
        setActionId(null);
        return;
      }

      await loadAll();
      setMessage("Default Worker cleared.");
      setActionId(null);
      return;
    }

    const { error: insertError } = await supabase
      .from("workflow_template_stage_workers")
      .insert({
        workflow_template_stage_id: item.id,
        employee_id: employeeId,
        is_primary: true,
        sort_order: 10,
      });

    if (insertError) {
      setMessage(`Default Worker Error: ${insertError.message}`);
      setActionId(null);
      return;
    }

    const { error: stageError } = await supabase
      .from("workflow_template_stages")
      .update({
        assignment_rule: "single_default",
        default_employee_id: employeeId,
      })
      .eq("id", item.id);

    if (stageError) {
      setMessage(`Default Worker Error: ${stageError.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage(
      `Default Worker: ${employeeMap.get(employeeId) || "Employee"} ✅`
    );
    setActionId(null);
  }

  async function toggleStageWorker(
    item: TemplateStage,
    employeeId: string
  ) {
    const currentWorkers = workersForTemplateStage(item.id);
    const existing = currentWorkers.find(
      (worker) => worker.employee_id === employeeId
    );

    setActionId(`worker-${item.id}-${employeeId}`);
    setMessage("");

    const supabase = createClient();

    if (existing) {
      const { error } = await supabase
        .from("workflow_template_stage_workers")
        .delete()
        .eq("id", existing.id);

      if (error) {
        setMessage(`Worker Remove Error: ${error.message}`);
        setActionId(null);
        return;
      }

      if (existing.is_primary) {
        const remaining = currentWorkers.filter(
          (worker) => worker.id !== existing.id
        );
        const nextPrimary = remaining[0] || null;

        if (nextPrimary) {
          await supabase
            .from("workflow_template_stage_workers")
            .update({ is_primary: true })
            .eq("id", nextPrimary.id);
        }

        await supabase
          .from("workflow_template_stages")
          .update({
            default_employee_id:
              item.assignment_rule === "single_default" ||
              item.assignment_rule === "default_team"
                ? nextPrimary?.employee_id || null
                : null,
            assignment_rule:
              item.assignment_rule !== "manual" && remaining.length === 0
                ? "manual"
                : item.assignment_rule,
          })
          .eq("id", item.id);
      }
    } else {
      if (item.assignment_rule === "single_default") {
        await supabase
          .from("workflow_template_stage_workers")
          .delete()
          .eq("workflow_template_stage_id", item.id);
      }

      const shouldBePrimary =
        item.assignment_rule === "single_default" ||
        currentWorkers.length === 0;

      const { error } = await supabase
        .from("workflow_template_stage_workers")
        .insert({
          workflow_template_stage_id: item.id,
          employee_id: employeeId,
          is_primary: shouldBePrimary,
          sort_order: (currentWorkers.length + 1) * 10,
        });

      if (error) {
        setMessage(`Worker Add Error: ${error.message}`);
        setActionId(null);
        return;
      }

      if (shouldBePrimary) {
        await supabase
          .from("workflow_template_stages")
          .update({
            default_employee_id:
              item.assignment_rule === "auto_assign"
                ? null
                : employeeId,
          })
          .eq("id", item.id);
      }
    }

    await loadAll();
    setMessage("Worker Selection Updated ✅");
    setActionId(null);
  }

  async function setPrimaryWorker(
    item: TemplateStage,
    employeeId: string
  ) {
    const selected = workerIdsForTemplateStage(item.id);

    if (!selected.includes(employeeId)) {
      setMessage("Primary Worker પહેલા Workers listમાં select કરો.");
      return;
    }

    setActionId(`primary-${item.id}`);
    setMessage("");

    const supabase = createClient();

    const { error: clearError } = await supabase
      .from("workflow_template_stage_workers")
      .update({ is_primary: false })
      .eq("workflow_template_stage_id", item.id);

    if (clearError) {
      setMessage(`Primary Worker Error: ${clearError.message}`);
      setActionId(null);
      return;
    }

    const { error: primaryError } = await supabase
      .from("workflow_template_stage_workers")
      .update({ is_primary: true })
      .eq("workflow_template_stage_id", item.id)
      .eq("employee_id", employeeId);

    if (primaryError) {
      setMessage(`Primary Worker Error: ${primaryError.message}`);
      setActionId(null);
      return;
    }

    const { error: stageError } = await supabase
      .from("workflow_template_stages")
      .update({ default_employee_id: employeeId })
      .eq("id", item.id);

    if (stageError) {
      setMessage(`Primary Worker Error: ${stageError.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage("Primary Worker Updated ✅");
    setActionId(null);
  }
async function updateStageApproval(
  item: TemplateStage,
  approvalRequired: boolean
) {
  setActionId(`approval-${item.id}`);
  setMessage("");

  const supabase = createClient();

  const { error } = await supabase
    .from("workflow_template_stages")
    .update({
      approval_required: approvalRequired,
    })
    .eq("id", item.id);

  if (error) {
    setMessage(`Approval Setting Error: ${error.message}`);
    setActionId(null);
    return;
  }

  await loadAll();

  setMessage(
    approvalRequired
      ? "આ Stage માટે Admin Approval Required ✅"
      : "આ Stage હવે Auto Progress માટે તૈયાર છે ✅"
  );

  setActionId(null);
}
  async function updateAutoMethod(
    item: TemplateStage,
    method: AutoMethod
  ) {
    setActionId(`auto-${item.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_template_stages")
      .update({ auto_method: method })
      .eq("id", item.id);

    if (error) {
      setMessage(`Auto Method Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage("Auto Assignment Method Updated ✅");
    setActionId(null);
  }

  async function applyDefaultAssignments() {
    const confirmed = window.confirm(
      "હાલના Open Unassigned Ordersમાં Product Workflow પ્રમાણે Worker/Team assign કરવો છે?"
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { data: works, error: workError } = await supabase
      .from("order_stage_work")
      .select("id, order_id, stage_id, status, primary_employee_id")
      .is("primary_employee_id", null)
      .in("status", [
        "waiting",
        "assigned",
        "in_progress",
        "ready_for_approval",
        "hold",
        "rework",
      ]);

    if (workError) {
      setMessage(`Unassigned Order Load Error: ${workError.message}`);
      setSaving(false);
      return;
    }

    if (!works?.length) {
      setMessage("કોઈ Open Unassigned Order મળ્યો નથી.");
      setSaving(false);
      return;
    }

    const orderIds = Array.from(new Set(works.map((work) => work.order_id)));

    const { data: orderRows, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number, workflow_template_id")
      .in("id", orderIds);

    if (orderError) {
      setMessage(`Order Workflow Load Error: ${orderError.message}`);
      setSaving(false);
      return;
    }

    const orderMap = new Map(
      (orderRows || []).map((order) => [order.id, order])
    );

    const { data: allActiveWorks } = await supabase
      .from("order_stage_work")
      .select("primary_employee_id")
      .not("primary_employee_id", "is", null)
      .in("status", [
        "waiting",
        "assigned",
        "in_progress",
        "ready_for_approval",
        "hold",
        "rework",
      ]);

    const workload = new Map<string, number>();
    for (const active of allActiveWorks || []) {
      if (!active.primary_employee_id) continue;
      workload.set(
        active.primary_employee_id,
        (workload.get(active.primary_employee_id) || 0) + 1
      );
    }

    let assignedCount = 0;

    for (const work of works) {
      const order = orderMap.get(work.order_id);
      const templateId = order?.workflow_template_id as string | null;

      if (!templateId) continue;

      const config = templateStages.find(
        (item) =>
          item.template_id === templateId &&
          item.stage_id === work.stage_id
      );

      if (!config || config.assignment_rule === "manual") continue;

      const selectedWorkers = workersForTemplateStage(config.id);
      if (!selectedWorkers.length) continue;

      let primaryId: string | null = null;
      let supportIds: string[] = [];

      if (config.assignment_rule === "single_default") {
        primaryId =
          config.default_employee_id ||
          selectedWorkers.find((worker) => worker.is_primary)?.employee_id ||
          selectedWorkers[0].employee_id;
      }

      if (config.assignment_rule === "default_team") {
        primaryId =
          config.default_employee_id ||
          selectedWorkers.find((worker) => worker.is_primary)?.employee_id ||
          selectedWorkers[0].employee_id;
        supportIds = selectedWorkers
          .map((worker) => worker.employee_id)
          .filter((employeeId) => employeeId !== primaryId);
      }

      if (config.assignment_rule === "auto_assign") {
        const candidateIds = selectedWorkers.map(
          (worker) => worker.employee_id
        );

        if (config.auto_method === "round_robin") {
          const lastIndex = candidateIds.indexOf(
            config.last_assigned_employee_id || ""
          );
          primaryId =
            candidateIds[(lastIndex + 1 + candidateIds.length) % candidateIds.length];
        } else {
          primaryId = [...candidateIds].sort((a, b) => {
            const diff = (workload.get(a) || 0) - (workload.get(b) || 0);
            if (diff !== 0) return diff;
            return (
              employeeMap.get(a)?.localeCompare(employeeMap.get(b) || "") || 0
            );
          })[0];
        }
      }

      if (!primaryId) continue;

      const now = new Date().toISOString();

      const { error: updateWorkError } = await supabase
        .from("order_stage_work")
        .update({
          primary_employee_id: primaryId,
          status: "assigned",
          updated_at: now,
        })
        .eq("id", work.id)
        .is("primary_employee_id", null);

      if (updateWorkError) continue;

      await supabase
        .from("order_stage_workers")
        .delete()
        .eq("order_stage_work_id", work.id);

      const teamRows = [
        {
          order_stage_work_id: work.id,
          employee_id: primaryId,
          worker_role: "primary",
        },
        ...supportIds.map((employeeId) => ({
          order_stage_work_id: work.id,
          employee_id: employeeId,
          worker_role: "support",
        })),
      ];

      await supabase.from("order_stage_workers").insert(teamRows);

      await supabase
        .from("orders")
        .update({
          workflow_status: "assigned",
          updated_at: now,
        })
        .eq("id", work.order_id);

      if (config.assignment_rule === "auto_assign") {
        workload.set(primaryId, (workload.get(primaryId) || 0) + 1);
        await supabase
          .from("workflow_template_stages")
          .update({ last_assigned_employee_id: primaryId })
          .eq("id", config.id);
        config.last_assigned_employee_id = primaryId;
      }

      await supabase.from("order_workflow_history").insert({
        order_id: work.order_id,
        order_stage_work_id: work.id,
        action_type:
          config.assignment_rule === "default_team"
            ? "default_team_assigned"
            : config.assignment_rule === "auto_assign"
            ? "auto_worker_assigned"
            : "default_worker_assigned",
        from_stage_id: work.stage_id,
        to_stage_id: work.stage_id,
        from_status: work.status,
        to_status: "assigned",
        employee_id: adminId,
        note: `Assigned: ${[
          primaryId,
          ...supportIds,
        ]
          .map((id) => employeeMap.get(id) || "Employee")
          .join(" + ")}`,
      });

      for (const employeeId of [primaryId, ...supportIds]) {
        await supabase.from("notifications").insert({
          employee_id: employeeId,
          notification_type: "order_assignment",
          title: "Order Assigned",
          message: `${order?.order_number || "Order"} તમને assign થયું છે.`,
          related_type: "order",
          related_id: work.order_id,
        });
      }

      assignedCount += 1;
    }

    await loadAll();
    setMessage(
      assignedCount > 0
        ? `${assignedCount} Unassigned Order(s)માં Worker/Team assign થયો ✅`
        : "કોઈ matching Worker configuration મળ્યું નથી."
    );
    setSaving(false);
  }

  async function removeStageFromSelectedTemplate(item: TemplateStage) {
    if (!selectedTemplate) return;

    const stage = stageMap.get(item.stage_id);

    const confirmed = window.confirm(
      `${stage?.name || "Stage"} ને આ Product Workflowમાંથી remove કરવો છે?`
    );

    if (!confirmed) return;

    setActionId(`remove-${item.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_template_stages")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(`Remove Stage Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage("Stage Workflowમાંથી Removed ✅");
    setActionId(null);
  }

  async function moveTemplateStage(
    index: number,
    direction: "up" | "down"
  ) {
    const list = selectedTemplateStages;
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= list.length
    ) {
      return;
    }

    const current = list[index];
    const target = list[targetIndex];

    setActionId(`move-${current.id}`);
    setMessage("");

    const supabase = createClient();
    const tempSequence = -100000 - index;

    const first = await supabase
      .from("workflow_template_stages")
      .update({ sequence_no: tempSequence })
      .eq("id", current.id);

    if (first.error) {
      setMessage(`Sequence Error: ${first.error.message}`);
      setActionId(null);
      return;
    }

    const second = await supabase
      .from("workflow_template_stages")
      .update({ sequence_no: current.sequence_no })
      .eq("id", target.id);

    if (second.error) {
      setMessage(`Sequence Error: ${second.error.message}`);
      setActionId(null);
      return;
    }

    const third = await supabase
      .from("workflow_template_stages")
      .update({ sequence_no: target.sequence_no })
      .eq("id", current.id);

    if (third.error) {
      setMessage(`Sequence Error: ${third.error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage("Stage Sequence Updated ✅");
    setActionId(null);
  }

  async function editTemplate(template: Template) {
    const newName = window.prompt(
      "Workflow Name બદલો:",
      template.name
    );

    if (newName === null) return;

    const cleanName = newName.trim();

    if (!cleanName) {
      setMessage("Workflow Name ખાલી ન હોઈ શકે.");
      return;
    }

    const newDescription = window.prompt(
      "Workflow Description બદલો:",
      template.description || ""
    );

    if (newDescription === null) return;

    setActionId(`edit-${template.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_templates")
      .update({
        name: cleanName,
        description: newDescription.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);

    if (error) {
      setMessage(`Workflow Edit Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setMessage("Workflow Updated ✅");
    setActionId(null);
  }

  async function deleteTemplate(template: Template) {
    if (template.is_default) {
      setMessage(
        "Default Standard Production workflow delete કરી શકાતો નથી. તેને edit કરી શકો."
      );
      return;
    }

    const supabase = createClient();

    const { count, error: countError } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("workflow_template_id", template.id);

    if (countError) {
      setMessage(`Workflow Usage Check Error: ${countError.message}`);
      return;
    }

    if ((count || 0) > 0) {
      setMessage(
        `આ Workflow ${count} Orderમાં ઉપયોગમાં છે, એટલે Delete નહીં થાય. Deactivate કરો.`
      );
      return;
    }

    const confirmed = window.confirm(
      `"${template.name}" Workflow permanently delete કરવો છે?`
    );

    if (!confirmed) return;

    setActionId(`delete-${template.id}`);
    setMessage("");

    const { error } = await supabase
      .from("workflow_templates")
      .delete()
      .eq("id", template.id);

    if (error) {
      setMessage(`Workflow Delete Error: ${error.message}`);
      setActionId(null);
      return;
    }

    if (selectedTemplateId === template.id) {
      setSelectedTemplateId("");
    }

    await loadAll();
    setMessage("Workflow Deleted ✅");
    setActionId(null);
  }

  async function toggleTemplate(template: Template) {
    setActionId(`template-${template.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("workflow_templates")
      .update({
        is_active: !template.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);

    if (error) {
      setMessage(`Template Status Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await loadAll();
    setActionId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Workflow Settings લોડ થઈ રહ્યું છે...
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
              YASHFLOW WORKFLOW V2
            </p>

            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Workflow Settings
            </h1>

            <p className="text-blue-100 text-sm font-semibold mt-1">
              Stage Master • Product Workflow • Templates
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
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <div className="yf-card p-2 flex flex-wrap gap-2 mb-5">
          {[
            ["products", "Product Workflow"],
            ["stages", "Stage Master"],
            ["templates", "Workflow Templates"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as TabKey)}
              className={`yf-btn ${
                tab === key
                  ? "yf-btn-primary"
                  : "yf-btn-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "products" && (
          <>
            <section className="yf-card p-5 sm:p-6">
              <div className="grid lg:grid-cols-2 gap-5">
                <div>
                  <p className="text-xs font-black tracking-[0.15em] text-cyan-700">
                    PRODUCT WORKFLOW
                  </p>

                  <h2 className="yf-section-title mt-1">
                    Product પસંદ કરો
                  </h2>

                  <p className="yf-section-subtitle mt-1">
                    દરેક Product માટે અલગ Stage Sequence અને Workflow Mode રાખી શકાય.
                  </p>

                  <select
                    value={selectedProductId}
                    onChange={(e) =>
                      setSelectedProductId(e.target.value)
                    }
                    className="yf-input mt-4"
                  >
                    {products.map((product) => (
                      <option
                        key={product.id}
                        value={product.id}
                      >
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  {productTemplate ? (
                    <>
                      <p className="text-xs font-black text-slate-500">
                        ACTIVE WORKFLOW
                      </p>

                      <h3 className="text-xl font-black text-slate-900 mt-1">
                        {productTemplate.name}
                      </h3>

                      <div className="mt-4">
                        <label className="block text-xs font-black text-slate-500 mb-2">
                          WORKFLOW MODE
                        </label>

                        <select
                          value={productTemplate.workflow_mode}
                          onChange={(e) =>
                            updateTemplateMode(
                              productTemplate.id,
                              e.target.value as WorkflowMode
                            )
                          }
                          className="yf-input"
                          disabled={
                            actionId === `mode-${productTemplate.id}`
                          }
                        >
                          <option value="admin_controlled">
                            Admin Controlled
                          </option>
                          <option value="auto">
                            Auto
                          </option>
                          <option value="manual">
                            Manual / Custom
                          </option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-black text-slate-900">
                        આ Product માટે Workflow નથી.
                      </p>

                      <p className="text-sm text-slate-500 mt-2">
                        Standard Productionને copy કરીને નવો Product Workflow બનાવો.
                      </p>

                      <button
                        type="button"
                        onClick={createProductWorkflow}
                        disabled={!selectedProduct || saving}
                        className="yf-btn yf-btn-primary mt-4 disabled:opacity-50"
                      >
                        {saving
                          ? "Creating..."
                          : "Create Product Workflow"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </section>

            {productTemplate && (
              <section className="yf-card p-5 sm:p-6 mt-5">
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                  <div>
                    <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                      CURRENT SEQUENCE
                    </p>

                    <h2 className="yf-section-title mt-1">
                      {selectedProduct?.name} Workflow
                    </h2>

                    <p className="yf-section-subtitle mt-1">
                      Stage sequence સાથે દરેક stageનો Default Worker પણ અહીં નક્કી કરો.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={applyDefaultAssignments}
                    disabled={saving}
                    className="yf-btn yf-btn-success disabled:opacity-50"
                  >
                    Apply Defaults to Unassigned Orders
                  </button>
                </div>

                <div className="space-y-3 mt-5">
                  {selectedTemplateStages.map((item, index) => {
                    const stage = stageMap.get(item.stage_id);

                    return (
                      <div
                        key={item.id}
                        className="yf-card p-4 bg-white"
                      >
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                            <div className="flex items-center gap-4 flex-1">
                              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black">
                                {index + 1}
                              </div>

                              <div>
                                <h3 className="font-black text-lg text-slate-900">
                                  {stage?.name || "Unknown Stage"}
                                </h3>

                                <p className="text-sm text-slate-500 mt-1">
                                  Department:{" "}
                                  <span className="font-bold">
                                    {stage?.department_id
                                      ? departmentMap.get(
                                          stage.department_id
                                        ) || "-"
                                      : "-"}
                                  </span>
                                  {" • "}
                                  Sequence: {item.sequence_no}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={
                                  index === 0 ||
                                  actionId === `move-${item.id}`
                                }
                                onClick={() =>
                                  moveTemplateStage(index, "up")
                                }
                                className="yf-btn yf-btn-secondary px-3 disabled:opacity-40"
                              >
                                ↑
                              </button>

                              <button
                                type="button"
                                disabled={
                                  index ===
                                    selectedTemplateStages.length - 1 ||
                                  actionId === `move-${item.id}`
                                }
                                onClick={() =>
                                  moveTemplateStage(index, "down")
                                }
                                className="yf-btn yf-btn-secondary px-3 disabled:opacity-40"
                              >
                                ↓
                              </button>

                              <button
                                type="button"
                                disabled={
                                  actionId === `remove-${item.id}`
                                }
                                onClick={() =>
                                  removeStageFromSelectedTemplate(item)
                                }
                                className="yf-btn bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                           <div
  className={`rounded-xl border p-3 ${
    item.approval_required
      ? "border-purple-200 bg-purple-50"
      : "border-green-200 bg-green-50"
  }`}
>
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div>
      <p
        className={`text-xs font-black ${
          item.approval_required
            ? "text-purple-700"
            : "text-green-700"
        }`}
      >
        STAGE COMPLETION
      </p>

      <p className="font-black text-slate-900 mt-1">
        {item.approval_required
          ? "Admin Approval Required"
          : "Auto Progress to Next Stage"}
      </p>

      <p className="text-xs text-slate-500 mt-1">
        {item.approval_required
          ? "Employee Ready for Approval કરશે; Admin approve કર્યા પછી next stage જશે."
          : "Employee Complete Stage કરશે અને next stage automatic શરૂ થશે."}
      </p>
    </div>

    <label className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 cursor-pointer shrink-0">
      <input
        type="checkbox"
        checked={item.approval_required}
        disabled={actionId === `approval-${item.id}`}
        onChange={(e) =>
          updateStageApproval(
            item,
            e.target.checked
          )
        }
        className="w-5 h-5"
      />

      <span className="font-bold text-sm">
        Require Approval
      </span>
    </label>
  </div>
</div>
                          <div className="bg-slate-50 rounded-2xl p-3 space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-black text-slate-500 mb-2">
                                  ASSIGNMENT RULE
                                </label>
                                <select
                                  value={item.assignment_rule || "manual"}
                                  disabled={actionId === `assign-rule-${item.id}`}
                                  onChange={(e) =>
                                    updateStageAssignmentRule(
                                      item,
                                      e.target.value as AssignmentRule
                                    )
                                  }
                                  className="yf-input"
                                >
                                  <option value="manual">
                                    Manual — Admin Assign
                                  </option>
                                  <option value="single_default">
                                    Single Default Worker
                                  </option>
                                  <option value="default_team">
                                    Default Team — All Selected Work Together
                                  </option>
                                  <option value="auto_assign">
                                    Auto Assign — Choose One from Team
                                  </option>
                                </select>
                              </div>

                              {item.assignment_rule === "single_default" ? (
                                <div>
                                  <label className="block text-xs font-black text-slate-500 mb-2">
                                    DEFAULT WORKER
                                  </label>
                                  <select
                                    value={item.default_employee_id || ""}
                                    disabled={actionId === `single-${item.id}`}
                                    onChange={(e) =>
                                      setSingleDefaultWorker(
                                        item,
                                        e.target.value
                                      )
                                    }
                                    className="yf-input"
                                  >
                                    <option value="">
                                      Select Default Worker
                                    </option>
                                    {eligibleEmployeesForStage(stage).map(
                                      (employee) => (
                                        <option
                                          key={employee.id}
                                          value={employee.id}
                                        >
                                          {employee.full_name}
                                          {employee.department
                                            ? ` — ${employee.department}`
                                            : ""}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              ) : item.assignment_rule === "auto_assign" ? (
                                <div>
                                  <label className="block text-xs font-black text-slate-500 mb-2">
                                    AUTO METHOD
                                  </label>
                                  <select
                                    value={item.auto_method || "least_workload"}
                                    onChange={(e) =>
                                      updateAutoMethod(
                                        item,
                                        e.target.value as AutoMethod
                                      )
                                    }
                                    className="yf-input"
                                  >
                                    <option value="least_workload">
                                      Least Workload — ઓછું pending કામ
                                    </option>
                                    <option value="round_robin">
                                      Round Robin — વારે વારે
                                    </option>
                                  </select>
                                </div>
                              ) : item.assignment_rule === "default_team" ? (
                                <div>
                                  <label className="block text-xs font-black text-slate-500 mb-2">
                                    PRIMARY WORKER
                                  </label>
                                  <select
                                    value={
                                      item.default_employee_id ||
                                      workersForTemplateStage(item.id).find(
                                        (worker) => worker.is_primary
                                      )?.employee_id ||
                                      ""
                                    }
                                    onChange={(e) =>
                                      setPrimaryWorker(item, e.target.value)
                                    }
                                    className="yf-input"
                                  >
                                    <option value="">
                                      Select Primary Worker
                                    </option>
                                    {workersForTemplateStage(item.id).map(
                                      (worker) => (
                                        <option
                                          key={worker.employee_id}
                                          value={worker.employee_id}
                                        >
                                          {employeeMap.get(worker.employee_id) ||
                                            "Employee"}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </div>
                              ) : (
                                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                                  Admin Orderમાંથી Worker manually assign કરશે.
                                </div>
                              )}
                            </div>

                            {item.assignment_rule !== "manual" && (
                              <div className="text-xs font-semibold text-slate-500">
                                Stage Department:{" "}
                                <span className="font-black text-slate-700">
                                  {stage?.department_id
                                    ? departmentMap.get(stage.department_id) || "-"
                                    : "-"}
                                </span>
                                {" • "}
                                Default/Team listમાં આ Departmentના Primary અથવા Additional members જ બતાવવામાં આવે છે.
                              </div>
                            )}

                            {(item.assignment_rule === "default_team" ||
                              item.assignment_rule === "auto_assign") && (
                              <div>
                                <div className="flex items-center justify-between gap-3 mb-2">
                                  <label className="block text-xs font-black text-slate-500">
                                    {item.assignment_rule === "auto_assign"
                                      ? "ELIGIBLE WORKERS"
                                      : "TEAM WORKERS"}
                                  </label>
                                  <span className="text-xs font-bold text-slate-400">
                                    Selected:{" "}
                                    {workerIdsForTemplateStage(item.id).length}
                                  </span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  {eligibleEmployeesForStage(stage).map(
                                    (employee) => {
                                      const checked =
                                        workerIdsForTemplateStage(
                                          item.id
                                        ).includes(employee.id);

                                      return (
                                        <label
                                          key={employee.id}
                                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer text-sm font-bold ${
                                            checked
                                              ? "bg-blue-50 border-blue-300 text-blue-800"
                                              : "bg-white border-slate-200 text-slate-700"
                                          }`}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            disabled={
                                              actionId ===
                                              `worker-${item.id}-${employee.id}`
                                            }
                                            onChange={() =>
                                              toggleStageWorker(
                                                item,
                                                employee.id
                                              )
                                            }
                                          />
                                          <span>
                                            {employee.full_name}
                                            {employee.department
                                              ? ` — ${employee.department}`
                                              : ""}
                                          </span>
                                        </label>
                                      );
                                    }
                                  )}
                                </div>

                                {eligibleEmployeesForStage(stage).length ===
                                  0 && (
                                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                    આ Stageના Departmentમાં approved active employee મળ્યો નથી. Employees pageમાં Department mapping ચેક કરો.
                                  </div>
                                )}

                                {item.assignment_rule === "default_team" && (
                                  <p className="text-xs text-slate-500 mt-2">
                                    ઓછામાં ઓછા 2 workers પસંદ કરો. બધા selected workers Order પર સાથે assign થશે.
                                  </p>
                                )}

                                {item.assignment_rule === "auto_assign" && (
                                  <p className="text-xs text-slate-500 mt-2">
                                    ઓછામાં ઓછા 2 eligible workers પસંદ કરો. System તેમાંથી એક worker પસંદ કરશે; Admin manually override કરી શકશે.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {selectedTemplateStages.length === 0 && (
                    <div className="py-10 text-center text-slate-400 font-semibold">
                      આ Product Workflowમાં Stage નથી.
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-slate-200 pt-5">
                  <h3 className="font-black text-slate-900">
                    Add Stage
                  </h3>

                  <div className="flex flex-wrap gap-2 mt-3">
                    {availableStages.map((stage) => (
                      <button
                        key={stage.id}
                        type="button"
                        disabled={
                          actionId === `add-${stage.id}`
                        }
                        onClick={() =>
                          addStageToSelectedTemplate(stage.id)
                        }
                        className="yf-btn yf-btn-secondary disabled:opacity-50"
                      >
                        + {stage.name}
                      </button>
                    ))}

                    {availableStages.length === 0 && (
                      <p className="text-sm text-slate-400">
                        બધા active stages workflowમાં છે.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {tab === "stages" && (
          <section className="yf-card p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-cyan-700">
                  STAGE MASTER
                </p>

                <h2 className="yf-section-title mt-1">
                  Reusable Production Stages
                </h2>

                <p className="yf-section-subtitle mt-1">
                  Stage અહીં એકવાર બનાવો; પછી Product Workflowમાં જરૂર પ્રમાણે ઉમેરો.
                </p>
              </div>

              <button
                type="button"
                onClick={openAddStage}
                className="yf-btn yf-btn-primary"
              >
                + Add Stage
              </button>
            </div>

            <div className="space-y-3 mt-6">
              {stages.map((stage, index) => (
                <div
                  key={stage.id}
                  className={`yf-card p-4 ${
                    stage.is_active
                      ? "bg-white"
                      : "bg-slate-50 opacity-70"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-black">
                        {index + 1}
                      </div>

                      <div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <h3 className="font-black text-lg">
                            {stage.name}
                          </h3>

                          <span
                            className={`yf-badge ${
                              stage.is_active
                                ? "yf-badge-green"
                                : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {stage.is_active
                              ? "Active"
                              : "Inactive"}
                          </span>

                          {stage.requires_admin_approval && (
                            <span className="yf-badge yf-badge-orange">
                              Admin Approval
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-slate-500 mt-1">
                          Department:{" "}
                          <span className="font-bold">
                            {stage.department_id
                              ? departmentMap.get(
                                  stage.department_id
                                ) || "-"
                              : "-"}
                          </span>
                          {" • "}
                          Code:{" "}
                          <span className="font-mono text-xs">
                            {stage.code}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditStage(stage)}
                        className="yf-btn yf-btn-secondary"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={actionId === stage.id}
                        onClick={() => toggleStage(stage)}
                        className={`yf-btn ${
                          stage.is_active
                            ? "bg-amber-500 text-white hover:bg-amber-600"
                            : "yf-btn-success"
                        } disabled:opacity-50`}
                      >
                        {stage.is_active
                          ? "Deactivate"
                          : "Activate"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "templates" && (
          <section className="yf-card p-5 sm:p-6">
            <div>
              <p className="text-xs font-black tracking-[0.15em] text-purple-700">
                WORKFLOW TEMPLATES
              </p>

              <h2 className="yf-section-title mt-1">
                All Workflows
              </h2>

              <p className="yf-section-subtitle mt-1">
                Standard + Product-specific workflows એક જ જગ્યાએ.
              </p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-6">
              {templates.map((template) => {
                const count = templateStages.filter(
                  (x) => x.template_id === template.id
                ).length;

                return (
                  <div
                    key={template.id}
                    className={`yf-card p-5 ${
                      template.is_active
                        ? "bg-white"
                        : "bg-slate-50 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-purple-700">
                          {template.is_default
                            ? "DEFAULT"
                            : "PRODUCT WORKFLOW"}
                        </p>

                        <h3 className="font-black text-lg mt-1">
                          {template.name}
                        </h3>

                        <p className="text-sm text-slate-500 mt-2">
                          Product:{" "}
                          <span className="font-bold text-slate-700">
                            {template.product_id
                              ? productMap.get(
                                  template.product_id
                                ) || "-"
                              : "All / Default"}
                          </span>
                        </p>

                        <p className="text-sm text-slate-500 mt-1">
                          Mode:{" "}
                          <span className="font-bold">
                            {modeLabel(
                              template.workflow_mode
                            )}
                          </span>
                        </p>

                        <p className="text-sm text-slate-500 mt-1">
                          Stages: {count}
                        </p>
                      </div>

                      <span
                        className={`yf-badge ${
                          template.is_active
                            ? "yf-badge-green"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {template.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button
                        type="button"
                        disabled={
                          actionId === `edit-${template.id}`
                        }
                        onClick={() => editTemplate(template)}
                        className="yf-btn yf-btn-secondary"
                      >
                        Edit
                      </button>

                      {!template.is_default ? (
                        <button
                          type="button"
                          disabled={
                            actionId === `template-${template.id}`
                          }
                          onClick={() => toggleTemplate(template)}
                          className="yf-btn yf-btn-secondary"
                        >
                          {template.is_active
                            ? "Deactivate"
                            : "Activate"}
                        </button>
                      ) : (
                        <div className="yf-btn bg-blue-50 text-blue-700 border border-blue-100 cursor-default">
                          Default
                        </div>
                      )}

                      {!template.is_default && (
                        <button
                          type="button"
                          disabled={
                            actionId === `delete-${template.id}`
                          }
                          onClick={() => deleteTemplate(template)}
                          className="yf-btn col-span-2 bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                        >
                          Delete Workflow
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {showStageForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl yf-card overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                  {stageForm.id
                    ? "EDIT STAGE"
                    : "NEW STAGE"}
                </p>

                <h3 className="text-2xl font-black mt-1">
                  {stageForm.id
                    ? "Stage Edit કરો"
                    : "નવો Stage ઉમેરો"}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setShowStageForm(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-black"
              >
                ✕
              </button>
            </div>

            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Stage Name
                </label>

                <input
                  type="text"
                  value={stageForm.name}
                  onChange={(e) =>
                    setStageForm((old) => ({
                      ...old,
                      name: e.target.value,
                      code: old.id
                        ? old.code
                        : slugify(e.target.value),
                    }))
                  }
                  placeholder="Quality Check"
                  className="yf-input"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Stage Code
                </label>

                <input
                  type="text"
                  value={stageForm.code}
                  onChange={(e) =>
                    setStageForm((old) => ({
                      ...old,
                      code: slugify(e.target.value),
                    }))
                  }
                  className="yf-input font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">
                  Department
                </label>

                <select
                  value={stageForm.department_id}
                  onChange={(e) =>
                    setStageForm((old) => ({
                      ...old,
                      department_id: e.target.value,
                    }))
                  }
                  className="yf-input"
                >
                  <option value="">
                    No Department
                  </option>

                  {departments.map((department) => (
                    <option
                      key={department.id}
                      value={department.id}
                    >
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-3 justify-end">
                <label className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={
                      stageForm.requires_admin_approval
                    }
                    onChange={(e) =>
                      setStageForm((old) => ({
                        ...old,
                        requires_admin_approval:
                          e.target.checked,
                      }))
                    }
                    className="w-5 h-5"
                  />
                  <span className="font-bold">
                    Admin Approval Required
                  </span>
                </label>

                <label className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stageForm.is_active}
                    onChange={(e) =>
                      setStageForm((old) => ({
                        ...old,
                        is_active: e.target.checked,
                      }))
                    }
                    className="w-5 h-5"
                  />
                  <span className="font-bold">
                    Active Stage
                  </span>
                </label>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowStageForm(false)}
                className="yf-btn yf-btn-secondary"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={saveStage}
                className="yf-btn yf-btn-primary disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : stageForm.id
                  ? "Save Changes"
                  : "Add Stage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
