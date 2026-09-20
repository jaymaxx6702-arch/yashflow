import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

const ACTIVE_WORK = ["waiting", "assigned", "in_progress", "ready_for_approval", "hold", "rework"];

async function authorisedEmployee(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Session required.", status: 401 } as const;

  const db = integrationSupabase();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return { error: "Invalid session.", status: 401 } as const;

  const { data: profile, error: profileError } = await db
    .from("employees")
    .select("id, role, approval_status, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.approval_status !== "approved" || !profile.is_active) {
    return { error: "Active employee profile required.", status: 403 } as const;
  }

  if (profile.role === "admin") return { db, profile } as const;

  const { data: permission } = await db
    .from("app_permissions")
    .select("id")
    .eq("permission_key", "orders.create")
    .eq("is_active", true)
    .maybeSingle();

  if (!permission) return { error: "Order Create permission is not configured.", status: 403 } as const;

  const { data: grant } = await db
    .from("employee_app_permissions")
    .select("id")
    .eq("employee_id", profile.id)
    .eq("permission_id", permission.id)
    .eq("is_allowed", true)
    .maybeSingle();

  if (!grant) return { error: "Order Create access નથી.", status: 403 } as const;
  return { db, profile } as const;
}

export async function GET(request: Request) {
  const auth = await authorisedEmployee(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { db } = auth;

  const [products, options, values, dependencies] = await Promise.all([
    db.from("products").select("id,name").eq("is_active", true).order("name"),
    db.from("product_options").select("id,product_id,name,sort_order,is_required,is_active").eq("is_active", true).order("sort_order"),
    db.from("product_option_values").select("id,product_option_id,value,parent_value_id,sort_order,is_active").eq("is_active", true).order("sort_order"),
    db.from("product_value_dependencies").select("id,value_id,parent_value_id"),
  ]);

  const firstError = products.error || options.error || values.error || dependencies.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    products: products.data || [],
    options: options.data || [],
    values: values.data || [],
    dependencies: dependencies.data || [],
  });
}

export async function POST(request: Request) {
  const auth = await authorisedEmployee(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { db, profile } = auth;

  const body = await request.json().catch(() => null) as {
    customerName?: string;
    customerMobile?: string;
    productId?: string;
    quantity?: number;
    orderSource?: string;
    priority?: string;
    dueDate?: string;
    customerNote?: string;
    adminNote?: string;
    selectedConfig?: Record<string, string>;
  } | null;

  if (!body?.customerName?.trim()) return NextResponse.json({ error: "Customer Name જરૂરી છે." }, { status: 400 });
  if (!body.productId) return NextResponse.json({ error: "Product select કરો." }, { status: 400 });
  const qty = Number(body.quantity);
  if (!Number.isInteger(qty) || qty <= 0) {
    return NextResponse.json({ error: "Quantity સાચી નાખો." }, { status: 400 });
  }

  const { data: product, error: productError } = await db
    .from("products")
    .select("id,name")
    .eq("id", body.productId)
    .eq("is_active", true)
    .maybeSingle();

  if (productError || !product) return NextResponse.json({ error: productError?.message || "Product મળ્યો નથી." }, { status: 400 });

  const { data: options, error: optionsError } = await db
    .from("product_options")
    .select("id,name,is_required,sort_order")
    .eq("product_id", product.id)
    .eq("is_active", true)
    .order("sort_order");

  if (optionsError) return NextResponse.json({ error: optionsError.message }, { status: 500 });

  const selectedConfig = body.selectedConfig || {};
  for (const option of options || []) {
    if (option.is_required && !selectedConfig[option.id]) {
      return NextResponse.json({ error: `${option.name} select કરવું જરૂરી છે.` }, { status: 400 });
    }
  }

  const selectedValueIds = Object.values(selectedConfig).filter(Boolean);
  const configurationSnapshot: Record<string, string> = {};

  if (selectedValueIds.length) {
    const { data: selectedValues, error: valueError } = await db
      .from("product_option_values")
      .select("id,product_option_id,value")
      .in("id", selectedValueIds);

    if (valueError) return NextResponse.json({ error: valueError.message }, { status: 500 });
    const valueMap = new Map((selectedValues || []).map((row) => [row.id, row]));

    for (const option of options || []) {
      const value = valueMap.get(selectedConfig[option.id]);
      if (value) configurationSnapshot[option.name] = value.value;
    }
  }

  const { data: templates, error: templateError } = await db
    .from("workflow_templates")
    .select("id,name,product_id,workflow_mode,is_default,is_active")
    .eq("is_active", true);

  if (templateError) return NextResponse.json({ error: templateError.message }, { status: 500 });

  const workflow =
    (templates || []).find((row) => row.product_id === product.id) ||
    (templates || []).find((row) => row.is_default);

  if (!workflow) return NextResponse.json({ error: "Active Workflow મળ્યો નથી." }, { status: 400 });

  const { data: templateStages, error: templateStageError } = await db
    .from("workflow_template_stages")
    .select("id,template_id,stage_id,sequence_no,assignment_rule,default_employee_id,auto_method,last_assigned_employee_id")
    .eq("template_id", workflow.id)
    .order("sequence_no");

  if (templateStageError || !templateStages?.length) {
    return NextResponse.json({ error: templateStageError?.message || "Workflow Stage મળ્યો નથી." }, { status: 400 });
  }

  const firstTemplateStage = templateStages[0];
  const { data: firstStage, error: stageError } = await db
    .from("workflow_stages")
    .select("id,code,name")
    .eq("id", firstTemplateStage.stage_id)
    .maybeSingle();

  if (stageError || !firstStage) return NextResponse.json({ error: stageError?.message || "First Stage મળ્યો નથી." }, { status: 400 });

  const { data: configuredWorkers } = await db
    .from("workflow_template_stage_workers")
    .select("employee_id,is_primary,sort_order")
    .eq("workflow_template_stage_id", firstTemplateStage.id)
    .order("sort_order");

  const candidates = (configuredWorkers || []).map((row) => row.employee_id);
  let primaryId: string | null = null;
  let supportIds: string[] = [];

  if (firstTemplateStage.assignment_rule === "single_default" && candidates.length) {
    primaryId = firstTemplateStage.default_employee_id ||
      configuredWorkers?.find((row) => row.is_primary)?.employee_id ||
      candidates[0];
  } else if (firstTemplateStage.assignment_rule === "default_team" && candidates.length) {
    primaryId = firstTemplateStage.default_employee_id ||
      configuredWorkers?.find((row) => row.is_primary)?.employee_id ||
      candidates[0];
    supportIds = candidates.filter((id) => id !== primaryId);
  } else if (firstTemplateStage.assignment_rule === "auto_assign" && candidates.length) {
    if (firstTemplateStage.auto_method === "round_robin") {
      const index = candidates.indexOf(firstTemplateStage.last_assigned_employee_id || "");
      primaryId = candidates[(index + 1 + candidates.length) % candidates.length];
    } else {
      const { data: activeWorks } = await db
        .from("order_stage_work")
        .select("primary_employee_id,status")
        .in("status", ACTIVE_WORK);

      const load = new Map(candidates.map((id) => [id, 0]));
      for (const work of activeWorks || []) {
        if (work.primary_employee_id && load.has(work.primary_employee_id)) {
          load.set(work.primary_employee_id, (load.get(work.primary_employee_id) || 0) + 1);
        }
      }
      primaryId = [...candidates].sort((a, b) => (load.get(a) || 0) - (load.get(b) || 0))[0];
    }
  }

  const workflowStatus = primaryId ? "assigned" : "waiting";
  const { data: newOrder, error: orderError } = await db
    .from("orders")
    .insert({
      order_number: "AUTO",
      customer_name: body.customerName.trim(),
      customer_mobile: body.customerMobile?.trim() || null,
      product_id: product.id,
      product_name: product.name,
      product_configuration: configurationSnapshot,
      quantity: qty,
      order_source: body.orderSource || "other",
      current_stage: firstStage.code,
      current_stage_id: firstStage.id,
      workflow_template_id: workflow.id,
      workflow_mode: workflow.workflow_mode,
      workflow_status: workflowStatus,
      priority: body.priority || "normal",
      due_date: body.dueDate || null,
      customer_note: body.customerNote?.trim() || null,
      admin_note: body.adminNote?.trim() || null,
      created_by: profile.id,
    })
    .select("id,order_number")
    .single();

  if (orderError || !newOrder) return NextResponse.json({ error: orderError?.message || "Order create failed." }, { status: 500 });

  await db.from("order_product_configurations").insert({
    order_id: newOrder.id,
    product_id: product.id,
    product_name: product.name,
    configuration: configurationSnapshot,
  });

  await db.from("order_stage_history").insert({
    order_id: newOrder.id,
    from_stage: null,
    to_stage: firstStage.code,
    changed_by: profile.id,
    note: "Order Created",
  });

  const { data: workData } = await db.from("order_stage_work").insert({
    order_id: newOrder.id,
    stage_id: firstStage.id,
    sequence_no: firstTemplateStage.sequence_no || 10,
    status: workflowStatus,
    primary_employee_id: primaryId,
  }).select("id").single();

  if (workData?.id && primaryId) {
    await db.from("order_stage_workers").insert([
      { order_stage_work_id: workData.id, employee_id: primaryId, worker_role: "primary" },
      ...supportIds.map((employeeId) => ({ order_stage_work_id: workData.id, employee_id: employeeId, worker_role: "support" })),
    ]);
  }

  if (firstTemplateStage.assignment_rule === "auto_assign" && primaryId) {
    await db.from("workflow_template_stages")
      .update({ last_assigned_employee_id: primaryId })
      .eq("id", firstTemplateStage.id);
  }

  await db.from("order_workflow_history").insert({
    order_id: newOrder.id,
    order_stage_work_id: workData?.id || null,
    action_type: "order_created",
    from_stage_id: null,
    to_stage_id: firstStage.id,
    from_status: null,
    to_status: workflowStatus,
    employee_id: profile.id,
    note: `Workflow: ${workflow.name}`,
  });

  return NextResponse.json({
    ok: true,
    orderId: newOrder.id,
    orderNumber: newOrder.order_number,
    stage: firstStage.name,
  });
}
