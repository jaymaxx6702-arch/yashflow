import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { integrationSupabase } from "@/utils/supabase/integration-server";
import {
  ensurePushSettings,
  sendEmptyWebPush,
  WebPushError,
} from "@/utils/web-push-server";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const db = integrationSupabase();

  try {
    const settings = await ensurePushSettings(db);
    const supplied =
      request.headers.get("x-yashflow-push-token") || "";

    let authorised =
      supplied.length > 0 &&
      safeEqual(supplied, settings.process_token);

    if (!authorised) {
      const token = (
        request.headers.get("authorization") || ""
      )
        .replace(/^Bearer\s+/i, "")
        .trim();

      if (token) {
        const { data: userData } =
          await db.auth.getUser(token);

        const user = userData.user;

        if (user) {
          const { data: admin } = await db
            .from("employees")
            .select("role, approval_status, is_active")
            .eq("auth_user_id", user.id)
            .maybeSingle();

          authorised =
            admin?.role === "admin" &&
            admin?.approval_status === "approved" &&
            admin?.is_active === true;
        }
      }
    }

    if (!authorised) {
      return NextResponse.json(
        { error: "Push processor access denied." },
        { status: 403 }
      );
    }

    const { data: outboxRows, error: outboxError } = await db
      .from("push_outbox")
      .select(
        "id, notification_id, employee_id, attempts, created_at"
      )
      .is("sent_at", null)
      .order("created_at", { ascending: true })
      .limit(100);

    if (outboxError) {
      throw new Error(outboxError.message);
    }

    if (!outboxRows?.length) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        pushed: 0,
      });
    }

    const employeeIds = Array.from(
      new Set(outboxRows.map((row) => row.employee_id))
    );

    const notificationIds = outboxRows.map(
      (row) => row.notification_id
    );

    const [notificationsResult, subscriptionsResult] =
      await Promise.all([
        db
          .from("notifications")
          .select(
            "id, employee_id, created_at"
          )
          .in("id", notificationIds),
        db
          .from("push_subscriptions")
          .select("id, employee_id, endpoint")
          .in("employee_id", employeeIds)
          .eq("is_active", true),
      ]);

    if (notificationsResult.error) {
      throw new Error(notificationsResult.error.message);
    }

    if (subscriptionsResult.error) {
      throw new Error(subscriptionsResult.error.message);
    }

    const notifications =
      notificationsResult.data || [];
    const subscriptions =
      subscriptionsResult.data || [];

    const latestNotificationByEmployee = new Map<
      string,
      { id: string; created_at: string }
    >();

    for (const notification of notifications) {
      const current = latestNotificationByEmployee.get(
        notification.employee_id
      );

      if (
        !current ||
        new Date(notification.created_at).getTime() >
          new Date(current.created_at).getTime()
      ) {
        latestNotificationByEmployee.set(
          notification.employee_id,
          {
            id: notification.id,
            created_at: notification.created_at,
          }
        );
      }
    }

    let pushed = 0;
    const now = new Date().toISOString();

    for (const employeeId of employeeIds) {
      const employeeOutbox = outboxRows.filter(
        (row) => row.employee_id === employeeId
      );

      const employeeSubscriptions = subscriptions.filter(
        (row) => row.employee_id === employeeId
      );

      const latest =
        latestNotificationByEmployee.get(employeeId);

      if (!latest || employeeSubscriptions.length === 0) {
        await db
          .from("push_outbox")
          .update({
            sent_at: now,
            last_error: "No active push subscription.",
          })
          .in(
            "id",
            employeeOutbox.map((row) => row.id)
          );

        continue;
      }

      let success = false;
      let transientFailure = false;

      for (const subscription of employeeSubscriptions) {
        await db
          .from("push_subscriptions")
          .update({
            last_notification_id: latest.id,
            updated_at: now,
          })
          .eq("id", subscription.id);

        try {
          await sendEmptyWebPush(
            subscription.endpoint,
            settings
          );

          success = true;
          pushed += 1;

          await db
            .from("push_subscriptions")
            .update({
              last_success_at: now,
              last_error: null,
              updated_at: now,
            })
            .eq("id", subscription.id);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Push failed.";

          if (
            error instanceof WebPushError &&
            (error.status === 404 ||
              error.status === 410)
          ) {
            await db
              .from("push_subscriptions")
              .update({
                is_active: false,
                last_error: message,
                updated_at: now,
              })
              .eq("id", subscription.id);
          } else {
            transientFailure = true;

            await db
              .from("push_subscriptions")
              .update({
                last_error: message,
                updated_at: now,
              })
              .eq("id", subscription.id);
          }
        }
      }

      const ids = employeeOutbox.map((row) => row.id);

      if (success || !transientFailure) {
        await db
          .from("push_outbox")
          .update({
            sent_at: now,
            last_error: success
              ? null
              : "No deliverable push subscription.",
          })
          .in("id", ids);
      } else {
        for (const row of employeeOutbox) {
          const attempts = Number(row.attempts || 0) + 1;

          await db
            .from("push_outbox")
            .update({
              attempts,
              last_error: "Temporary push delivery failure.",
              sent_at: attempts >= 5 ? now : null,
            })
            .eq("id", row.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: outboxRows.length,
      pushed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Push processing failed.",
      },
      { status: 500 }
    );
  }
}
