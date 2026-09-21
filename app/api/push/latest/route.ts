import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

function targetUrl(
  role: string | null,
  relatedType: string | null
) {
  const admin = role === "admin";

  if (admin) {
    if (relatedType === "order") return "/admin/orders";
    if (relatedType === "task") return "/admin/tasks";
    if (relatedType === "attendance") return "/admin/attendance";
    if (relatedType === "leave") return "/admin/leave";
    return "/admin";
  }

  if (relatedType === "order") return "/dashboard/orders";
  if (relatedType === "task") return "/dashboard/tasks";
  if (relatedType === "leave") return "/dashboard/leave";

  return "/dashboard";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
  } | null;

  if (!body?.endpoint) {
    return NextResponse.json(
      { error: "Endpoint required." },
      { status: 400 }
    );
  }

  const db = integrationSupabase();

  const { data: subscription, error: subError } = await db
    .from("push_subscriptions")
    .select(
      "employee_id, last_notification_id, is_active"
    )
    .eq("endpoint", body.endpoint)
    .maybeSingle();

  if (
    subError ||
    !subscription ||
    !subscription.is_active ||
    !subscription.last_notification_id
  ) {
    return NextResponse.json({
      title: "YashFlow",
      body: "નવું update આવ્યું છે.",
      url: "/dashboard",
      tag: "yashflow-background",
    });
  }

  const [notificationResult, employeeResult] = await Promise.all([
    db
      .from("notifications")
      .select(
        "id, title, message, related_type, related_id"
      )
      .eq("id", subscription.last_notification_id)
      .maybeSingle(),
    db
      .from("employees")
      .select("role")
      .eq("id", subscription.employee_id)
      .maybeSingle(),
  ]);

  const notification = notificationResult.data;

  if (!notification) {
    return NextResponse.json({
      title: "YashFlow",
      body: "નવું update આવ્યું છે.",
      url: "/dashboard",
      tag: "yashflow-background",
    });
  }

  return NextResponse.json({
    title: notification.title || "YashFlow",
    body: notification.message || "New notification",
    url: targetUrl(
      employeeResult.data?.role || null,
      notification.related_type || null
    ),
    tag: `yashflow-${notification.id}`,
  });
}
