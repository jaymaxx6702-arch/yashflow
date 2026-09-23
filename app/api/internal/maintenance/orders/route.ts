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

  // Remove loose audit/notification references that are not protected by
  // order foreign keys. Push outbox rows cascade from notifications.
  await Promise.all([
    db
      .from("notifications")
      .delete()
      .eq("related_type", "order")
      .in("related_id", foundIds),
    db
      .from("audit_activity")
      .delete()
      .eq("entity_type", "order")
      .in(
        "entity_id",
        foundIds.map((id) => String(id))
      ),
  ]);

  const { error: deleteError } = await db
    .from("orders")
    .delete()
    .in("id", foundIds);

  if (deleteError) {
    return NextResponse.json(
      {
        error: deleteError.message,
        matched: existing,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    deleted: foundIds.length,
    orders: existing,
  });
}
