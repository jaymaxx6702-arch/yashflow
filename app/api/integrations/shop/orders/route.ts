import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  integrationAuthorised,
  integrationSupabase,
} from "@/utils/supabase/integration-server";

type Item = {
  shopOrderItemId: string;
  shopProductId: string;
  productName: string;
  quantity: number;
  configuration?: Record<string, unknown>;
};

export async function POST(request: Request) {
  if (!integrationAuthorised(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const shopOrderId = typeof body?.shopOrderId === "string" ? body.shopOrderId : "";
  const orderNo = typeof body?.orderNo === "string" ? body.orderNo.slice(0, 60) : "";
  const customerName = typeof body?.customer?.name === "string" ? body.customer.name.slice(0, 120) : "";
  const customerMobile = typeof body?.customer?.mobile === "string" ? body.customer.mobile.slice(0, 30) : "";
  const items = Array.isArray(body?.items) ? (body.items as Item[]) : [];
  if (!shopOrderId || !orderNo || !customerName || !items.length || items.length > 100)
    return NextResponse.json({ error: "Invalid shop order payload." }, { status: 400 });

  const integrationEmployeeId = process.env.YASHFLOW_INTEGRATION_EMPLOYEE_ID;
  if (!integrationEmployeeId)
    return NextResponse.json(
      { error: "YASHFLOW_INTEGRATION_EMPLOYEE_ID is not configured." },
      { status: 503 },
    );

  const db = integrationSupabase();
  const productIds = Array.from(new Set(items.map((item) => item.shopProductId)));
  const { data: mappings, error: mappingError } = await db
    .from("website_product_mappings")
    .select("shop_product_id,yashflow_product_id")
    .in("shop_product_id", productIds)
    .eq("is_active", true);
  if (mappingError)
    return NextResponse.json({ error: mappingError.message }, { status: 500 });

  const map = new Map(
    (mappings || []).map((row) => [row.shop_product_id as string, row.yashflow_product_id as string]),
  );
  const missing = productIds.filter((id) => !map.has(id));
  if (missing.length)
    return NextResponse.json(
      { error: "Product mapping required.", code: "PRODUCT_MAPPING_REQUIRED", missing },
      { status: 409 },
    );

  const results: Array<{ shopOrderItemId: string; yashflowOrderId: string; orderNumber: string; existing: boolean }> = [];

  for (const item of items) {
    if (
      !item.shopOrderItemId ||
      !item.shopProductId ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
      return NextResponse.json({ error: "Invalid order item." }, { status: 400 });

    const { data: imported } = await db
      .from("website_order_imports")
      .select("yashflow_order_id")
      .eq("shop_order_item_id", item.shopOrderItemId)
      .maybeSingle();

    if (imported?.yashflow_order_id) {
      const { data: existingOrder } = await db
        .from("orders")
        .select("id,order_number")
        .eq("id", imported.yashflow_order_id)
        .maybeSingle();
      if (existingOrder) {
        results.push({
          shopOrderItemId: item.shopOrderItemId,
          yashflowOrderId: existingOrder.id,
          orderNumber: existingOrder.order_number,
          existing: true,
        });
        continue;
      }
    }

    const productId = map.get(item.shopProductId)!;
    const { data: product } = await db
      .from("products")
      .select("id,name")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();
    if (!product)
      return NextResponse.json({ error: `Mapped YashFlow product is unavailable for ${item.shopProductId}.` }, { status: 409 });

    let { data: workflow } = await db
      .from("workflow_templates")
      .select("id,name,workflow_mode")
      .eq("product_id", productId)
      .eq("is_active", true)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    if (!workflow) {
      const fallback = await db
        .from("workflow_templates")
        .select("id,name,workflow_mode")
        .eq("product_id", productId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      workflow = fallback.data;
    }
    if (!workflow)
      return NextResponse.json({ error: `Workflow mapping required for ${product.name}.` }, { status: 409 });

    const { data: firstTemplateStage } = await db
      .from("workflow_template_stages")
      .select("id,stage_id,sequence_no")
      .eq("template_id", workflow.id)
      .order("sequence_no", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstTemplateStage)
      return NextResponse.json({ error: `Workflow has no stages for ${product.name}.` }, { status: 409 });

    const { data: firstStage } = await db
      .from("workflow_stages")
      .select("id,code,name")
      .eq("id", firstTemplateStage.stage_id)
      .maybeSingle();
    if (!firstStage)
      return NextResponse.json({ error: "First workflow stage not found." }, { status: 409 });

    const configuration = {
      ...(item.configuration || {}),
      "Shop Order": orderNo,
      "Shop Item": item.shopOrderItemId,
    };

    const { data: newOrder, error: orderError } = await db
      .from("orders")
      .insert({
        order_number: "AUTO",
        customer_name: customerName,
        customer_mobile: customerMobile || null,
        product_id: product.id,
        product_name: product.name || item.productName,
        product_configuration: configuration,
        quantity: item.quantity,
        order_source: "website",
        current_stage: firstStage.code,
        current_stage_id: firstStage.id,
        workflow_template_id: workflow.id,
        workflow_mode: workflow.workflow_mode,
        workflow_status: "waiting",
        priority: "normal",
        customer_note: `Website order ${orderNo}`,
        admin_note: "Imported automatically from shop.yashlaser.in",
        created_by: integrationEmployeeId,
      })
      .select("id,order_number")
      .single();

    if (orderError || !newOrder)
      return NextResponse.json(
        { error: orderError?.message || "YashFlow order creation failed." },
        { status: 500 },
      );

    await db.from("order_product_configurations").insert({
      order_id: newOrder.id,
      product_id: product.id,
      product_name: product.name,
      configuration,
    });
    await db.from("order_stage_history").insert({
      order_id: newOrder.id,
      from_stage: null,
      to_stage: firstStage.code,
      changed_by: integrationEmployeeId,
      note: `Imported from website ${orderNo}`,
    });
    const { data: work } = await db
      .from("order_stage_work")
      .insert({
        order_id: newOrder.id,
        stage_id: firstStage.id,
        sequence_no: firstTemplateStage.sequence_no || 10,
        status: "waiting",
        primary_employee_id: null,
      })
      .select("id")
      .single();
    await db.from("order_workflow_history").insert({
      order_id: newOrder.id,
      order_stage_work_id: work?.id || null,
      action_type: "order_created",
      from_stage_id: null,
      to_stage_id: firstStage.id,
      from_status: null,
      to_status: "waiting",
      employee_id: integrationEmployeeId,
      note: `Website import · Workflow: ${workflow.name}`,
    });

    const payloadHash = createHash("sha256")
      .update(JSON.stringify(item))
      .digest("hex");
    await db.from("website_order_imports").insert({
      shop_order_id: shopOrderId,
      shop_order_no: orderNo,
      shop_order_item_id: item.shopOrderItemId,
      yashflow_order_id: newOrder.id,
      payload_hash: payloadHash,
    });

    results.push({
      shopOrderItemId: item.shopOrderItemId,
      yashflowOrderId: newOrder.id,
      orderNumber: newOrder.order_number,
      existing: false,
    });
  }

  return NextResponse.json({ ok: true, shopOrderId, orders: results });
}
