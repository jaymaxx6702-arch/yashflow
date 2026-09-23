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

  // Use a short-lived Admin auth session to call the existing atomic
  // admin_delete_latest_unstarted_order RPC. This keeps the database's own
  // "latest + unstarted + admin" safeguards and avoids granting broad DELETE
  // privileges to service_role.
  const { data: adminProfile, error: adminProfileError } = await db
    .from("employees")
    .select("id, auth_user_id, mobile")
    .eq("role", "admin")
    .eq("approval_status", "approved")
    .eq("is_active", true)
    .not("auth_user_id", "is", null)
    .not("mobile", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (adminProfileError || !adminProfile?.mobile) {
    return NextResponse.json(
      {
        error:
          "Maintenance Admin profile unavailable: " +
          (adminProfileError?.message || "No active approved Admin."),
        orders: existing,
      },
      { status: 500 }
    );
  }

  const adminEmail = `91${String(adminProfile.mobile).trim()}@yashflow.app`;

  const { data: linkData, error: linkError } =
    await db.auth.admin.generateLink({
      type: "magiclink",
      email: adminEmail,
    });

  const tokenHash = linkData?.properties?.hashed_token;

  if (linkError || !tokenHash) {
    return NextResponse.json(
      {
        error:
          "Maintenance Admin session link failed: " +
          (linkError?.message || "No token hash returned."),
        orders: existing,
      },
      { status: 500 }
    );
  }

  const { data: verifyData, error: verifyError } =
    await db.auth.verifyOtp({
      token_hash: tokenHash,
      type: "magiclink",
    });

  const adminAccessToken = verifyData.session?.access_token;

  if (verifyError || !adminAccessToken) {
    return NextResponse.json(
      {
        error:
          "Maintenance Admin session verify failed: " +
          (verifyError?.message || "No access token returned."),
        orders: existing,
      },
      { status: 500 }
    );
  }

  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  ).trim();

  const publishableKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""
  ).trim();

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      {
        error:
          "Maintenance Admin client is not configured.",
        orders: existing,
      },
      { status: 500 }
    );
  }

  const adminDb = createClient(
    supabaseUrl,
    publishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
        },
      },
    }
  );

  const sortable = [...(existing || [])].sort((a, b) =>
    String(b.order_number || "").localeCompare(
      String(a.order_number || ""),
      undefined,
      { numeric: true, sensitivity: "base" }
    )
  );

  let rpcDeleted = 0;

  for (const order of sortable) {
    const { error: rpcError } = await adminDb.rpc(
      "admin_delete_latest_unstarted_order",
      {
        p_order_id: order.id,
      }
    );

    if (rpcError) {
      return NextResponse.json(
        {
          error:
            "Safe order-delete RPC stopped: " +
            rpcError.message,
          deleted: rpcDeleted,
          failed_order: order.order_number,
          orders: existing,
        },
        { status: 500 }
      );
    }

    rpcDeleted += 1;
  }

  return NextResponse.json({
    ok: true,
    deleted: rpcDeleted,
    orders: existing,
    method: "admin_delete_latest_unstarted_order",
  });


}
