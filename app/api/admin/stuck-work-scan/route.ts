import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

export async function POST(request: Request) {
  try {
    const token = (request.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return NextResponse.json(
        { error: "Session required." },
        { status: 401 }
      );
    }

    const db = integrationSupabase();

    const { data: userData, error: userError } =
      await db.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid session." },
        { status: 401 }
      );
    }

    const { data: admin, error: adminError } = await db
      .from("employees")
      .select("id, role, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (
      adminError ||
      !admin ||
      admin.role !== "admin" ||
      admin.approval_status !== "approved" ||
      !admin.is_active
    ) {
      return NextResponse.json(
        { error: "Admin access required." },
        { status: 403 }
      );
    }

    const { data, error } = await db.rpc(
      "yf_scan_stuck_work_alerts"
    );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data || { ok: true, created: 0 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stuck-work scan failed.",
      },
      { status: 500 }
    );
  }
}
