import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

type Alert = {
  key: string;
  relatedType: "order" | "task";
  relatedId: string;
  title: string;
  message: string;
};

function indiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const token = (request.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    const db = integrationSupabase();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
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
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const [
      delayResult,
      workResult,
      ordersResult,
      tasksResult,
      stagesResult,
      adminsResult,
    ] = await Promise.all([
      db
        .from("workflow_delay_settings")
        .select("status, delay_minutes, enabled")
        .eq("enabled", true),
      db
        .from("order_stage_work")
        .select(
          "id, order_id, stage_id, status, status_changed_at, primary_employee_id"
        )
        .in("status", [
          "waiting",
          "assigned",
          "in_progress",
          "ready_for_approval",
          "hold",
          "rework",
        ]),
      db
        .from("orders")
        .select(
          "id, order_number, customer_name, product_name, due_date, current_stage, workflow_status"
        ),
      db
        .from("tasks")
        .select("id, title, assigned_to, due_date, status, priority")
        .in("status", ["pending", "in_progress"]),
      db.from("workflow_stages").select("id, name"),
      db
        .from("employees")
        .select("id")
        .eq("role", "admin")
        .eq("approval_status", "approved")
        .eq("is_active", true),
    ]);

    const firstError =
      delayResult.error ||
      workResult.error ||
      ordersResult.error ||
      tasksResult.error ||
      stagesResult.error ||
      adminsResult.error;

    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const today = indiaDate();
    const nowMs = Date.now();
    const delayMap = new Map(
      (delayResult.data || []).map((row) => [
        String(row.status),
        Number(row.delay_minutes || 0),
      ])
    );
    const orderMap = new Map(
      (ordersResult.data || []).map((row) => [row.id, row])
    );
    const stageMap = new Map(
      (stagesResult.data || []).map((row) => [row.id, row.name])
    );

    const alerts: Alert[] = [];

    for (const work of workResult.data || []) {
      const delayMinutes = delayMap.get(String(work.status)) || 0;
      if (!delayMinutes || !work.status_changed_at) continue;

      const changedAtMs = new Date(work.status_changed_at).getTime();
      if (!Number.isFinite(changedAtMs)) continue;
      if (nowMs - changedAtMs < delayMinutes * 60 * 1000) continue;

      const order = orderMap.get(work.order_id);
      if (!order) continue;

      const elapsedMinutes = Math.floor(
        (nowMs - changedAtMs) / 60000
      );

      alerts.push({
        key: `stage:${work.id}:${today}`,
        relatedType: "order",
        relatedId: order.id,
        title: "Workflow Delay Alert",
        message: `${order.order_number} • ${stageMap.get(work.stage_id) || "Stage"} • ${work.status} ${elapsedMinutes} minથી અટકેલું છે.`,
      });
    }

    for (const order of ordersResult.data || []) {
      const completed =
        order.current_stage === "completed" ||
        order.workflow_status === "completed" ||
        order.current_stage === "cancelled" ||
        order.workflow_status === "cancelled";

      if (completed || !order.due_date || String(order.due_date) >= today) {
        continue;
      }

      alerts.push({
        key: `order-due:${order.id}:${today}`,
        relatedType: "order",
        relatedId: order.id,
        title: "Overdue Order",
        message: `${order.order_number} • ${order.customer_name} • Due ${order.due_date}`,
      });
    }

    for (const task of tasksResult.data || []) {
      if (!task.due_date || String(task.due_date) >= today) continue;

      alerts.push({
        key: `task-due:${task.id}:${today}`,
        relatedType: "task",
        relatedId: task.id,
        title: "Overdue Task",
        message: `${task.title} • Due ${task.due_date} • ${task.priority || "normal"} priority`,
      });
    }

    const admins = adminsResult.data || [];
    let created = 0;

    for (const alert of alerts) {
      const { error: receiptError } = await db
        .from("stuck_alert_receipts")
        .insert({
          alert_key: alert.key,
          related_type: alert.relatedType,
          related_id: alert.relatedId,
          alert_date: today,
        });

      if (receiptError) {
        if (receiptError.code === "23505") {
          continue;
        }

        return NextResponse.json(
          { error: receiptError.message },
          { status: 500 }
        );
      }

      if (admins.length) {
        const { error: notificationError } = await db
          .from("notifications")
          .insert(
            admins.map((item) => ({
              employee_id: item.id,
              notification_type: "escalation",
              title: alert.title,
              message: alert.message,
              related_type: alert.relatedType,
              related_id: alert.relatedId,
            }))
          );

        if (notificationError) {
          return NextResponse.json(
            { error: notificationError.message },
            { status: 500 }
          );
        }
      }

      created += 1;
    }

    return NextResponse.json({
      ok: true,
      scanned: alerts.length,
      created,
      date: today,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Stuck-work scan failed.",
      },
      { status: 500 }
    );
  }
}
