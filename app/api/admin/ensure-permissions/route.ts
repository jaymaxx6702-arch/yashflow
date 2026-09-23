import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

const CORE_PERMISSIONS = [
  {
    permission_key: "orders.create",
    label: "Order Create Access",
    description:
      "Allow employee to create new orders without giving full order edit/manage access.",
    category: "Admin Access",
    sort_order: 5,
    is_active: true,
  },
  {
    permission_key: "notify.admin.orders",
    label: "Order Notifications",
    description: "Admin receives order, stage and assignment notifications.",
    category: "Admin Notification",
    sort_order: 10,
    is_active: true,
  },
  {
    permission_key: "notify.admin.tasks",
    label: "Task Notifications",
    description: "Admin receives task and task-assignment notifications.",
    category: "Admin Notification",
    sort_order: 20,
    is_active: true,
  },
  {
    permission_key: "notify.admin.attendance",
    label: "Attendance Notifications",
    description: "Admin receives attendance and manual punch notifications.",
    category: "Admin Notification",
    sort_order: 30,
    is_active: true,
  },
  {
    permission_key: "notify.admin.leave",
    label: "Leave Notifications",
    description: "Admin receives leave request and leave status notifications.",
    category: "Admin Notification",
    sort_order: 40,
    is_active: true,
  },
  {
    permission_key: "notify.admin.escalations",
    label: "Escalation Notifications",
    description: "Admin receives stuck-work and escalation notifications.",
    category: "Admin Notification",
    sort_order: 50,
    is_active: true,
  },
  {
    permission_key: "notify.admin.inventory",
    label: "Inventory Notifications",
    description: "Admin receives inventory and low-stock notifications.",
    category: "Admin Notification",
    sort_order: 60,
    is_active: true,
  },
  {
    permission_key: "notify.admin.accounts",
    label: "Accounts Notifications",
    description: "Admin receives payment, billing and dispatch-related notifications.",
    category: "Admin Notification",
    sort_order: 70,
    is_active: true,
  },
  {
    permission_key: "notify.admin.system",
    label: "System Notifications",
    description: "Admin receives other YashFlow system notifications.",
    category: "Admin Notification",
    sort_order: 80,
    is_active: true,
  },
] as const;

export async function POST(request: Request) {
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return NextResponse.json(
      { error: "Admin session required." },
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

  const { data: profile } = await db
    .from("employees")
    .select("id, role, approval_status, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (
    !profile ||
    profile.role !== "admin" ||
    profile.approval_status !== "approved" ||
    !profile.is_active
  ) {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  const { error } = await db
    .from("app_permissions")
    .upsert(CORE_PERMISSIONS, {
      onConflict: "permission_key",
    });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
