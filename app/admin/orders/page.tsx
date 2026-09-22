"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import CreateOrderStagePlan, {
  type CreateStagePlanValue,
} from "./CreateOrderStagePlan";

type OrderSource =
  | "amazon"
  | "flipkart"
  | "website"
  | "whatsapp"
  | "offline"
  | "other";

type Priority = "low" | "normal" | "high" | "urgent";

type WorkflowMode = "auto" | "admin_controlled" | "manual";

type OrderTab = "new" | "production" | "attention" | "ready" | "all";

type WorkflowStatus =
  | "waiting"
  | "assigned"
  | "in_progress"
  | "ready_for_approval"
  | "hold"
  | "rework"
  | "completed"
  | "cancelled";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  order_source: OrderSource;
  current_stage: string;
  current_stage_id: string | null;
  workflow_template_id: string | null;
  workflow_mode: WorkflowMode;
  workflow_status: WorkflowStatus;
  priority: Priority;
  order_date: string;
  due_date: string | null;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
  completed_at: string | null;
  product_configuration?: Record<string, string> | null;
};

type Product = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  product_id: string;
  name: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
};

type OptionValue = {
  id: string;
  product_option_id: string;
  value: string;
  parent_value_id: string | null;
  sort_order: number;
  is_active: boolean;
};

type ValueDependency = {
  id: string;
  value_id: string;
  parent_value_id: string;
};

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  role: string | null;
};

type Department = {
  id: number;
  name: string;
};

type EmployeeDepartment = {
  employee_id: string;
  department_id: number;
  is_primary: boolean;
};

type WorkflowStage = {
  id: string;
  code: string;
  name: string;
  department_id: number | null;
  sort_order: number;
  is_active: boolean;
  requires_admin_approval: boolean;
};

type WorkflowTemplate = {
  id: string;
  name: string;
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

type WorkflowTemplateStage = {
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

type WorkflowTemplateStageWorker = {
  id: string;
  workflow_template_stage_id: string;
  employee_id: string;
  is_primary: boolean;
  sort_order: number;
};

type OrderStageWorker = {
  id: string;
  order_stage_work_id: string;
  employee_id: string;
  worker_role: "primary" | "support";
  joined_at: string;
  left_at: string | null;
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
  proof_waived_by_employee_id: string | null;
  proof_waived_at: string | null;
  created_at?: string | null;
  updated_at?: string | null;
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

type OrderPayment = {
  order_id: string;
  payment_amount: number | null;
  payment_status: "pending" | "partial" | "paid" | "refunded" | "not_applicable";
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

type PaymentForm = {
  payment_amount: string;
  payment_status: OrderPayment["payment_status"];
  payment_receiver_name: string;
  payment_note: string;
};

type BillingForm = {
  bill_created: boolean;
  bill_number: string;
  bill_date: string;
  billing_note: string;
};

type EditOrderForm = {
  customer_name: string;
  customer_mobile: string;
  quantity: string;
  priority: Priority;
  due_date: string;
  customer_note: string;
  admin_note: string;
};

const activeWorkStatuses: WorkflowStatus[] = [
  "waiting",
  "assigned",
  "in_progress",
  "ready_for_approval",
  "hold",
  "rework",
];

function formatStage(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\//g, " / ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusLabel(status: WorkflowStatus) {
  if (status === "in_progress") return "In Progress";
  if (status === "ready_for_approval") return "Ready for Approval";
  if (status === "hold") return "Hold";
  if (status === "rework") return "Rework";
  if (status === "assigned") return "Assigned";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Waiting";
}

function statusStyle(status: WorkflowStatus) {
  if (status === "completed") return "bg-green-100 text-green-700";
  if (status === "cancelled") return "bg-red-100 text-red-700";
  if (status === "hold") return "bg-amber-100 text-amber-800";
  if (status === "rework") return "bg-red-100 text-red-700";
  if (status === "ready_for_approval")
    return "bg-purple-100 text-purple-700";
  if (status === "in_progress") return "bg-blue-100 text-blue-700";
  if (status === "assigned") return "bg-cyan-100 text-cyan-700";
  return "bg-slate-100 text-slate-700";
}

function priorityStyle(priority: Priority) {
  if (priority === "urgent") return "bg-red-100 text-red-700";
  if (priority === "high") return "bg-orange-100 text-orange-700";
  if (priority === "low") return "bg-slate-100 text-slate-600";
  return "bg-blue-100 text-blue-700";
}

function indiaDateKey(value: string | null) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}

function orderNumericValue(orderNumber: string) {
  const match = orderNumber.trim().match(/^(?:YL-)?(\d+)$/i);

  if (!match) return null;

  const value = Number(match[1]);

  return Number.isFinite(value) ? value : null;
}

export default function AdminOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [optionValues, setOptionValues] = useState<OptionValue[]>([]);
  const [dependencies, setDependencies] = useState<ValueDependency[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employeeDepartments, setEmployeeDepartments] =
    useState<EmployeeDepartment[]>([]);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [workflowTemplates, setWorkflowTemplates] =
    useState<WorkflowTemplate[]>([]);
  const [workflowTemplateStages, setWorkflowTemplateStages] =
    useState<WorkflowTemplateStage[]>([]);
  const [workflowTemplateStageWorkers, setWorkflowTemplateStageWorkers] =
    useState<WorkflowTemplateStageWorker[]>([]);
  const [stageWorks, setStageWorks] = useState<StageWork[]>([]);
  const [orderStageWorkers, setOrderStageWorkers] =
    useState<OrderStageWorker[]>([]);
  const [selectedOrderProofs, setSelectedOrderProofs] = useState<StageProof[]>([]);
  const [proofLoading, setProofLoading] = useState(false);

  const [canViewPayments, setCanViewPayments] = useState(false);
  const [canManagePayments, setCanManagePayments] = useState(false);
  const [canManageBilling, setCanManageBilling] = useState(false);

  const [financeLoading, setFinanceLoading] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);

  const [selectedPayment, setSelectedPayment] =
    useState<OrderPayment | null>(null);
  const [selectedBilling, setSelectedBilling] =
    useState<OrderBilling | null>(null);

  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    payment_amount: "",
    payment_status: "pending",
    payment_receiver_name: "",
    payment_note: "",
  });

  const [billingForm, setBillingForm] = useState<BillingForm>({
    bill_created: false,
    bill_number: "",
    bill_date: "",
    billing_note: "",
  });

  const [showCreate, setShowCreate] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showStageProof, setShowStageProof] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showBilling, setShowBilling] = useState(false);

  const [workerSelection, setWorkerSelection] = useState("");
  const [stageSelection, setStageSelection] = useState("");

  const [searchText, setSearchText] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [orderTab, setOrderTab] = useState<OrderTab>("all");

  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedConfig, setSelectedConfig] =
    useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState("1");
  const [orderSource, setOrderSource] = useState<OrderSource>("other");
  const [priority, setPriority] = useState<Priority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [createStagePlanOverrides, setCreateStagePlanOverrides] =
    useState<CreateStagePlanValue>({});

  const [editForm, setEditForm] = useState<EditOrderForm>({
    customer_name: "",
    customer_mobile: "",
    quantity: "1",
    priority: "normal",
    due_date: "",
    customer_note: "",
    admin_note: "",
  });

  const [message, setMessage] = useState("");

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  const stageMap = useMemo(
    () => new Map(workflowStages.map((stage) => [stage.id, stage])),
    [workflowStages]
  );

  const stageCodeMap = useMemo(
    () => new Map(workflowStages.map((stage) => [stage.code, stage])),
    [workflowStages]
  );

  const departmentMap = useMemo(
    () => new Map(departments.map((department) => [department.id, department.name])),
    [departments]
  );

  function employeeDepartmentNames(employee: Employee) {
    const mapped = employeeDepartments
      .filter((assignment) => assignment.employee_id === employee.id)
      .map((assignment) => departmentMap.get(assignment.department_id))
      .filter(Boolean) as string[];

    const names = Array.from(
      new Set([
        ...(employee.department ? [employee.department] : []),
        ...mapped,
      ])
    );

    return names;
  }

  function eligibleEmployeesForOrder(order: Order) {
    const stage = getOrderStage(order);
    const base = employees.filter((employee) => employee.role !== "admin");

    if (!stage?.department_id) return base;

    const departmentName = (
      departmentMap.get(stage.department_id) || ""
    ).trim().toLowerCase();

    return base.filter((employee) => {
      const mappedMatch = employeeDepartments.some(
        (assignment) =>
          assignment.employee_id === employee.id &&
          assignment.department_id === stage.department_id
      );

      const legacyMatch =
        departmentName.length > 0 &&
        (employee.department || "").trim().toLowerCase() === departmentName;

      return mappedMatch || legacyMatch;
    });
  }

  const activeWorkByOrder = useMemo(() => {
    const map = new Map<string, StageWork>();

    for (const work of stageWorks) {
      if (
        activeWorkStatuses.includes(work.status) &&
        !map.has(work.order_id)
      ) {
        map.set(work.order_id, work);
      }
    }

    return map;
  }, [stageWorks]);

  function effectiveWorkflowStatus(order: Order): WorkflowStatus {
    return activeWorkByOrder.get(order.id)?.status || order.workflow_status;
  }

  const lastWorkedByOrder = useMemo(() => {
    const map = new Map<string, StageWork>();

    for (const work of stageWorks) {
      if (
        work.primary_employee_id &&
        !map.has(work.order_id)
      ) {
        map.set(work.order_id, work);
      }
    }

    return map;
  }, [stageWorks]);

  const stageWorkerLinksByWork = useMemo(() => {
    const map = new Map<string, OrderStageWorker[]>();

    for (const link of orderStageWorkers) {
      const current = map.get(link.order_stage_work_id) || [];
      current.push(link);
      map.set(link.order_stage_work_id, current);
    }

    return map;
  }, [orderStageWorkers]);

  const selectedProofsByWork = useMemo(() => {
    const map = new Map<string, StageProof[]>();

    for (const proof of selectedOrderProofs) {
      const list = map.get(proof.order_stage_work_id) || [];
      list.push(proof);
      map.set(proof.order_stage_work_id, list);
    }

    return map;
  }, [selectedOrderProofs]);

  function configuredWorkersForTemplateStage(templateStageId: string) {
    return workflowTemplateStageWorkers
      .filter(
        (worker) =>
          worker.workflow_template_stage_id === templateStageId
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  function getAssignmentPlan(item: WorkflowTemplateStage | undefined) {
    if (!item || item.assignment_rule === "manual") {
      return {
        primaryId: null as string | null,
        supportIds: [] as string[],
        assignedIds: [] as string[],
      };
    }

    const selectedWorkers = configuredWorkersForTemplateStage(item.id);
    const candidateIds = selectedWorkers.map((worker) => worker.employee_id);

    if (!candidateIds.length) {
      return {
        primaryId: null as string | null,
        supportIds: [] as string[],
        assignedIds: [] as string[],
      };
    }

    if (item.assignment_rule === "single_default") {
      const primaryId =
        item.default_employee_id ||
        selectedWorkers.find((worker) => worker.is_primary)?.employee_id ||
        candidateIds[0];

      return {
        primaryId,
        supportIds: [] as string[],
        assignedIds: [primaryId],
      };
    }

    if (item.assignment_rule === "default_team") {
      const primaryId =
        item.default_employee_id ||
        selectedWorkers.find((worker) => worker.is_primary)?.employee_id ||
        candidateIds[0];
      const supportIds = candidateIds.filter((id) => id !== primaryId);

      return {
        primaryId,
        supportIds,
        assignedIds: [primaryId, ...supportIds],
      };
    }

    let primaryId: string;

    if (item.auto_method === "round_robin") {
      const lastIndex = candidateIds.indexOf(
        item.last_assigned_employee_id || ""
      );
      primaryId =
        candidateIds[(lastIndex + 1 + candidateIds.length) % candidateIds.length];
    } else {
      const workload = new Map<string, number>();
      for (const candidateId of candidateIds) {
        workload.set(candidateId, 0);
      }
      for (const work of stageWorks) {
        if (
          activeWorkStatuses.includes(work.status) &&
          work.primary_employee_id &&
          workload.has(work.primary_employee_id)
        ) {
          workload.set(
            work.primary_employee_id,
            (workload.get(work.primary_employee_id) || 0) + 1
          );
        }
      }

      primaryId = [...candidateIds].sort((a, b) => {
        const diff = (workload.get(a) || 0) - (workload.get(b) || 0);
        if (diff !== 0) return diff;
        return (
          (employeeMap.get(a)?.full_name || "").localeCompare(
            employeeMap.get(b)?.full_name || ""
          )
        );
      })[0];
    }

    return {
      primaryId,
      supportIds: [] as string[],
      assignedIds: [primaryId],
    };
  }

  function getCreateDefaultPlan(
    item: WorkflowTemplateStage | undefined
  ) {
    if (!item) {
      return {
        primaryId: null as string | null,
        supportIds: [] as string[],
        assignedIds: [] as string[],
      };
    }

    if (item.assignment_rule !== "manual") {
      return getAssignmentPlan(item);
    }

    const selectedWorkers =
      configuredWorkersForTemplateStage(item.id);

    if (!selectedWorkers.length) {
      return {
        primaryId: null as string | null,
        supportIds: [] as string[],
        assignedIds: [] as string[],
      };
    }

    const primaryId =
      item.default_employee_id ||
      selectedWorkers.find((worker) => worker.is_primary)
        ?.employee_id ||
      selectedWorkers[0].employee_id;

    const supportIds = selectedWorkers
      .map((worker) => worker.employee_id)
      .filter((id) => id !== primaryId);

    return {
      primaryId,
      supportIds,
      assignedIds: [primaryId, ...supportIds],
    };
  }

  function createWorkflowForSelectedProduct() {
    if (!selectedProductId) return null;

    return (
      workflowTemplates.find(
        (template) =>
          template.product_id === selectedProductId &&
          template.is_active
      ) ||
      workflowTemplates.find(
        (template) =>
          template.is_default && template.is_active
      ) ||
      null
    );
  }

  function createTemplateSequence() {
    const workflow = createWorkflowForSelectedProduct();
    if (!workflow) return [];

    return workflowTemplateStages
      .filter((item) => item.template_id === workflow.id)
      .sort((a, b) => a.sequence_no - b.sequence_no);
  }

  function createStagePlannerRows() {
    return createTemplateSequence()
      .map((item) => {
        const stage = stageMap.get(item.stage_id);
        if (!stage) return null;

        const defaults = getCreateDefaultPlan(item);

        return {
          templateStageId: item.id,
          stageId: item.stage_id,
          stageName: stage.name,
          departmentName: stage.department_id
            ? departmentMap.get(stage.department_id) || null
            : null,
          sequenceNo: item.sequence_no,
          defaultPrimaryId: defaults.primaryId,
          defaultSupportIds: defaults.supportIds,
        };
      })
      .filter(
        (item): item is NonNullable<typeof item> => Boolean(item)
      );
  }

  function createPlannerEmployees() {
    return employees
      .filter((employee) => employee.role !== "admin")
      .map((employee) => ({
        id: employee.id,
        full_name: employee.full_name,
        department: employee.department,
        departmentNames: employeeDepartmentNames(employee),
      }));
  }

  async function saveAssignedTeam(
    workId: string,
    primaryId: string | null,
    supportIds: string[]
  ) {
    const supabase = createClient();

    await supabase
      .from("order_stage_workers")
      .delete()
      .eq("order_stage_work_id", workId);

    if (!primaryId) return;

    const rows = [
      {
        order_stage_work_id: workId,
        employee_id: primaryId,
        worker_role: "primary",
      },
      ...supportIds.map((employeeId) => ({
        order_stage_work_id: workId,
        employee_id: employeeId,
        worker_role: "support",
      })),
    ];

    await supabase.from("order_stage_workers").insert(rows);
  }

  function resetFinancialForms() {
    setSelectedPayment(null);
    setSelectedBilling(null);

    setPaymentForm({
      payment_amount: "",
      payment_status: "pending",
      payment_receiver_name: "",
      payment_note: "",
    });

    setBillingForm({
      bill_created: false,
      bill_number: "",
      bill_date: "",
      billing_note: "",
    });
  }

  async function loadOrderFinancials(orderId: string) {
    if (
      !canViewPayments &&
      !canManagePayments &&
      !canManageBilling
    ) {
      resetFinancialForms();
      return;
    }

    setFinanceLoading(true);

    const supabase = createClient();

    const paymentPromise =
      canViewPayments || canManagePayments
        ? supabase
            .from("order_payments")
            .select(`
              order_id,
              payment_amount,
              payment_status,
              payment_receiver_name,
              payment_note,
              updated_at
            `)
            .eq("order_id", orderId)
            .maybeSingle()
        : Promise.resolve({
            data: null,
            error: null,
          } as any);

    const billingPromise = canManageBilling
      ? supabase
          .from("order_billing")
          .select(`
            order_id,
            bill_created,
            bill_number,
            bill_date,
            billing_note,
            updated_at
          `)
          .eq("order_id", orderId)
          .maybeSingle()
      : Promise.resolve({
          data: null,
          error: null,
        } as any);

    const [paymentResult, billingResult] =
      await Promise.all([
        paymentPromise,
        billingPromise,
      ]);

    const firstError =
      paymentResult.error || billingResult.error;

    if (firstError) {
      setMessage(
        `Financial Data Load Error: ${firstError.message}`
      );
      setFinanceLoading(false);
      return;
    }

    const payment =
      (paymentResult.data || null) as OrderPayment | null;

    const billing =
      (billingResult.data || null) as OrderBilling | null;

    setSelectedPayment(payment);
    setSelectedBilling(billing);

    setPaymentForm({
      payment_amount:
        payment?.payment_amount === null ||
        payment?.payment_amount === undefined
          ? ""
          : String(payment.payment_amount),
      payment_status:
        payment?.payment_status || "pending",
      payment_receiver_name:
        payment?.payment_receiver_name || "",
      payment_note:
        payment?.payment_note || "",
    });

    setBillingForm({
      bill_created:
        billing?.bill_created || false,
      bill_number:
        billing?.bill_number || "",
      bill_date:
        billing?.bill_date || "",
      billing_note:
        billing?.billing_note || "",
    });

    setFinanceLoading(false);
  }

  async function savePaymentDetails() {
    if (!selectedOrder) return;

    if (!canManagePayments) {
      setMessage(
        "Payment Manage permission જરૂરી છે."
      );
      return;
    }

    let amount: number | null = null;

    if (paymentForm.payment_amount.trim()) {
      amount = Number(paymentForm.payment_amount);

      if (
        Number.isNaN(amount) ||
        amount < 0
      ) {
        setMessage(
          "Payment Amount સાચો નાખો."
        );
        return;
      }
    }

    setPaymentSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "save_order_payment_sensitive",
      {
        p_order_id: selectedOrder.id,
        p_payment_amount: amount,
        p_payment_status:
          paymentForm.payment_status,
        p_payment_receiver_name:
          paymentForm.payment_receiver_name.trim() ||
          null,
        p_payment_note:
          paymentForm.payment_note.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `Payment Save Error: ${error.message}`
      );
      setPaymentSaving(false);
      return;
    }

    setMessage("Payment Details Saved ✅");
    await loadOrderFinancials(selectedOrder.id);
    setPaymentSaving(false);
  }

  async function saveBillingDetails() {
    if (!selectedOrder) return;

    if (!canManageBilling) {
      setMessage(
        "Billing Manage permission જરૂરી છે."
      );
      return;
    }

    if (
      billingForm.bill_created &&
      !billingForm.bill_number.trim()
    ) {
      setMessage(
        "Bill Created હોય તો Bill Number જરૂરી છે."
      );
      return;
    }

    setBillingSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "save_order_billing_sensitive",
      {
        p_order_id: selectedOrder.id,
        p_bill_created:
          billingForm.bill_created,
        p_bill_number:
          billingForm.bill_number.trim() || null,
        p_bill_date:
          billingForm.bill_date || null,
        p_billing_note:
          billingForm.billing_note.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `Billing Save Error: ${error.message}`
      );
      setBillingSaving(false);
      return;
    }

    setMessage("Billing Details Saved ✅");
    await loadOrderFinancials(selectedOrder.id);
    setBillingSaving(false);
  }


  async function loadOrderProofs(orderId: string) {
    const supabase = createClient();

    setProofLoading(true);

    const { data, error } = await supabase
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
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`Proof Load Error: ${error.message}`);
      setSelectedOrderProofs([]);
      setProofLoading(false);
      return;
    }

    setSelectedOrderProofs((data || []) as StageProof[]);
    setProofLoading(false);
  }

  async function openStageProof(proof: StageProof) {
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

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function formatProofSize(bytes: number | null) {
    if (!bytes || bytes <= 0) return "-";

    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getOrderStage(order: Order) {
    if (order.current_stage_id) {
      const byId = stageMap.get(order.current_stage_id);
      if (byId) return byId;
    }

    return stageCodeMap.get(order.current_stage) || null;
  }

  function getTemplateStageList(order: Order) {
    if (!order.workflow_template_id) return [];

    return workflowTemplateStages
      .filter((item) => item.template_id === order.workflow_template_id)
      .sort((a, b) => a.sequence_no - b.sequence_no);
  }

  function getNextStage(order: Order) {
    const list = getTemplateStageList(order);

    if (!list.length) return null;

    const currentStage = getOrderStage(order);

    const index = list.findIndex(
      (item) =>
        item.stage_id === order.current_stage_id ||
        item.stage_id === currentStage?.id
    );

    if (index < 0 || index >= list.length - 1) {
      return null;
    }

    return stageMap.get(list[index + 1].stage_id) || null;
  }

  function selectableStagesForOrder(order: Order) {
    const list = getTemplateStageList(order);

    if (list.length) {
      return list
        .map((item) => stageMap.get(item.stage_id))
        .filter(Boolean) as WorkflowStage[];
    }

    return workflowStages
      .filter((stage) => stage.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
  }

  function workingByName(order: Order) {
    const activeWork = activeWorkByOrder.get(order.id);
    const work = activeWork || lastWorkedByOrder.get(order.id);

    if (!work) {
      return order.current_stage === "completed"
        ? "No Employee Record"
        : "Needs Assignment";
    }

    const links = stageWorkerLinksByWork.get(work.id) || [];
    const ids = Array.from(
      new Set([
        ...(work.primary_employee_id ? [work.primary_employee_id] : []),
        ...links.map((link) => link.employee_id),
      ])
    );

    if (!ids.length) {
      return order.current_stage === "completed"
        ? "No Employee Record"
        : "Needs Assignment";
    }

    const names = ids.map(
      (id) => employeeMap.get(id)?.full_name || "Unknown"
    );
    const joined = names.join(" + ");

    return !activeWork && order.current_stage === "completed"
      ? `${joined} (Last)`
      : joined;
  }

  async function loadProductMaster() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      .select("id, name")
      .eq("is_active", true)
    
      .order("name");

    if (error) {
      setMessage(`Product Load Error: ${error.message}`);
      return;
    }

    setProducts((data || []) as Product[]);
  }

  async function loadProductConfiguration(productId: string) {
    if (!productId) {
      setProductOptions([]);
      setOptionValues([]);
      setDependencies([]);
      setSelectedConfig({});
      return;
    }

    const supabase = createClient();

    const { data: optionsData, error: optionsError } = await supabase
      .from("product_options")
      .select("id, product_id, name, sort_order, is_required, is_active")
      .eq("product_id", productId)
      .eq("is_active", true)
      
      .order("sort_order");

    if (optionsError) {
      setMessage(`Product Option Error: ${optionsError.message}`);
      return;
    }

    const opts = (optionsData || []) as ProductOption[];
    setProductOptions(opts);
    setSelectedConfig({});

    if (!opts.length) {
      setOptionValues([]);
      setDependencies([]);
      return;
    }

    const { data: valuesData, error: valuesError } = await supabase
      .from("product_option_values")
      .select(
        "id, product_option_id, value, parent_value_id, sort_order, is_active"
      )
      .in(
        "product_option_id",
        opts.map((option) => option.id)
      )
      .eq("is_active", true)
            .order("sort_order");

    if (valuesError) {
      setMessage(`Product Value Error: ${valuesError.message}`);
      return;
    }

    const values = (valuesData || []) as OptionValue[];
    setOptionValues(values);

    if (!values.length) {
      setDependencies([]);
      return;
    }

    const { data: dependencyData, error: dependencyError } = await supabase
      .from("product_value_dependencies")
      .select("id, value_id, parent_value_id")
      .in(
        "value_id",
        values.map((value) => value.id)
      );

    if (dependencyError) {
      setMessage(`Dependency Error: ${dependencyError.message}`);
      return;
    }

    setDependencies((dependencyData || []) as ValueDependency[]);
  }

  function availableValuesForOption(
    option: ProductOption,
    optionIndex: number
  ) {
    const ownValues = optionValues.filter(
      (value) => value.product_option_id === option.id
    );

    if (optionIndex === 0) return ownValues;

    const previousOption = productOptions[optionIndex - 1];
    const previousSelectedId = selectedConfig[previousOption.id];

    if (!previousSelectedId) return [];

    return ownValues.filter((value) => {
      const links = dependencies.filter(
        (dependency) => dependency.value_id === value.id
      );

      return (
        links.length === 0 ||
        links.some(
          (dependency) =>
            dependency.parent_value_id === previousSelectedId
        )
      );
    });
  }

  function handleConfigChange(
    optionIndex: number,
    optionId: string,
    valueId: string
  ) {
    setSelectedConfig((current) => {
      const next = { ...current, [optionId]: valueId };

      for (let index = optionIndex + 1; index < productOptions.length; index++) {
        delete next[productOptions[index].id];
      }

      return next;
    });
  }

  async function loadWorkflowData() {
    const supabase = createClient();

    const [
      employeeResult,
      departmentResult,
      employeeDepartmentResult,
      stageResult,
      templateResult,
      templateStageResult,
      templateStageWorkerResult,
      stageWorkResult,
      orderStageWorkerResult,
    ] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, department, role")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_hidden", false)
        .order("full_name"),

      supabase
        .from("departments")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),

      supabase
        .from("employee_departments")
        .select("employee_id, department_id, is_primary"),

      supabase
        .from("workflow_stages")
        .select(
          "id, code, name, department_id, sort_order, is_active, requires_admin_approval"
        )
        .order("sort_order"),

      supabase
        .from("workflow_templates")
        .select(
          "id, name, product_id, workflow_mode, is_default, is_active"
        )
        .eq("is_active", true),
    

      supabase
        .from("workflow_template_stages")
        .select(
          "id, template_id, stage_id, sequence_no, approval_required, assignment_rule, default_employee_id, auto_method, last_assigned_employee_id"
        )
        .order("sequence_no"),

      supabase
        .from("workflow_template_stage_workers")
        .select(
          "id, workflow_template_stage_id, employee_id, is_primary, sort_order"
        )
        .order("sort_order"),

      supabase
        .from("order_stage_work")
        .select(
          "id, order_id, stage_id, status, primary_employee_id, started_at, completed_at, hold_reason, rework_reason, proof_waived, proof_waiver_reason, proof_waived_by_employee_id, proof_waived_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false }),

      supabase
        .from("order_stage_workers")
        .select(
          "id, order_stage_work_id, employee_id, worker_role, joined_at, left_at"
        )
        .order("joined_at", { ascending: true }),
    ]);

    const firstError =
      employeeResult.error ||
      departmentResult.error ||
      employeeDepartmentResult.error ||
      stageResult.error ||
      templateResult.error ||
      templateStageResult.error ||
      templateStageWorkerResult.error ||
      stageWorkResult.error ||
      orderStageWorkerResult.error;

    if (firstError) {
      setMessage(`Workflow Load Error: ${firstError.message}`);
      return;
    }

    setEmployees((employeeResult.data || []) as Employee[]);
    setDepartments((departmentResult.data || []) as Department[]);
    setEmployeeDepartments(
      (employeeDepartmentResult.data || []) as EmployeeDepartment[]
    );
    setWorkflowStages((stageResult.data || []) as WorkflowStage[]);
    setWorkflowTemplates((templateResult.data || []) as WorkflowTemplate[]);
    setWorkflowTemplateStages(
      (templateStageResult.data || []) as WorkflowTemplateStage[]
    );
    setWorkflowTemplateStageWorkers(
      (templateStageWorkerResult.data || []) as WorkflowTemplateStageWorker[]
    );
    setStageWorks((stageWorkResult.data || []) as StageWork[]);
    setOrderStageWorkers(
      (orderStageWorkerResult.data || []) as OrderStageWorker[]
    );
  }

  async function loadOrders() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_mobile,
        product_id,
        product_name,
        quantity,
        order_source,
        current_stage,
        current_stage_id,
        workflow_template_id,
        workflow_mode,
        workflow_status,
        priority,
        order_date,
        due_date,
        customer_note,
        admin_note,
        created_at,
        completed_at,
        product_configuration
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Order Load Error: ${error.message}`);
      return;
    }

    setOrders((data || []) as Order[]);
  }

  async function refreshOrders() {
    await Promise.all([loadOrders(), loadWorkflowData()]);
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

      const { data: adminProfile, error: adminError } = await supabase
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

      const [
        paymentViewResult,
        paymentManageResult,
        billingManageResult,
      ] = await Promise.all([
        supabase.rpc("has_app_permission", {
          p_permission_key:
            "payments.view_sensitive",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key:
            "payments.manage",
        }),
        supabase.rpc("has_app_permission", {
          p_permission_key:
            "billing.manage",
        }),
      ]);

      const permissionError =
        paymentViewResult.error ||
        paymentManageResult.error ||
        billingManageResult.error;

      if (permissionError) {
        setMessage(
          `Permission Check Error: ${permissionError.message}`
        );
        setLoading(false);
        return;
      }

      const paymentManageAllowed =
        Boolean(paymentManageResult.data);

      setCanManagePayments(
        paymentManageAllowed
      );

      setCanViewPayments(
        Boolean(paymentViewResult.data) ||
          paymentManageAllowed
      );

      setCanManageBilling(
        Boolean(billingManageResult.data)
      );

      await Promise.all([
        loadOrders(),
        loadProductMaster(),
        loadWorkflowData(),
      ]);

      setLoading(false);
    }

    loadPage();
  }, [router]);

  useEffect(() => {
    loadProductConfiguration(selectedProductId);
    setCreateStagePlanOverrides({});
  }, [selectedProductId]);

  function openOrder(order: Order) {
    const work = activeWorkByOrder.get(order.id);

    setSelectedOrder(order);
    setWorkerSelection(work?.primary_employee_id || "");
    setStageSelection(getOrderStage(order)?.id || "");
    setShowEdit(false);
    setShowStageProof(false);
    setShowPayment(false);
    setShowBilling(false);
    setSelectedOrderProofs([]);
    resetFinancialForms();

    setEditForm({
      customer_name: order.customer_name,
      customer_mobile: order.customer_mobile || "",
      quantity: String(order.quantity),
      priority: order.priority,
      due_date: order.due_date || "",
      customer_note: order.customer_note || "",
      admin_note: order.admin_note || "",
    });

    void loadOrderProofs(order.id);
    void loadOrderFinancials(order.id);
  }

  async function handleCreateOrder() {
    if (!customerName.trim()) {
      setMessage("Customer Name જરૂરી છે.");
      return;
    }

    const selectedProduct = products.find(
      (product) => product.id === selectedProductId
    );

    if (!selectedProduct) {
      setMessage("Product select કરો.");
      return;
    }

    for (const option of productOptions) {
      if (option.is_required && !selectedConfig[option.id]) {
        setMessage(`${option.name} select કરવું જરૂરી છે.`);
        return;
      }
    }

    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage("Quantity સાચી નાખો.");
      return;
    }

    const productWorkflow =
      workflowTemplates.find(
        (template) =>
          template.product_id === selectedProduct.id &&
          template.is_active
      ) ||
      workflowTemplates.find(
        (template) => template.is_default && template.is_active
      );

    if (!productWorkflow) {
      setMessage(
        "Active Workflow મળ્યો નથી. પહેલા Workflow Settingsમાં workflow બનાવો."
      );
      return;
    }

    const templateSequence = workflowTemplateStages
      .filter((item) => item.template_id === productWorkflow.id)
      .sort((a, b) => a.sequence_no - b.sequence_no);

    const firstTemplateStage = templateSequence[0];
    const firstStage = firstTemplateStage
      ? stageMap.get(firstTemplateStage.stage_id)
      : null;

    if (!firstStage) {
      setMessage(
        "આ Product Workflowમાં Stage નથી. Workflow Settings ચેક કરો."
      );
      return;
    }

    const stageTeamPlans = templateSequence.map((item) => {
      const defaults = getCreateDefaultPlan(item);
      const override = createStagePlanOverrides[item.id];

      const primaryId =
        override?.primaryId !== undefined
          ? override.primaryId
          : defaults.primaryId;

      const supportIds = Array.from(
        new Set(
          (override?.supportIds ?? defaults.supportIds).filter(
            (id) => id && id !== primaryId
          )
        )
      );

      return {
        templateStage: item,
        primaryId,
        supportIds,
        assignedIds: primaryId
          ? [primaryId, ...supportIds]
          : supportIds,
        source: override
          ? "override"
          : item.assignment_rule === "auto_assign"
          ? "auto"
          : "default",
      };
    });

    const initialAssignment = stageTeamPlans[0];
    const initialDefaultWorkerId =
      initialAssignment?.primaryId || null;
    const initialWorkflowStatus: WorkflowStatus =
      initialDefaultWorkerId ? "assigned" : "waiting";

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const configurationSnapshot: Record<string, string> = {};

    for (const option of productOptions) {
      const selectedValueId = selectedConfig[option.id];

      if (!selectedValueId) continue;

      const selectedValue = optionValues.find(
        (value) => value.id === selectedValueId
      );

      if (selectedValue) {
        configurationSnapshot[option.name] = selectedValue.value;
      }
    }

    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({
        order_number: "AUTO",
        customer_name: customerName.trim(),
        customer_mobile: customerMobile.trim() || null,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_configuration: configurationSnapshot,
        quantity: qty,
        order_source: orderSource,
        current_stage: firstStage.code,
        current_stage_id: firstStage.id,
        workflow_template_id: productWorkflow.id,
        workflow_mode: productWorkflow.workflow_mode,
        workflow_status: initialWorkflowStatus,
        priority,
        due_date: dueDate || null,
        customer_note: customerNote.trim() || null,
        admin_note: adminNote.trim() || null,
        created_by: adminId,
      })
      .select("id, order_number")
      .single();

    if (error || !newOrder) {
      setMessage(
        `Order Create Error: ${error?.message || "Unknown error"}`
      );
      setSaving(false);
      return;
    }

    const { data: savedPlans, error: planError } = await supabase
      .from("order_stage_plans")
      .insert(
        stageTeamPlans.map((plan) => ({
          order_id: newOrder.id,
          workflow_template_stage_id: plan.templateStage.id,
          stage_id: plan.templateStage.stage_id,
          sequence_no: plan.templateStage.sequence_no,
          primary_employee_id: plan.primaryId,
          source: plan.source,
        }))
      )
      .select("id, workflow_template_stage_id");

    if (planError || !savedPlans) {
      await supabase.from("orders").delete().eq("id", newOrder.id);
      setMessage(
        `Stage Team Plan Error: ${planError?.message || "Unknown error"}`
      );
      setSaving(false);
      return;
    }

    const savedPlanMap = new Map(
      savedPlans.map((plan) => [
        plan.workflow_template_stage_id,
        plan.id,
      ])
    );

    const planWorkerRows = stageTeamPlans.flatMap((plan) => {
      const planId = savedPlanMap.get(plan.templateStage.id);
      if (!planId) return [];

      const rows: Array<{
        order_stage_plan_id: string;
        employee_id: string;
        worker_role: "primary" | "support";
      }> = [];

      if (plan.primaryId) {
        rows.push({
          order_stage_plan_id: planId,
          employee_id: plan.primaryId,
          worker_role: "primary",
        });
      }

      for (const employeeId of plan.supportIds) {
        rows.push({
          order_stage_plan_id: planId,
          employee_id: employeeId,
          worker_role: "support",
        });
      }

      return rows;
    });

    if (planWorkerRows.length) {
      const { error: planWorkerError } = await supabase
        .from("order_stage_plan_workers")
        .insert(planWorkerRows);

      if (planWorkerError) {
        await supabase.from("orders").delete().eq("id", newOrder.id);
        setMessage(
          `Stage Team Save Error: ${planWorkerError.message}`
        );
        setSaving(false);
        return;
      }
    }

    await supabase.from("order_product_configurations").insert({
      order_id: newOrder.id,
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      configuration: configurationSnapshot,
    });

    await supabase.from("order_stage_history").insert({
      order_id: newOrder.id,
      from_stage: null,
      to_stage: firstStage.code,
      changed_by: adminId,
      note: "Order Created",
    });

    const { data: workData } = await supabase
      .from("order_stage_work")
      .insert({
        order_id: newOrder.id,
        stage_id: firstStage.id,
        sequence_no: firstTemplateStage?.sequence_no || 10,
        status: initialWorkflowStatus,
        primary_employee_id: initialDefaultWorkerId,
      })
      .select("id")
      .single();

    if (workData?.id) {
      await saveAssignedTeam(
        workData.id,
        initialAssignment?.primaryId || null,
        initialAssignment?.supportIds || []
      );
    }

    for (const plan of stageTeamPlans) {
      if (
        plan.templateStage.assignment_rule === "auto_assign" &&
        plan.primaryId
      ) {
        await supabase
          .from("workflow_template_stages")
          .update({ last_assigned_employee_id: plan.primaryId })
          .eq("id", plan.templateStage.id);
      }
    }

    await supabase.from("order_workflow_history").insert({
      order_id: newOrder.id,
      order_stage_work_id: workData?.id || null,
      action_type: "order_created",
      from_stage_id: null,
      to_stage_id: firstStage.id,
      from_status: null,
      to_status: initialWorkflowStatus,
      employee_id: adminId,
      note: `Workflow: ${productWorkflow.name}`,
    });

    setCustomerName("");
    setCustomerMobile("");
    setSelectedProductId("");
    setSelectedConfig({});
    setProductOptions([]);
    setOptionValues([]);
    setDependencies([]);
    setQuantity("1");
    setOrderSource("other");
    setPriority("normal");
    setDueDate("");
    setCustomerNote("");
    setAdminNote("");
    setCreateStagePlanOverrides({});
    setShowCreate(false);

    setMessage(
      `${newOrder.order_number} create થયો → ${firstStage.name} ✅`
    );

    await refreshOrders();
    setSaving(false);
  }

  async function saveOrderDetails() {
    if (!selectedOrder) return;

    const qty = Number(editForm.quantity);

    if (!editForm.customer_name.trim()) {
      setMessage("Customer Name જરૂરી છે.");
      return;
    }

    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage("Quantity સાચી નાખો.");
      return;
    }

    setActionId(`edit-${selectedOrder.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("orders")
      .update({
        customer_name: editForm.customer_name.trim(),
        customer_mobile: editForm.customer_mobile.trim() || null,
        quantity: qty,
        priority: editForm.priority,
        due_date: editForm.due_date || null,
        customer_note: editForm.customer_note.trim() || null,
        admin_note: editForm.admin_note.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", selectedOrder.id);

    if (error) {
      setMessage(`Order Edit Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await supabase.from("order_workflow_history").insert({
      order_id: selectedOrder.id,
      action_type: "order_details_updated",
      employee_id: adminId,
      note: "Admin edited order details",
    });

    setMessage("Order Details Updated ✅");
    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  async function assignWorker(order: Order) {
    const stage = getOrderStage(order);

    if (!stage) {
      setMessage("Current Stage Masterમાં મળ્યો નથી.");
      return;
    }

    setActionId(`assign-${order.id}`);
    setMessage("");

    const supabase = createClient();
    let currentWork = activeWorkByOrder.get(order.id);

    if (!currentWork) {
      const { data, error } = await supabase
        .from("order_stage_work")
        .insert({
          order_id: order.id,
          stage_id: stage.id,
          status: workerSelection ? "assigned" : "waiting",
          primary_employee_id: workerSelection || null,
        })
        .select(
          "id, order_id, stage_id, status, primary_employee_id, started_at, completed_at, hold_reason, rework_reason, proof_waived, proof_waiver_reason, proof_waived_by_employee_id, proof_waived_at"
        )
        .single();

      if (error || !data) {
        setMessage(`Employee Assign Error: ${error?.message || "Unknown error"}`);
        setActionId(null);
        return;
      }

      currentWork = data as StageWork;
    } else {
      const { error } = await supabase
        .from("order_stage_work")
        .update({
          primary_employee_id: workerSelection || null,
          status: workerSelection ? "assigned" : "waiting",
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentWork.id);

      if (error) {
        setMessage(`Employee Assign Error: ${error.message}`);
        setActionId(null);
        return;
      }
    }

    await saveAssignedTeam(
      currentWork.id,
      workerSelection || null,
      []
    );

    await supabase
      .from("orders")
      .update({
        workflow_status: workerSelection ? "assigned" : "waiting",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await supabase.from("order_workflow_history").insert({
      order_id: order.id,
      order_stage_work_id: currentWork.id,
      action_type: workerSelection ? "worker_assigned" : "worker_unassigned",
      from_stage_id: stage.id,
      to_stage_id: stage.id,
      from_status: order.workflow_status,
      to_status: workerSelection ? "assigned" : "waiting",
      employee_id: adminId,
      note: workerSelection
        ? `Assigned to ${
            employeeMap.get(workerSelection)?.full_name || "Employee"
          }`
        : "Employee removed",
    });

    setMessage(
      workerSelection
        ? `Assigned Employee: ${
            employeeMap.get(workerSelection)?.full_name || "Employee"
          } ✅`
        : "Employee moved to Needs Assignment."
    );

    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  async function startWork(order: Order) {
    const work = activeWorkByOrder.get(order.id);

    if (!work) {
      setMessage("પહેલા Employee assign કરો.");
      return;
    }

    if (!work.primary_employee_id) {
      setMessage("પહેલા Assigned Employee select કરો.");
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

    setActionId(`start-${order.id}`);
    setMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("order_stage_work")
      .update({
        status: "in_progress",
        started_at: work.started_at || now,
        updated_at: now,
      })
      .eq("id", work.id);

    if (error) {
      setMessage(`Start Work Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await supabase
      .from("orders")
      .update({
        workflow_status: "in_progress",
        updated_at: now,
      })
      .eq("id", order.id);

    await supabase.from("order_workflow_history").insert({
      order_id: order.id,
      order_stage_work_id: work.id,
      action_type: "work_started",
      from_stage_id: work.stage_id,
      to_stage_id: work.stage_id,
      from_status: order.workflow_status,
      to_status: "in_progress",
      employee_id: work.primary_employee_id,
    });

    setMessage("Work Started ✅");
    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  async function markHold(order: Order) {
    const reason = window.prompt("Hold Reason લખો:");

    if (reason === null) return;

    if (!reason.trim()) {
      setMessage("Hold Reason જરૂરી છે.");
      return;
    }

    const work = activeWorkByOrder.get(order.id);

    if (!work) {
      setMessage("Active Stage Work મળ્યું નથી.");
      return;
    }

    setActionId(`hold-${order.id}`);

    const supabase = createClient();

    const { error } = await supabase
      .from("order_stage_work")
      .update({
        status: "hold",
        hold_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", work.id);

    if (error) {
      setMessage(`Hold Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await supabase
      .from("orders")
      .update({
        workflow_status: "hold",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await supabase.from("order_workflow_history").insert({
      order_id: order.id,
      order_stage_work_id: work.id,
      action_type: "hold",
      from_stage_id: work.stage_id,
      to_stage_id: work.stage_id,
      from_status: order.workflow_status,
      to_status: "hold",
      employee_id: adminId,
      reason: reason.trim(),
    });

    setMessage("Order Hold પર મૂક્યો ✅");
    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  async function markRework(order: Order) {
    const reason = window.prompt("Rework Reason લખો:");

    if (reason === null) return;

    if (!reason.trim()) {
      setMessage("Rework Reason જરૂરી છે.");
      return;
    }

    const work = activeWorkByOrder.get(order.id);

    if (!work) {
      setMessage("Active Stage Work મળ્યું નથી.");
      return;
    }

    setActionId(`rework-${order.id}`);

    const supabase = createClient();

    const { error } = await supabase
      .from("order_stage_work")
      .update({
        status: "rework",
        rework_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", work.id);

    if (error) {
      setMessage(`Rework Error: ${error.message}`);
      setActionId(null);
      return;
    }

    await supabase
      .from("orders")
      .update({
        workflow_status: "rework",
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await supabase.from("order_workflow_history").insert({
      order_id: order.id,
      order_stage_work_id: work.id,
      action_type: "rework",
      from_stage_id: work.stage_id,
      to_stage_id: work.stage_id,
      from_status: order.workflow_status,
      to_status: "rework",
      employee_id: adminId,
      reason: reason.trim(),
    });

    setMessage("Order Rework statusમાં મૂક્યો ✅");
    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  async function moveToStage(
    order: Order,
    targetStage: WorkflowStage,
    actionType: "next_stage" | "admin_change"
  ) {
    if (!adminId) return;

    const currentStage = getOrderStage(order);
    const currentWork = activeWorkByOrder.get(order.id);

    if (
      actionType === "next_stage" &&
      (!currentWork || currentWork.status !== "ready_for_approval")
    ) {
      setMessage(
        "Employeeએ Stage Ready for Approval કર્યા પછી જ Approve કરી શકાય."
      );
      return;
    }

    if (currentStage?.id === targetStage.id) {
      setMessage("Order પહેલેથી આ Stageમાં છે.");
      return;
    }

    setActionId(`move-${order.id}`);
    setMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { data: existingTargetWork, error: duplicateCheckError } =
      await supabase
        .from("order_stage_work")
        .select("id, status")
        .eq("order_id", order.id)
        .eq("stage_id", targetStage.id)
        .in("status", activeWorkStatuses)
        .limit(1)
        .maybeSingle();

    if (duplicateCheckError) {
      setMessage(`Next Stage Check Error: ${duplicateCheckError.message}`);
      setActionId(null);
      return;
    }

    if (existingTargetWork) {
      setMessage(
        `${targetStage.name} માટે Active Work પહેલેથી બનાવેલ છે. Duplicate Stage બનાવ્યો નથી.`
      );
      setActionId(null);
      return;
    }

    if (currentWork) {
      const { error: closeError } = await supabase
        .from("order_stage_work")
        .update({
          status: "completed",
          completed_at: now,
          approved_by: adminId,
          approved_at: now,
          updated_at: now,
        })
        .eq("id", currentWork.id);

      if (closeError) {
        setMessage(`Current Stage Close Error: ${closeError.message}`);
        setActionId(null);
        return;
      }
    }

    const templateItem = getTemplateStageList(order).find(
      (item) => item.stage_id === targetStage.id
    );

    const targetAssignment = getAssignmentPlan(templateItem);
    const targetDefaultWorkerId = targetAssignment.primaryId;
    const targetStatus: WorkflowStatus =
      targetDefaultWorkerId ? "assigned" : "waiting";

    const { error: orderError } = await supabase
      .from("orders")
      .update({
        current_stage: targetStage.code,
        current_stage_id: targetStage.id,
        workflow_status: targetStatus,
        completed_at: null,
        updated_at: now,
      })
      .eq("id", order.id);

    if (orderError) {
      setMessage(`Stage Change Error: ${orderError.message}`);
      setActionId(null);
      return;
    }

    const { data: newWork, error: workError } = await supabase
      .from("order_stage_work")
      .insert({
        order_id: order.id,
        stage_id: targetStage.id,
        sequence_no: templateItem?.sequence_no || targetStage.sort_order,
        status: targetStatus,
        primary_employee_id: targetDefaultWorkerId,
      })
      .select("id")
      .single();

    if (workError) {
      setMessage(`New Stage Work Error: ${workError.message}`);
      setActionId(null);
      return;
    }

    if (newWork?.id) {
      await saveAssignedTeam(
        newWork.id,
        targetAssignment.primaryId,
        targetAssignment.supportIds
      );
    }

    if (
      templateItem?.assignment_rule === "auto_assign" &&
      targetAssignment.primaryId
    ) {
      await supabase
        .from("workflow_template_stages")
        .update({ last_assigned_employee_id: targetAssignment.primaryId })
        .eq("id", templateItem.id);
    }

    await supabase.from("order_stage_history").insert({
      order_id: order.id,
      from_stage: order.current_stage,
      to_stage: targetStage.code,
      changed_by: adminId,
      note:
        actionType === "next_stage"
          ? "Admin Approved Next Stage"
          : "Admin Changed Stage",
    });

    await supabase.from("order_workflow_history").insert({
      order_id: order.id,
      order_stage_work_id: newWork?.id || null,
      action_type: actionType,
      from_stage_id: currentStage?.id || null,
      to_stage_id: targetStage.id,
      from_status: currentWork?.status || order.workflow_status,
      to_status: targetStatus,
      employee_id: adminId,
    });

    setMessage(
      targetAssignment.assignedIds.length
        ? `${order.order_number} → ${targetStage.name} → ${targetAssignment.assignedIds
            .map((id) => employeeMap.get(id)?.full_name || "Employee")
            .join(" + ")} ✅`
        : `${order.order_number} → ${targetStage.name} ✅`
    );
    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  async function completeOrder(order: Order) {
    if (!adminId) return;

    const confirmed = window.confirm(
      `${order.order_number} ને Direct Complete કરવો છે?\n\nCurrent stage સહિત બધા active stages બંધ થશે અને Order Completed થશે. આ action આગળના normal workflow steps bypass કરશે.\n\nContinue?`
    );

    if (!confirmed) return;

    setActionId(`complete-${order.id}`);
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase.rpc(
      "admin_complete_order_v1",
      {
        p_order_id: order.id,
        p_note: "Admin direct completed order",
      }
    );

    if (error) {
      setMessage(`Direct Complete Error: ${error.message}`);
      setActionId(null);
      return;
    }

    const result = (data || {}) as {
      ok?: boolean;
      already_completed?: boolean;
    };

    setMessage(
      result.already_completed
        ? `${order.order_number} પહેલેથી Completed છે ✅`
        : `${order.order_number} Direct Completed ✅`
    );

    setSelectedOrder(null);
    await refreshOrders();
    setActionId(null);
  }

  const todayIndia = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  const latestNumericOrderValue = useMemo(() => {
    let maxValue = 0;

    for (const order of orders) {
      const value = orderNumericValue(order.order_number);

      if (value !== null && value > maxValue) {
        maxValue = value;
      }
    }

    return maxValue;
  }, [orders]);

  function isSafeDeleteCandidate(order: Order) {
    const value = orderNumericValue(order.order_number);

    if (value === null || value !== latestNumericOrderValue) {
      return false;
    }

    if (
      order.current_stage === "completed" ||
      order.current_stage === "cancelled" ||
      order.workflow_status === "completed" ||
      order.workflow_status === "cancelled"
    ) {
      return false;
    }

    const works = stageWorks.filter((work) => work.order_id === order.id);

    return works.every(
      (work) =>
        !work.started_at &&
        !work.completed_at &&
        ["waiting", "assigned"].includes(work.status)
    );
  }

  async function deleteMistakenDraft(order: Order) {
    if (!isSafeDeleteCandidate(order)) {
      setMessage(
        "ફક્ત latest unstarted Order delete કરી શકાય. Processed Orderનું number ક્યારેય renumber નહીં થાય."
      );
      return;
    }

    const confirmed = window.confirm(
      `${order.order_number} latest unstarted Order છે. તેને permanently delete કરવો છે? Next Order આ number ફરી use કરી શકે છે.`
    );

    if (!confirmed) return;

    setActionId(`delete-${order.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "admin_delete_latest_unstarted_order",
      {
        p_order_id: order.id,
      }
    );

    if (error) {
      setMessage(`Safe Delete Error: ${error.message}`);
      setActionId(null);
      return;
    }

    setSelectedOrder(null);
    setSelectedOrderProofs([]);
    resetFinancialForms();

    setMessage(
      `${order.order_number} safe draft delete થયું ✅ Next Order આ number reuse કરી શકે છે.`
    );

    await refreshOrders();
    setActionId(null);
  }

  function isNewOrder(order: Order) {
    const status = effectiveWorkflowStatus(order);
    const work = activeWorkByOrder.get(order.id);

    const isOpen =
      order.current_stage !== "completed" &&
      order.current_stage !== "cancelled";

    return (
      isOpen &&
      (!work ||
        (!work.started_at &&
          ["waiting", "assigned"].includes(status)))
    );
  }

  function needsAttention(order: Order) {
    const status = effectiveWorkflowStatus(order);
    const work = activeWorkByOrder.get(order.id);

    const isOpen =
      order.current_stage !== "completed" &&
      order.current_stage !== "cancelled";

    if (!isOpen) return false;

    const overdue =
      Boolean(order.due_date) &&
      String(order.due_date) < todayIndia;

    return (
      !work?.primary_employee_id ||
      ["ready_for_approval", "hold", "rework"].includes(status) ||
      overdue
    );
  }

  function isReadyToComplete(order: Order) {
    return effectiveWorkflowStatus(order) === "ready_for_approval";
  }

  function canDirectComplete(order: Order) {
    return (
      order.current_stage !== "completed" &&
      order.workflow_status !== "completed" &&
      order.current_stage !== "cancelled" &&
      order.workflow_status !== "cancelled"
    );
  }

  function isProductionOrder(order: Order) {
    const isOpen =
      order.current_stage !== "completed" &&
      order.current_stage !== "cancelled";

    return (
      isOpen &&
      !isNewOrder(order) &&
      !needsAttention(order)
    );
  }

  const filteredOrders = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return orders.filter((order) => {
      const isCompleted =
        order.current_stage === "completed" ||
        order.workflow_status === "completed";

      if (isCompleted) return false;

      const searchMatch =
        !query ||
        order.order_number.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.product_name.toLowerCase().includes(query) ||
        (order.customer_mobile || "").toLowerCase().includes(query);

      const stageMatch =
        filterStage === "all" || order.current_stage === filterStage;

      const priorityMatch =
        filterPriority === "all" || order.priority === filterPriority;

      let tabMatch = true;

      if (orderTab === "new") {
        tabMatch = isNewOrder(order);
      } else if (orderTab === "production") {
        tabMatch = isProductionOrder(order);
      } else if (orderTab === "attention") {
        tabMatch = needsAttention(order);
      } else if (orderTab === "ready") {
        tabMatch = isReadyToComplete(order);
      }

      return searchMatch && stageMatch && priorityMatch && tabMatch;
    });
  }, [
    orders,
    searchText,
    filterStage,
    filterPriority,
    orderTab,
    activeWorkByOrder,
    stageWorks,
    todayIndia,
  ]);

  const newOrdersCount = orders.filter(isNewOrder).length;
  const productionCount = orders.filter(isProductionOrder).length;
  const needsAttentionCount = orders.filter(needsAttention).length;
  const readyToCompleteCount = orders.filter(isReadyToComplete).length;

  const allOrdersCount = orders.filter(
    (order) =>
      order.current_stage !== "completed" &&
      order.workflow_status !== "completed"
  ).length;

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Order Management લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              YASHFLOW WORKFLOW V4
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Admin Orders
            </h1>
            <p className="text-blue-100 text-sm font-semibold mt-1">
              Workflow V4 • Auto Progress • Compact Orders • Employee Assignment
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/workflow")}
              className="yf-btn bg-white/15 text-white hover:bg-white/25"
            >
              ⚙ Workflow Settings
            </button>

            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="yf-btn bg-white text-blue-700 hover:bg-blue-50"
            >
              ← Admin Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <section className="yf-card p-3 sm:p-4 mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
                ORDER CENTER
              </p>
              <h2 className="text-lg font-black text-slate-900">
                Compact Orders
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowCreate((current) => !current)}
              className="yf-btn yf-btn-primary whitespace-nowrap"
            >
              {showCreate ? "✕ Close" : "+ New Order"}
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              ["new", "New Orders", newOrdersCount],
              ["production", "Production", productionCount],
              ["attention", "Needs Attention", needsAttentionCount],
              ["ready", "Ready Complete", readyToCompleteCount],
              ["all", "All Orders", allOrdersCount],
            ].map(([tab, label, count]) => (
              <button
                type="button"
                key={String(tab)}
                onClick={() => setOrderTab(tab as OrderTab)}
                className={`rounded-xl border px-2 py-2.5 text-center transition ${
                  orderTab === tab
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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

          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search Order / Customer / Product..."
              className="yf-input xl:col-span-2"
            />

            <select
              value={filterStage}
              onChange={(event) => setFilterStage(event.target.value)}
              className="yf-input"
            >
              <option value="all">All Stages</option>
              {workflowStages.map((stage) => (
                <option key={stage.id} value={stage.code}>
                  {stage.name}
                </option>
              ))}
              <option value="cancelled">Cancelled</option>
            </select>

            <select
              value={filterPriority}
              onChange={(event) => setFilterPriority(event.target.value)}
              className="yf-input"
            >
              <option value="all">All Priority</option>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </section>

        {showCreate && (
          <section className="yf-card p-5 sm:p-6 mb-5">
            <div>
              <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                NEW ORDER
              </p>
              <h2 className="yf-section-title mt-1">Create New Order</h2>
              <p className="yf-section-subtitle mt-1">
                Product select કરતાં તેનો configured Workflow automatic લાગશે.
              </p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
              <div>
                <label className="block text-sm font-black mb-2">
                  Order Number
                </label>
                <div className="yf-input flex items-center justify-between gap-3 bg-blue-50 border-blue-200">
                  <span className="font-black text-blue-800">
                    Auto Generated
                  </span>
                  <span className="text-xs font-bold text-blue-600">
                    YL-0001 format
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-black mb-2">
                  Customer Name
                </label>
                <input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  className="yf-input"
                />
              </div>

              <div>
                <label className="block text-sm font-black mb-2">
                  Customer Mobile
                </label>
                <input
                  value={customerMobile}
                  onChange={(event) => setCustomerMobile(event.target.value)}
                  className="yf-input"
                />
              </div>

              <div>
                <label className="block text-sm font-black mb-2">Product</label>
                <select
                  value={selectedProductId}
                  onChange={(event) =>
                    setSelectedProductId(event.target.value)
                  }
                  className="yf-input"
                >
                  <option value="">Select Product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              {productOptions.map((option, optionIndex) => {
                const values = availableValuesForOption(option, optionIndex);
                const previousOption =
                  optionIndex > 0 ? productOptions[optionIndex - 1] : null;
                const disabled =
                  !!previousOption && !selectedConfig[previousOption.id];

                return (
                  <div key={option.id}>
                    <label className="block text-sm font-black mb-2">
                      {option.name}
                      {option.is_required ? " *" : ""}
                    </label>

                    <select
                      value={selectedConfig[option.id] || ""}
                      disabled={disabled}
                      onChange={(event) =>
                        handleConfigChange(
                          optionIndex,
                          option.id,
                          event.target.value
                        )
                      }
                      className="yf-input disabled:bg-slate-100"
                    >
                      <option value="">
                        {disabled
                          ? "Select previous option first"
                          : `Select ${option.name}`}
                      </option>
                      {values.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.value}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              <CreateOrderStagePlan
                stages={createStagePlannerRows()}
                employees={createPlannerEmployees()}
                value={createStagePlanOverrides}
                onChange={setCreateStagePlanOverrides}
              />

              <div>
                <label className="block text-sm font-black mb-2">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="yf-input"
                />
              </div>

              <div>
                <label className="block text-sm font-black mb-2">
                  Order Source
                </label>
                <select
                  value={orderSource}
                  onChange={(event) =>
                    setOrderSource(event.target.value as OrderSource)
                  }
                  className="yf-input"
                >
                  <option value="amazon">Amazon</option>
                  <option value="flipkart">Flipkart</option>
                  <option value="website">Website</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="offline">Offline</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-black mb-2">Priority</label>
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as Priority)
                  }
                  className="yf-input"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-black mb-2">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="yf-input"
                />
              </div>

              <div className="md:col-span-2 xl:col-span-3">
                <label className="block text-sm font-black mb-2">
                  Customer Note
                </label>
                <textarea
                  rows={2}
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value)}
                  className="yf-input resize-none"
                />
              </div>

              <div className="md:col-span-2 xl:col-span-3">
                <label className="block text-sm font-black mb-2">
                  Admin Note
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  className="yf-input resize-none"
                />
              </div>

              <div className="md:col-span-2 xl:col-span-3">
                <button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={saving}
                  className="yf-btn yf-btn-primary disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Order"}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="yf-card overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
                {orderTab === "new"
                  ? "NEW ORDERS"
                  : orderTab === "production"
                  ? "PRODUCTION"
                  : orderTab === "attention"
                  ? "NEEDS ATTENTION"
                  : orderTab === "ready"
                  ? "READY TO COMPLETE"
                  : "ALL ORDERS"}
              </p>

              <h2 className="text-lg font-black text-slate-900 mt-0.5">
                Orders
              </h2>
            </div>

            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
              {filteredOrders.length}
            </span>
          </div>

          <div className="p-3 space-y-2">
            {filteredOrders.map((order) => {
              const stage = getOrderStage(order);
              const status = effectiveWorkflowStatus(order);
              const employeeName = workingByName(order);
              const overdue =
                Boolean(order.due_date) &&
                String(order.due_date) < todayIndia &&
                order.current_stage !== "completed" &&
                order.current_stage !== "cancelled";

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openOrder(order)}
                          className="text-base font-black text-blue-700 hover:underline"
                        >
                          {order.order_number}
                        </button>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black ${priorityStyle(
                            order.priority
                          )}`}
                        >
                          {order.priority.toUpperCase()}
                        </span>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black ${statusStyle(
                            status
                          )}`}
                        >
                          {statusLabel(status)}
                        </span>

                        {overdue && (
                          <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[9px] font-black">
                            OVERDUE
                          </span>
                        )}
                      </div>

                      <p className="font-black text-sm text-slate-900 mt-1 truncate">
                        {order.customer_name}
                      </p>

                      <p className="text-xs font-semibold text-slate-500 mt-0.5 truncate">
                        {order.product_name} • Qty {order.quantity}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {canDirectComplete(order) && (
                        <button
                          type="button"
                          onClick={() => void completeOrder(order)}
                          disabled={actionId === `complete-${order.id}`}
                          className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-[10px] font-black text-green-700 hover:bg-green-100 disabled:opacity-50"
                          title="Admin can directly complete this order from its current stage"
                        >
                          {actionId === `complete-${order.id}`
                            ? "Completing..."
                            : "✓ Complete"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openOrder(order)}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-700"
                      >
                        View
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 mt-3">
                    <div className="rounded-xl bg-blue-50 px-2.5 py-2 min-w-0">
                      <p className="text-[8px] font-black text-blue-600">
                        STAGE
                      </p>
                      <p className="text-[10px] sm:text-xs font-black text-blue-900 mt-0.5 truncate">
                        {stage?.name || formatStage(order.current_stage)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-2.5 py-2 min-w-0">
                      <p className="text-[8px] font-black text-slate-500">
                        EMPLOYEE
                      </p>
                      <p
                        className={`text-[10px] sm:text-xs font-black mt-0.5 truncate ${
                          employeeName === "Needs Assignment"
                            ? "text-amber-700"
                            : employeeName === "No Employee Record"
                            ? "text-slate-400"
                            : "text-slate-900"
                        }`}
                      >
                        {employeeName}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-50 px-2.5 py-2 min-w-0">
                      <p className="text-[8px] font-black text-slate-500">
                        DUE
                      </p>
                      <p
                        className={`text-[10px] sm:text-xs font-black mt-0.5 truncate ${
                          overdue ? "text-red-700" : "text-slate-900"
                        }`}
                      >
                        {order.due_date || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="py-10 text-center text-slate-400 font-semibold">
                આ sectionમાં કોઈ Order નથી.
              </div>
            )}
          </div>
        </section>
      </div>

      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => {
            setSelectedOrder(null);
            setSelectedOrderProofs([]);
            resetFinancialForms();
          }}
        >
          <div
            className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex items-start justify-between gap-4 z-10">
              <div>
                <p className="text-xs font-black tracking-[0.15em] text-blue-700">
                  QUICK ORDER
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
                onClick={() => {
                  setSelectedOrder(null);
                  setSelectedOrderProofs([]);
                  resetFinancialForms();
                }}
                className="w-10 h-10 rounded-xl bg-slate-100 font-black"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">
                    CURRENT STAGE
                  </p>
                  <p className="font-black mt-1">
                    {getOrderStage(selectedOrder)?.name ||
                      formatStage(selectedOrder.current_stage)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">
                    STATUS
                  </p>
                  <p className="font-black mt-1">
                    {statusLabel(effectiveWorkflowStatus(selectedOrder))}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">
                    PRIORITY
                  </p>
                  <span
                    className={`yf-badge mt-2 ${priorityStyle(
                      selectedOrder.priority
                    )}`}
                  >
                    {selectedOrder.priority.toUpperCase()}
                  </span>
                </div>

                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-black text-slate-400">
                    DUE DATE
                  </p>
                  <p className="font-black mt-1">
                    {selectedOrder.due_date || "-"}
                  </p>
                </div>
              </div>

              <div className="yf-card p-4">
                <p className="text-xs font-black text-slate-400 mb-3">
                  ASSIGNED EMPLOYEE
                </p>

                <div className="flex gap-2">
                  <select
                    value={workerSelection}
                    onChange={(event) =>
                      setWorkerSelection(event.target.value)
                    }
                    className="yf-input flex-1"
                  >
                    <option value="">Needs Assignment</option>
                    {eligibleEmployeesForOrder(selectedOrder).map((employee) => {
                      const departmentNames = employeeDepartmentNames(employee);

                      return (
                        <option key={employee.id} value={employee.id}>
                          {employee.full_name}
                          {departmentNames.length
                            ? ` — ${departmentNames.join(" + ")}`
                            : ""}
                        </option>
                      );
                    })}
                  </select>

                  <button
                    type="button"
                    disabled={actionId === `assign-${selectedOrder.id}`}
                    onClick={() => assignWorker(selectedOrder)}
                    className="yf-btn yf-btn-primary"
                  >
                    Assign
                  </button>
                </div>

                {activeWorkByOrder.get(selectedOrder.id)?.started_at && (
                  <p className="text-xs text-slate-500 mt-3">
                    Started:{" "}
                    {new Date(
                      activeWorkByOrder.get(selectedOrder.id)!.started_at!
                    ).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </p>
                )}
              </div>

              <div className="yf-card p-4">
                <button
                  type="button"
                  onClick={() => setShowStageProof((current) => !current)}
                  className="w-full flex items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="text-xs font-black text-slate-400">
                      STAGE PROOF
                    </p>
                    <p className="text-sm font-bold text-slate-700 mt-1">
                      Photo / Video evidence
                    </p>
                  </div>
                  <span className="text-lg font-black text-slate-500">
                    {showStageProof ? "▲" : "▼"}
                  </span>
                </button>

                {showStageProof && (
                  <div className="mt-4">
                    <div className="flex justify-end mb-3">
                      <button
                        type="button"
                        onClick={() => void loadOrderProofs(selectedOrder.id)}
                        disabled={proofLoading}
                        className="yf-btn yf-btn-secondary disabled:opacity-50"
                      >
                        {proofLoading ? "Loading..." : "↻ Refresh Proof"}
                      </button>
                    </div>

                {proofLoading && selectedOrderProofs.length === 0 ? (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-500">
                    Proof લોડ થઈ રહ્યું છે...
                  </div>
                ) : selectedOrderProofs.length === 0 ? (
                  stageWorks.some(
                    (work) =>
                      work.order_id === selectedOrder.id &&
                      work.proof_waived
                  ) ? (
                    <div className="mt-4 space-y-3">
                      {stageWorks
                        .filter(
                          (work) =>
                            work.order_id === selectedOrder.id &&
                            work.proof_waived
                        )
                        .map((work) => (
                          <div
                            key={work.id}
                            className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                          >
                            <p className="font-black text-amber-800">
                              ⚠ {stageMap.get(work.stage_id)?.name || "Stage"} Completed Without Proof
                            </p>
                            <p className="text-xs font-semibold text-amber-700 mt-1">
                              Reason: {work.proof_waiver_reason || "-"}
                            </p>
                            <p className="text-xs text-amber-600 mt-1">
                              {work.proof_waived_by_employee_id
                                ? employeeMap.get(
                                    work.proof_waived_by_employee_id
                                  )?.full_name || "Employee"
                                : "Employee"}
                              {work.proof_waived_at
                                ? ` • ${new Date(
                                    work.proof_waived_at
                                  ).toLocaleString("en-IN", {
                                    timeZone: "Asia/Kolkata",
                                  })}`
                                : ""}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="font-black text-amber-800">
                        No Stage Proof Yet
                      </p>
                      <p className="text-xs font-semibold text-amber-700 mt-1">
                        Employee proof upload કરશે ત્યારે અહીં દેખાશે.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="mt-4 space-y-4">
                    {stageWorks
                      .filter(
                        (work) =>
                          work.order_id === selectedOrder.id &&
                          (selectedProofsByWork.get(work.id)?.length || 0) > 0
                      )
                      .sort((a, b) => {
                        const aTime = a.created_at
                          ? new Date(a.created_at).getTime()
                          : 0;
                        const bTime = b.created_at
                          ? new Date(b.created_at).getTime()
                          : 0;
                        return aTime - bTime;
                      })
                      .map((work) => {
                        const proofs =
                          selectedProofsByWork.get(work.id) || [];
                        const stage = stageMap.get(work.stage_id);

                        const photos = proofs.filter(
                          (proof) => proof.file_type === "photo"
                        ).length;
                        const videos = proofs.filter(
                          (proof) => proof.file_type === "video"
                        ).length;

                        return (
                          <div
                            key={work.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-black text-slate-900">
                                  {stage?.name || "Workflow Stage"}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                  {statusLabel(work.status)}
                                </p>

                                {work.proof_waived && (
                                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                    <p className="text-xs font-black text-amber-800">
                                      ⚠ Completed Without Proof
                                    </p>
                                    <p className="text-xs font-semibold text-amber-700 mt-1">
                                      Reason: {work.proof_waiver_reason || "-"}
                                    </p>
                                    <p className="text-[11px] text-amber-600 mt-1">
                                      By:{" "}
                                      {work.proof_waived_by_employee_id
                                        ? employeeMap.get(
                                            work.proof_waived_by_employee_id
                                          )?.full_name || "Employee"
                                        : "Employee"}
                                      {work.proof_waived_at
                                        ? ` • ${new Date(
                                            work.proof_waived_at
                                          ).toLocaleString("en-IN", {
                                            timeZone: "Asia/Kolkata",
                                          })}`
                                        : ""}
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="yf-badge bg-green-100 text-green-700">
                                  📷 {photos}
                                </span>
                                <span className="yf-badge bg-purple-100 text-purple-700">
                                  🎥 {videos}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {proofs.map((proof) => {
                                const uploader =
                                  employeeMap.get(
                                    proof.uploaded_by_employee_id
                                  )?.full_name || "Employee";

                                return (
                                  <div
                                    key={proof.id}
                                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
                                  >
                                    <div className="min-w-0">
                                      <p className="text-sm font-black text-slate-800 truncate">
                                        {proof.file_type === "photo"
                                          ? "📷"
                                          : "🎥"}{" "}
                                        {proof.file_name}
                                      </p>

                                      <p className="text-xs text-slate-500 mt-1">
                                        {uploader}
                                        {" • "}
                                        {formatProofSize(proof.file_size)}
                                        {" • "}
                                        {new Date(
                                          proof.created_at
                                        ).toLocaleString("en-IN", {
                                          timeZone: "Asia/Kolkata",
                                        })}
                                      </p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      {proof.locked_at && (
                                        <span
                                          className="yf-badge bg-slate-100 text-slate-600"
                                          title="Submitted proof locked"
                                        >
                                          🔒 Locked
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() =>
                                          void openStageProof(proof)
                                        }
                                        className="yf-btn yf-btn-secondary"
                                      >
                                        Open
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {effectiveWorkflowStatus(selectedOrder) ===
                  "ready_for_approval" && (
                  <div
                    className={`mt-4 rounded-xl border p-3 text-sm font-bold ${
                      selectedOrderProofs.some(
                        (proof) =>
                          proof.order_stage_work_id ===
                            activeWorkByOrder.get(selectedOrder.id)?.id &&
                          proof.file_type === "photo"
                      )
                        ? "border-green-200 bg-green-50 text-green-800"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {selectedOrderProofs.some(
                      (proof) =>
                        proof.order_stage_work_id ===
                          activeWorkByOrder.get(selectedOrder.id)?.id &&
                        proof.file_type === "photo"
                    )
                      ? "✓ Current Stage Photo Proof Available"
                      : "⚠ Current Stage Photo Proof Not Found"}
                  </div>
                )}
                  </div>
                )}
              </div>

              {selectedOrder.current_stage !== "completed" &&
                selectedOrder.current_stage !== "cancelled" && (
                  <div className="yf-card p-4">
                    <p className="text-xs font-black text-slate-400 mb-3">
                      WORKFLOW ACTIONS
                    </p>

                    <div className="grid sm:grid-cols-2 gap-2">
                      {(["assigned", "rework"] as WorkflowStatus[]).includes(
                        effectiveWorkflowStatus(selectedOrder)
                      ) && (
                        <button
                          type="button"
                          onClick={() => startWork(selectedOrder)}
                          disabled={actionId === `start-${selectedOrder.id}`}
                          className="yf-btn yf-btn-secondary"
                        >
                          ▶ Start Work
                        </button>
                      )}

                      {effectiveWorkflowStatus(selectedOrder) ===
                        "ready_for_approval" &&
                        (getNextStage(selectedOrder) ? (
                          <button
                            type="button"
                            onClick={() =>
                              moveToStage(
                                selectedOrder,
                                getNextStage(selectedOrder)!,
                                "next_stage"
                              )
                            }
                            disabled={actionId === `move-${selectedOrder.id}`}
                            className="yf-btn yf-btn-success"
                          >
                            Approve → {getNextStage(selectedOrder)!.name}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => completeOrder(selectedOrder)}
                            disabled={
                              actionId === `complete-${selectedOrder.id}`
                            }
                            className="yf-btn yf-btn-success"
                          >
                            ✓ Approve & Complete Order
                          </button>
                        ))}

                      {effectiveWorkflowStatus(selectedOrder) ===
                        "ready_for_approval" && (
                        <div className="sm:col-span-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-bold text-purple-700">
                          ✓ Employee Work Complete — Admin Approval Required
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => markHold(selectedOrder)}
                        disabled={actionId === `hold-${selectedOrder.id}`}
                        className="yf-btn bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                      >
                        ⏸ Hold
                      </button>

                      <button
                        type="button"
                        onClick={() => markRework(selectedOrder)}
                        disabled={actionId === `rework-${selectedOrder.id}`}
                        className="yf-btn bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                      >
                        ↻ Rework
                      </button>
                    </div>

                    <div className="border-t border-slate-200 mt-4 pt-4">
                      <p className="text-xs font-black text-slate-400 mb-2">
                        CHANGE STAGE
                      </p>

                      <div className="flex gap-2">
                        <select
                          value={stageSelection}
                          onChange={(event) =>
                            setStageSelection(event.target.value)
                          }
                          className="yf-input flex-1"
                        >
                          {selectableStagesForOrder(selectedOrder).map(
                            (stage) => (
                              <option key={stage.id} value={stage.id}>
                                {stage.name}
                              </option>
                            )
                          )}
                        </select>

                        <button
                          type="button"
                          disabled={
                            !stageSelection ||
                            actionId === `move-${selectedOrder.id}`
                          }
                          onClick={() => {
                            const target = stageMap.get(stageSelection);
                            if (target) {
                              moveToStage(
                                selectedOrder,
                                target,
                                "admin_change"
                              );
                            }
                          }}
                          className="yf-btn yf-btn-secondary"
                        >
                          Change
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              {(canViewPayments ||
                canManagePayments ||
                canManageBilling) && (
                <div className="space-y-4">
                  {financeLoading && (
                    <div className="yf-card p-4 text-sm font-bold text-slate-500">
                      Payment / Billing data લોડ થઈ રહ્યું છે...
                    </div>
                  )}

                  {!financeLoading &&
                    (canViewPayments ||
                      canManagePayments) && (
                      <div className="yf-card p-4 border border-emerald-200">
                        <button
                          type="button"
                          onClick={() => setShowPayment((current) => !current)}
                          className="w-full flex items-start justify-between gap-3 text-left"
                        >
                          <div>
                            <p className="text-xs font-black tracking-[0.12em] text-emerald-700">
                              PAYMENT — SENSITIVE
                            </p>
                            <p className="text-sm font-bold text-slate-700 mt-1">
                              Authorized Accounts / Admin only
                            </p>
                          </div>

                          <span className="yf-badge bg-emerald-100 text-emerald-700">
                            {showPayment ? "▲" : "▼"} 🔒 Protected
                          </span>
                        </button>

                        {showPayment && (
                        canManagePayments ? (
                          <div className="grid sm:grid-cols-2 gap-3 mt-4">
                            <div>
                              <label className="block text-xs font-black text-slate-500 mb-1">
                                Payment Amount
                              </label>

                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  paymentForm.payment_amount
                                }
                                onChange={(event) =>
                                  setPaymentForm(
                                    (current) => ({
                                      ...current,
                                      payment_amount:
                                        event.target.value,
                                    })
                                  )
                                }
                                placeholder="₹ Amount"
                                className="yf-input"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-black text-slate-500 mb-1">
                                Payment Status
                              </label>

                              <select
                                value={
                                  paymentForm.payment_status
                                }
                                onChange={(event) =>
                                  setPaymentForm(
                                    (current) => ({
                                      ...current,
                                      payment_status:
                                        event.target
                                          .value as OrderPayment["payment_status"],
                                    })
                                  )
                                }
                                className="yf-input"
                              >
                                <option value="pending">
                                  Pending
                                </option>
                                <option value="partial">
                                  Partial
                                </option>
                                <option value="paid">
                                  Paid
                                </option>
                                <option value="refunded">
                                  Refunded
                                </option>
                                <option value="not_applicable">
                                  Not Applicable
                                </option>
                              </select>
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-black text-slate-500 mb-1">
                                Payment Receiver
                              </label>

                              <input
                                value={
                                  paymentForm.payment_receiver_name
                                }
                                onChange={(event) =>
                                  setPaymentForm(
                                    (current) => ({
                                      ...current,
                                      payment_receiver_name:
                                        event.target.value,
                                    })
                                  )
                                }
                                placeholder="Receiver name"
                                className="yf-input"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="block text-xs font-black text-slate-500 mb-1">
                                Payment Note
                              </label>

                              <textarea
                                rows={2}
                                value={
                                  paymentForm.payment_note
                                }
                                onChange={(event) =>
                                  setPaymentForm(
                                    (current) => ({
                                      ...current,
                                      payment_note:
                                        event.target.value,
                                    })
                                  )
                                }
                                className="yf-input resize-none"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={
                                savePaymentDetails
                              }
                              disabled={paymentSaving}
                              className="yf-btn yf-btn-success sm:col-span-2 disabled:opacity-50"
                            >
                              {paymentSaving
                                ? "Saving..."
                                : "Save Payment Details"}
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-black text-slate-400">
                                AMOUNT
                              </p>
                              <p className="font-black mt-1">
                                {selectedPayment?.payment_amount ==
                                null
                                  ? "-"
                                  : `₹${Number(
                                      selectedPayment.payment_amount
                                    ).toLocaleString(
                                      "en-IN"
                                    )}`}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-black text-slate-400">
                                STATUS
                              </p>
                              <p className="font-black mt-1 capitalize">
                                {selectedPayment?.payment_status?.replace(
                                  /_/g,
                                  " "
                                ) || "Pending"}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3 col-span-2">
                              <p className="text-xs font-black text-slate-400">
                                RECEIVER
                              </p>
                              <p className="font-black mt-1">
                                {selectedPayment?.payment_receiver_name ||
                                  "-"}
                              </p>
                            </div>

                            {selectedPayment?.payment_note && (
                              <div className="rounded-xl bg-slate-50 p-3 col-span-2">
                                <p className="text-xs font-black text-slate-400">
                                  NOTE
                                </p>
                                <p className="font-semibold mt-1">
                                  {selectedPayment.payment_note}
                                </p>
                              </div>
                            )}
                          </div>
                        )
                        )}
                      </div>
                    )}

                  {!financeLoading &&
                    canManageBilling && (
                      <div className="yf-card p-4 border border-indigo-200">
                        <button
                          type="button"
                          onClick={() => setShowBilling((current) => !current)}
                          className="w-full flex items-start justify-between gap-3 text-left"
                        >
                          <div>
                            <p className="text-xs font-black tracking-[0.12em] text-indigo-700">
                              BILLING — SENSITIVE
                            </p>
                            <p className="text-sm font-bold text-slate-700 mt-1">
                              Bill status અને Bill Number protected છે
                            </p>
                          </div>

                          <span className="yf-badge bg-indigo-100 text-indigo-700">
                            {showBilling ? "▲" : "▼"} 🔒 Protected
                          </span>
                        </button>

                        {showBilling && (
                        <div className="grid sm:grid-cols-2 gap-3 mt-4">
                          <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={
                                billingForm.bill_created
                              }
                              onChange={(event) =>
                                setBillingForm(
                                  (current) => ({
                                    ...current,
                                    bill_created:
                                      event.target
                                        .checked,
                                  })
                                )
                              }
                            />

                            <span className="font-black">
                              Bill Created
                            </span>
                          </label>

                          <div>
                            <label className="block text-xs font-black text-slate-500 mb-1">
                              Bill Number
                            </label>

                            <input
                              value={
                                billingForm.bill_number
                              }
                              onChange={(event) =>
                                setBillingForm(
                                  (current) => ({
                                    ...current,
                                    bill_number:
                                      event.target.value,
                                  })
                                )
                              }
                              placeholder="Invoice / Bill No."
                              className="yf-input"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-black text-slate-500 mb-1">
                              Bill Date
                            </label>

                            <input
                              type="date"
                              value={
                                billingForm.bill_date
                              }
                              onChange={(event) =>
                                setBillingForm(
                                  (current) => ({
                                    ...current,
                                    bill_date:
                                      event.target.value,
                                  })
                                )
                              }
                              className="yf-input"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-black text-slate-500 mb-1">
                              Billing Note
                            </label>

                            <textarea
                              rows={2}
                              value={
                                billingForm.billing_note
                              }
                              onChange={(event) =>
                                setBillingForm(
                                  (current) => ({
                                    ...current,
                                    billing_note:
                                      event.target.value,
                                  })
                                )
                              }
                              className="yf-input resize-none"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={
                              saveBillingDetails
                            }
                            disabled={billingSaving}
                            className="yf-btn yf-btn-primary sm:col-span-2 disabled:opacity-50"
                          >
                            {billingSaving
                              ? "Saving..."
                              : "Save Billing Details"}
                          </button>
                        </div>
                        )}
                      </div>
                    )}
                </div>
              )}

              <div className="yf-card p-4">
                <p className="text-xs font-black text-slate-400">
                  ORDER DETAILS
                </p>

                <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                  <div>
                    <p className="text-slate-400">Mobile</p>
                    <p className="font-bold">
                      {selectedOrder.customer_mobile || "-"}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Quantity</p>
                    <p className="font-bold">{selectedOrder.quantity}</p>
                  </div>

                  <div>
                    <p className="text-slate-400">Source</p>
                    <p className="font-bold capitalize">
                      {selectedOrder.order_source}
                    </p>
                  </div>

                  <div>
                    <p className="text-slate-400">Mode</p>
                    <p className="font-bold">
                      {formatStage(selectedOrder.workflow_mode)}
                    </p>
                  </div>
                </div>

                {selectedOrder.product_configuration &&
                  Object.keys(selectedOrder.product_configuration).length >
                    0 && (
                    <div className="mt-4 bg-blue-50 rounded-xl p-3">
                      <p className="text-xs font-black text-blue-700 mb-2">
                        PRODUCT CONFIGURATION
                      </p>

                      {Object.entries(
                        selectedOrder.product_configuration
                      ).map(([key, value]) => (
                        <p key={key} className="text-sm mt-1">
                          <span className="font-black">{key}:</span> {value}
                        </p>
                      ))}
                    </div>
                  )}

                {activeWorkByOrder.get(selectedOrder.id)?.hold_reason && (
                  <div className="mt-3 bg-amber-50 rounded-xl p-3">
                    <p className="font-black text-amber-800">Hold Reason</p>
                    <p className="text-sm mt-1">
                      {activeWorkByOrder.get(selectedOrder.id)?.hold_reason}
                    </p>
                  </div>
                )}

                {activeWorkByOrder.get(selectedOrder.id)?.rework_reason && (
                  <div className="mt-3 bg-red-50 rounded-xl p-3">
                    <p className="font-black text-red-700">Rework Reason</p>
                    <p className="text-sm mt-1">
                      {activeWorkByOrder.get(selectedOrder.id)?.rework_reason}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowEdit((current) => !current)}
                  className="yf-btn yf-btn-secondary"
                >
                  ✎ Edit Order Details
                </button>

                <button
                  type="button"
                  onClick={() =>
                    router.push(`/admin/orders/${selectedOrder.id}`)
                  }
                  className="yf-btn yf-btn-secondary"
                >
                  Full Details / History →
                </button>
              </div>

              {isSafeDeleteCandidate(selectedOrder) && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-black text-red-700">
                    MISTAKEN LATEST ORDER
                  </p>
                  <p className="text-xs font-semibold text-slate-600 mt-1">
                    આ latest Order હજુ production start થયું નથી. Safe delete પછી
                    next Order આ number reuse કરી શકે છે.
                  </p>

                  <button
                    type="button"
                    onClick={() => deleteMistakenDraft(selectedOrder)}
                    disabled={actionId === `delete-${selectedOrder.id}`}
                    className="yf-btn bg-red-600 text-white hover:bg-red-700 mt-3 disabled:opacity-50"
                  >
                    {actionId === `delete-${selectedOrder.id}`
                      ? "Deleting..."
                      : "Delete Mistaken Draft"}
                  </button>
                </div>
              )}

              {showEdit && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-5">
                  <button
                    type="button"
                    aria-label="Close Edit Order Details"
                    onClick={() => setShowEdit(false)}
                    className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]"
                  />

                  <section
                    className="relative z-10 w-full max-w-xl max-h-[90dvh] rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black tracking-[0.15em] text-blue-700">
                          EDIT ORDER
                        </p>
                        <h3 className="text-lg font-black text-slate-900 mt-0.5">
                          Edit Order Details
                        </h3>
                        <p className="text-[11px] font-semibold text-slate-500 mt-0.5 truncate">
                          {selectedOrder.order_number} • {selectedOrder.customer_name}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowEdit(false)}
                        className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 font-black shrink-0"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <input
                          value={editForm.customer_name}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              customer_name: event.target.value,
                            }))
                          }
                          placeholder="Customer Name"
                          className="yf-input"
                        />

                        <input
                          value={editForm.customer_mobile}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              customer_mobile: event.target.value,
                            }))
                          }
                          placeholder="Mobile"
                          className="yf-input"
                        />

                        <input
                          type="number"
                          min="1"
                          value={editForm.quantity}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              quantity: event.target.value,
                            }))
                          }
                          placeholder="Quantity"
                          className="yf-input"
                        />

                        <select
                          value={editForm.priority}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              priority: event.target.value as Priority,
                            }))
                          }
                          className="yf-input"
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>

                        <input
                          type="date"
                          value={editForm.due_date}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              due_date: event.target.value,
                            }))
                          }
                          className="yf-input sm:col-span-2"
                        />

                        <textarea
                          rows={3}
                          value={editForm.customer_note}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              customer_note: event.target.value,
                            }))
                          }
                          placeholder="Customer Note"
                          className="yf-input resize-none sm:col-span-2"
                        />

                        <textarea
                          rows={3}
                          value={editForm.admin_note}
                          onChange={(event) =>
                            setEditForm((current) => ({
                              ...current,
                              admin_note: event.target.value,
                            }))
                          }
                          placeholder="Admin Note"
                          className="yf-input resize-none sm:col-span-2"
                        />
                      </div>
                    </div>

                    <div className="shrink-0 border-t border-slate-200 bg-white p-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowEdit(false)}
                        className="yf-btn yf-btn-secondary justify-center"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={saveOrderDetails}
                        disabled={actionId === `edit-${selectedOrder.id}`}
                        className="yf-btn yf-btn-primary justify-center disabled:opacity-50"
                      >
                        {actionId === `edit-${selectedOrder.id}`
                          ? "Saving..."
                          : "Save Changes"}
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
