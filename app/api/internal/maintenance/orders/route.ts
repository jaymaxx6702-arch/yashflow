import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";
import { verifyGithubActionsOidc } from "@/utils/github-actions-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OIDC_OPTIONS = {
  audience: "yashflow-maintenance",
  workflowPaths: [
    ".github/workflows/yashflow-maintenance.yml",
  ],
};

async function authorised(request: Request) {
  return verifyGithubActionsOidc(request, OIDC_OPTIONS);
}

export async function GET(request: Request) {
  if (!(await authorised(request))) {
    return NextResponse.json(
      { error: "Maintenance access denied." },
      { status: 401 }
    );
  }

  const db = integrationSupabase();

  const { data, error } = await db
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_mobile, product_name, workflow_status, current_stage, customer_note, admin_note, created_at, completed_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    count: data?.length || 0,
    orders: data || [],
  });
}

export async function POST(request: Request) {
  if (!(await authorised(request))) {
    return NextResponse.json(
      { error: "Maintenance access denied." },
      { status: 401 }
    );
  }

  const body = (await request.json()) as {
    ids?: string[];
    confirm?: boolean;
  };

  const ids = Array.from(
    new Set(
      (body.ids || [])
        .filter((id) => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  if (body.confirm !== true || ids.length === 0) {
    return NextResponse.json(
      { error: "Explicit order IDs and confirm=true are required." },
      { status: 400 }
    );
  }

  if (ids.length > 200) {
    return NextResponse.json(
      { error: "Too many orders in one cleanup request." },
      { status: 400 }
    );
  }

  const db = integrationSupabase();

  const { data: existing, error: existingError } = await db
    .from("orders")
    .select("id, order_number, customer_name, product_name")
    .in("id", ids);

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message },
      { status: 500 }
    );
  }

  const foundIds = (existing || []).map((item) => item.id);

  if (foundIds.length === 0) {
    return NextResponse.json({
      ok: true,
      deleted: 0,
      orders: [],
    });
  }

  // Prefer the existing atomic order-delete RPC over broad table DELETE
  // privileges. The RPC enforces "latest + unstarted" safety and performs its
  // own child cleanup. Process highest order number first so the full test
  // sequence can be removed without ever renumbering production history.
  const sortable = [...(existing || [])].sort((a, b) =>
    String(b.order_number || "").localeCompare(
      String(a.order_number || ""),
      undefined,
      { numeric: true, sensitivity: "base" }
    )
  );

  let rpcDeleted = 0;
  let rpcUnavailable = false;
  let rpcErrorMessage = "";

  for (const order of sortable) {
    const { error: rpcError } = await db.rpc(
      "admin_delete_latest_unstarted_order",
      {
        p_order_id: order.id,
      }
    );

    if (rpcError) {
      rpcUnavailable = true;
      rpcErrorMessage = rpcError.message;
      break;
    }

    rpcDeleted += 1;
  }

  if (!rpcUnavailable) {
    return NextResponse.json({
      ok: true,
      deleted: rpcDeleted,
      orders: existing,
      method: "admin_delete_latest_unstarted_order",
    });
  }

  if (rpcDeleted > 0) {
    return NextResponse.json(
      {
        error:
          "Safe order-delete RPC stopped after partial cleanup: " +
          rpcErrorMessage,
        deleted: rpcDeleted,
        orders: existing,
      },
      { status: 500 }
    );
  }

  const proofResult = await db
    .from("order_stage_proofs")
    .select("id, file_path")
    .in("order_id", foundIds);

  const proofRows = proofResult.error
    ? []
    : proofResult.data || [];

  const { data: workRows, error: workLoadError } = await db
    .from("order_stage_work")
    .select("id")
    .in("order_id", foundIds);

  if (workLoadError) {
    return NextResponse.json(
      {
        error: `order_stage_work: ${workLoadError.message}`,
        matched: existing,
      },
      { status: 500 }
    );
  }

  const workIds = (workRows || []).map((item) => item.id);

  const cleanupWarnings: string[] = [];

  async function deleteRows(
    table: string,
    column: string,
    values: string[],
    optional = false
  ) {
    if (values.length === 0) return;

    const { error } = await db
      .from(table)
      .delete()
      .in(column, values);

    if (!error) return;

    const message = `${table}: ${error.message}`;

    if (
      optional &&
      (
        error.message.toLowerCase().includes("permission denied") ||
        error.message.toLowerCase().includes("could not find the table") ||
        error.message.toLowerCase().includes("schema cache")
      )
    ) {
      cleanupWarnings.push(message);
      return;
    }

    throw new Error(message);
  }

  try {
    // Remove storage objects when the service role can read proof metadata.
    const proofPaths = proofRows
      .map((item) => item.file_path)
      .filter(Boolean);

    if (proofPaths.length > 0) {
      const { error: storageError } = await db.storage
        .from("workflow-proofs")
        .remove(proofPaths);

      if (storageError) {
        cleanupWarnings.push(
          `workflow-proofs: ${storageError.message}`
        );
      }
    }

    // These child deletions are best-effort for permissions/missing optional
    // tables. A real database/FK error still stops the reset with its exact
    // table name so we never silently leave inconsistent test data.
    if (workIds.length > 0) {
      await deleteRows(
        "order_stage_checklist_checks",
        "order_stage_work_id",
        workIds,
        true
      );
      await deleteRows(
        "order_stage_checklist_items",
        "order_stage_work_id",
        workIds,
        true
      );
      await deleteRows(
        "order_stage_workers",
        "order_stage_work_id",
        workIds,
        true
      );
    }

    await deleteRows(
      "order_stage_proofs",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_inventory_consumptions",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_payments",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_billing",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_dispatch_records",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_operation_details",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_product_configurations",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_stage_history",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_workflow_history",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_stage_plans",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "website_order_imports",
      "yashflow_order_id",
      foundIds,
      true
    );
    await deleteRows(
      "order_stage_work",
      "order_id",
      foundIds,
      true
    );
    await deleteRows(
      "notifications",
      "related_id",
      foundIds,
      true
    );

    const { error: auditError } = await db
      .from("audit_activity")
      .delete()
      .eq("entity_type", "order")
      .in(
        "entity_id",
        foundIds.map((id) => String(id))
      );

    if (auditError) {
      cleanupWarnings.push(
        `audit_activity: ${auditError.message}`
      );
    }

    const { error: deleteError } = await db
      .from("orders")
      .delete()
      .in("id", foundIds);

    if (deleteError) {
      throw new Error(`orders: ${deleteError.message}`);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Order cleanup failed.",
        matched: existing,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: foundIds.length,
    orders: existing,
    warnings: cleanupWarnings,
  });
}
