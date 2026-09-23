import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

  return NextResponse.json(
    {
      error:
        "Test-order cleanup is retired. No destructive maintenance action is enabled.",
    },
    { status: 410 }
  );
}
