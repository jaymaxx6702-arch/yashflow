import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

function chunks<T>(items: T[], size = 100) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ error: "Admin session required." }, { status: 401 });
    }

    const db = integrationSupabase();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid admin session." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await db
      .from("employees")
      .select("id, role, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile ||
      profile.role !== "admin" ||
      profile.approval_status !== "approved" ||
      !profile.is_active
    ) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const { data: orderRows, error: orderError } = await db
      .from("orders")
      .select("id");

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    const orderIds = (orderRows || []).map((row) => row.id);

    if (!orderIds.length) {
      return NextResponse.json({ ok: true, deleted_orders: 0, already_clean: true });
    }

    const { data: proofRows } = await db
      .from("order_stage_proofs")
      .select("file_path")
      .in("order_id", orderIds);

    const proofPaths = (proofRows || [])
      .map((row) => row.file_path)
      .filter((value): value is string => Boolean(value));

    for (const batch of chunks(proofPaths)) {
      await db.storage.from("workflow-proofs").remove(batch);
    }

    const { data: workRows, error: workError } = await db
      .from("order_stage_work")
      .select("id")
      .in("order_id", orderIds);

    if (workError) {
      return NextResponse.json({ error: workError.message }, { status: 500 });
    }

    const workIds = (workRows || []).map((row) => row.id);

    async function removeRows(table: string, column: string, ids: string[]) {
      if (!ids.length) return;
      for (const batch of chunks(ids)) {
        const { error } = await db.from(table).delete().in(column, batch);
        if (error && error.code !== "42P01") {
          throw new Error(`${table}: ${error.message}`);
        }
      }
    }

    await removeRows("order_stage_workers", "order_stage_work_id", workIds);
    await removeRows("order_stage_proofs", "order_id", orderIds);
    await removeRows("order_product_configurations", "order_id", orderIds);
    await removeRows("order_stage_history", "order_id", orderIds);
    await removeRows("order_workflow_history", "order_id", orderIds);
    await removeRows("order_operation_details", "order_id", orderIds);
    await removeRows("order_inventory_consumptions", "order_id", orderIds);
    await removeRows("order_payments", "order_id", orderIds);
    await removeRows("order_billing", "order_id", orderIds);
    await removeRows("order_dispatch_records", "order_id", orderIds);
    await removeRows("website_order_imports", "yashflow_order_id", orderIds);
    await removeRows("order_stage_work", "order_id", orderIds);
    await removeRows("orders", "id", orderIds);

    return NextResponse.json({
      ok: true,
      deleted_orders: orderIds.length,
      deleted_proof_files: proofPaths.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Order reset failed." },
      { status: 500 }
    );
  }
}
