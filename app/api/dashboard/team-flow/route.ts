import { NextResponse } from "next/server";
import { pushAuth } from "@/utils/push-auth";

const ACTIVE_ORDER_STATUSES = [
  "waiting",
  "assigned",
  "in_progress",
  "ready_for_approval",
  "hold",
  "rework",
];

const ACTIVE_TASK_STATUSES = ["pending", "in_progress"];

type EmployeeRow = {
  id: string;
  full_name: string;
  department: string | null;
  is_active: boolean;
  approval_status: string;
};

type OrderRow = {
  id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  priority: string;
  due_date: string | null;
  workflow_status: string | null;
  current_stage_id: string | null;
  updated_at: string;
};

type WorkRow = {
  id: string;
  order_id: string;
  stage_id: string;
  sequence_no: number | null;
  status: string;
  primary_employee_id: string | null;
  updated_at: string;
};

type PlanRow = {
  id: string;
  order_id: string;
  stage_id: string;
  sequence_no: number;
  primary_employee_id: string | null;
  activated_at: string | null;
};

type StageRow = {
  id: string;
  name: string;
};

type WorkWorkerRow = {
  order_stage_work_id: string;
  employee_id: string;
  left_at: string | null;
};

type PlanWorkerRow = {
  order_stage_plan_id: string;
  employee_id: string;
};

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  updated_at: string;
};

type TaskSupportRow = {
  task_id: string;
  employee_id: string;
  is_active: boolean;
};

function uniqueNames(ids: Array<string | null>, employeeMap: Map<string, EmployeeRow>) {
  return Array.from(
    new Set(
      ids
        .filter((id): id is string => Boolean(id))
        .map((id) => employeeMap.get(id)?.full_name || "")
        .filter(Boolean)
    )
  );
}

export async function GET(request: Request) {
  const auth = await pushAuth(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (
    auth.profile.approval_status !== "approved" ||
    !auth.profile.is_active
  ) {
    return NextResponse.json(
      { error: "Active approved employee required." },
      { status: 403 }
    );
  }

  const db = auth.db;

  const [
    employeesResult,
    ordersResult,
    activeWorksResult,
    plansResult,
    stagesResult,
    workWorkersResult,
    planWorkersResult,
    activeTasksResult,
    taskSupportResult,
    allTasksResult,
  ] = await Promise.all([
    db
      .from("employees")
      .select("id, full_name, department, is_active, approval_status")
      .eq("is_active", true)
      .eq("approval_status", "approved"),
    db
      .from("orders")
      .select("id, order_number, product_name, quantity, priority, due_date, workflow_status, current_stage_id, updated_at")
      .not("workflow_status", "in", '("completed","cancelled")'),
    db
      .from("order_stage_work")
      .select("id, order_id, stage_id, sequence_no, status, primary_employee_id, updated_at")
      .in("status", ACTIVE_ORDER_STATUSES),
    db
      .from("order_stage_plans")
      .select("id, order_id, stage_id, sequence_no, primary_employee_id, activated_at"),
    db
      .from("workflow_stages")
      .select("id, name"),
    db
      .from("order_stage_workers")
      .select("order_stage_work_id, employee_id, left_at")
      .is("left_at", null),
    db
      .from("order_stage_plan_workers")
      .select("order_stage_plan_id, employee_id"),
    db
      .from("tasks")
      .select("id, title, priority, status, due_date, assigned_to, updated_at")
      .in("status", ACTIVE_TASK_STATUSES),
    db
      .from("task_support_workers")
      .select("task_id, employee_id, is_active")
      .eq("is_active", true),
    db
      .from("tasks")
      .select("id, status, completed_at"),
  ]);

  const firstError =
    employeesResult.error ||
    ordersResult.error ||
    activeWorksResult.error ||
    plansResult.error ||
    stagesResult.error ||
    workWorkersResult.error ||
    planWorkersResult.error ||
    activeTasksResult.error ||
    taskSupportResult.error ||
    allTasksResult.error;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const employees = (employeesResult.data || []) as EmployeeRow[];
  const orders = (ordersResult.data || []) as OrderRow[];
  const works = (activeWorksResult.data || []) as WorkRow[];
  const plans = (plansResult.data || []) as PlanRow[];
  const stages = (stagesResult.data || []) as StageRow[];
  const workWorkers = (workWorkersResult.data || []) as WorkWorkerRow[];
  const planWorkers = (planWorkersResult.data || []) as PlanWorkerRow[];
  const activeTasks = (activeTasksResult.data || []) as TaskRow[];
  const taskSupport = (taskSupportResult.data || []) as TaskSupportRow[];
  const allTasks = (allTasksResult.data || []) as Array<{
    id: string;
    status: string;
    completed_at: string | null;
  }>;

  const employeeMap = new Map(employees.map((row) => [row.id, row]));
  const stageMap = new Map(stages.map((row) => [row.id, row.name]));

  const worksByOrder = new Map<string, WorkRow[]>();
  for (const work of works) {
    const list = worksByOrder.get(work.order_id) || [];
    list.push(work);
    worksByOrder.set(work.order_id, list);
  }

  const plansByOrder = new Map<string, PlanRow[]>();
  for (const plan of plans) {
    const list = plansByOrder.get(plan.order_id) || [];
    list.push(plan);
    plansByOrder.set(plan.order_id, list);
  }
  for (const list of plansByOrder.values()) {
    list.sort((a, b) => a.sequence_no - b.sequence_no);
  }

  const workWorkersByWork = new Map<string, string[]>();
  for (const row of workWorkers) {
    const list = workWorkersByWork.get(row.order_stage_work_id) || [];
    list.push(row.employee_id);
    workWorkersByWork.set(row.order_stage_work_id, list);
  }

  const planWorkersByPlan = new Map<string, string[]>();
  for (const row of planWorkers) {
    const list = planWorkersByPlan.get(row.order_stage_plan_id) || [];
    list.push(row.employee_id);
    planWorkersByPlan.set(row.order_stage_plan_id, list);
  }

  const taskSupportByTask = new Map<string, string[]>();
  for (const row of taskSupport) {
    const list = taskSupportByTask.get(row.task_id) || [];
    list.push(row.employee_id);
    taskSupportByTask.set(row.task_id, list);
  }

  const workload = new Map(
    employees.map((employee) => [
      employee.id,
      {
        employeeId: employee.id,
        name: employee.full_name,
        department: employee.department,
        currentOrders: 0,
        currentTasks: 0,
        upcomingOrders: 0,
      },
    ])
  );

  const orderItems = orders.map((order) => {
    const orderWorks = [...(worksByOrder.get(order.id) || [])].sort(
      (a, b) =>
        (b.sequence_no ?? -1) - (a.sequence_no ?? -1) ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    const currentWork =
      orderWorks.find((work) => work.stage_id === order.current_stage_id) ||
      orderWorks[0] ||
      null;

    const orderPlans = plansByOrder.get(order.id) || [];
    const currentPlan =
      orderPlans.find((plan) => plan.stage_id === (currentWork?.stage_id || order.current_stage_id)) ||
      orderPlans.find((plan) => plan.activated_at) ||
      orderPlans[0] ||
      null;

    const currentSequence =
      currentWork?.sequence_no ?? currentPlan?.sequence_no ?? null;

    const nextPlan =
      currentSequence === null
        ? orderPlans.find((plan) => !plan.activated_at) || null
        : orderPlans.find((plan) => plan.sequence_no > currentSequence) || null;

    const currentPrimaryId =
      currentWork?.primary_employee_id || currentPlan?.primary_employee_id || null;

    const currentWorkerIds = uniqueNames(
      [
        currentPrimaryId,
        ...(currentWork
          ? workWorkersByWork.get(currentWork.id) || []
          : currentPlan
          ? planWorkersByPlan.get(currentPlan.id) || []
          : []),
      ],
      employeeMap
    );

    const nextWorkerIds = uniqueNames(
      [
        nextPlan?.primary_employee_id || null,
        ...(nextPlan ? planWorkersByPlan.get(nextPlan.id) || [] : []),
      ],
      employeeMap
    );

    const currentIds = Array.from(
      new Set([
        currentPrimaryId,
        ...(currentWork ? workWorkersByWork.get(currentWork.id) || [] : []),
      ].filter((id): id is string => Boolean(id)))
    );

    for (const employeeId of currentIds) {
      const row = workload.get(employeeId);
      if (row) row.currentOrders += 1;
    }

    const nextIds = Array.from(
      new Set([
        nextPlan?.primary_employee_id || null,
        ...(nextPlan ? planWorkersByPlan.get(nextPlan.id) || [] : []),
      ].filter((id): id is string => Boolean(id)))
    );

    for (const employeeId of nextIds) {
      const row = workload.get(employeeId);
      if (row) row.upcomingOrders += 1;
    }

    return {
      type: "order" as const,
      id: order.id,
      reference: order.order_number,
      title: order.product_name,
      quantity: order.quantity,
      priority: order.priority || "normal",
      status: currentWork?.status || order.workflow_status || "waiting",
      dueDate: order.due_date,
      currentStage: stageMap.get(currentWork?.stage_id || currentPlan?.stage_id || "") || "Stage",
      currentEmployees: currentWorkerIds,
      nextStage: nextPlan ? stageMap.get(nextPlan.stage_id) || "Next Stage" : null,
      nextEmployees: nextWorkerIds,
      updatedAt: currentWork?.updated_at || order.updated_at,
    };
  });

  const taskItems = activeTasks.map((task) => {
    const participantIds = Array.from(
      new Set(
        [
          task.assigned_to,
          ...(taskSupportByTask.get(task.id) || []),
        ].filter((id): id is string => Boolean(id))
      )
    );

    for (const employeeId of participantIds) {
      const row = workload.get(employeeId);
      if (row) row.currentTasks += 1;
    }

    return {
      type: "task" as const,
      id: task.id,
      reference: "TASK",
      title: task.title,
      quantity: null,
      priority: task.priority || "medium",
      status: task.status,
      dueDate: task.due_date,
      currentStage: "Task",
      currentEmployees: uniqueNames(participantIds, employeeMap),
      nextStage: null,
      nextEmployees: [],
      updatedAt: task.updated_at,
    };
  });

  const today = new Date().toISOString().slice(0, 10);
  const completedTasks = allTasks.filter((task) => task.status === "completed");

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    summary: {
      activeOrders: orderItems.length,
      activeTasks: taskItems.length,
      totalTasks: allTasks.length,
      completedTasks: completedTasks.length,
      completedToday: completedTasks.filter(
        (task) => task.completed_at?.slice(0, 10) === today
      ).length,
    },
    workload: Array.from(workload.values())
      .filter(
        (row) =>
          row.currentOrders > 0 ||
          row.currentTasks > 0 ||
          row.upcomingOrders > 0
      )
      .sort(
        (a, b) =>
          b.currentOrders +
          b.currentTasks +
          b.upcomingOrders -
          (a.currentOrders + a.currentTasks + a.upcomingOrders)
      ),
    items: [...orderItems, ...taskItems].sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }),
  });
}
