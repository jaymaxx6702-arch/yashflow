import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Admin session required." }, { status: 401 });

  const db = integrationSupabase();
  const { data: userData, error: userError } = await db.auth.getUser(token);
  const user = userData.user;
  if (userError || !user) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  const { data: profile } = await db
    .from("employees")
    .select("role, approval_status, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.approval_status !== "approved" || !profile.is_active) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { error } = await db.from("app_permissions").upsert(
    {
      permission_key: "orders.create",
      label: "Order Create Access",
      description: "Allow employee to create new orders without giving full order edit/manage access.",
      category: "Admin Access",
      sort_order: 5,
      is_active: true,
    },
    { onConflict: "permission_key" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
