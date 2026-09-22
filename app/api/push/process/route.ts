import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { integrationSupabase } from "@/utils/supabase/integration-server";
import {
  ensurePushSettings,
  sendEmptyWebPush,
  WebPushError,
} from "@/utils/web-push-server";
import { FcmError, sendNativeFcm } from "@/utils/fcm-server";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function nativeTokenInvalid(error: unknown) {
  return (
    error instanceof FcmError &&
    (
      error.responseText.includes("UNREGISTERED") ||
      error.responseText.includes("registration-token-not-registered")
    )
  );
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
        const { data: userData } = await db.auth.getUser(token);
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

    const [
      notificationsResult,
      subscriptionsResult,
      nativeTokensResult,
    ] = await Promise.all([
      db
        .from("notifications")
        .select(
          "id, employee_id, title, message, related_type, related_id, created_at"
        )
        .in("id", notificationIds),
      db
        .from("push_subscriptions")
        .select("id, employee_id, endpoint")
        .in("employee_id", employeeIds)
        .eq("is_active", true),
      db
        .from("native_push_tokens")
        .select("id, employee_id, token")
        .in("employee_id", employeeIds)
        .eq("is_active", true),
    ]);

    if (notificationsResult.error) {
      throw new Error(notificationsResult.error.message);
    }
    if (subscriptionsResult.error) {
      throw new Error(subscriptionsResult.error.message);
    }
    if (nativeTokensResult.error) {
      throw new Error(nativeTokensResult.error.message);
    }

    const notificationById = new Map(
      (notificationsResult.data || []).map((notification) => [
        notification.id,
        notification,
      ])
    );

    const subscriptionsByEmployee = new Map<
      string,
      typeof subscriptionsResult.data
    >();
    for (const subscription of subscriptionsResult.data || []) {
      const rows = subscriptionsByEmployee.get(subscription.employee_id) || [];
      rows.push(subscription);
      subscriptionsByEmployee.set(subscription.employee_id, rows);
    }

    const nativeTokensByEmployee = new Map<
      string,
      typeof nativeTokensResult.data
    >();
    for (const token of nativeTokensResult.data || []) {
      const rows = nativeTokensByEmployee.get(token.employee_id) || [];
      rows.push(token);
      nativeTokensByEmployee.set(token.employee_id, rows);
    }

    let pushed = 0;
    let deliveredRows = 0;
    let retryRows = 0;

    for (const row of outboxRows) {
      const now = new Date().toISOString();
      const notification = notificationById.get(row.notification_id);

      if (!notification) {
        await db
          .from("push_outbox")
          .update({
            sent_at: now,
            last_error: "Notification record missing.",
          })
          .eq("id", row.id);
        continue;
      }

      const nativeTokens =
        nativeTokensByEmployee.get(row.employee_id) || [];
      const webSubscriptions =
        subscriptionsByEmployee.get(row.employee_id) || [];

      if (nativeTokens.length === 0 && webSubscriptions.length === 0) {
        await db
          .from("push_outbox")
          .update({
            sent_at: now,
            last_error: "No active push subscription.",
          })
          .eq("id", row.id);
        continue;
      }

      let delivered = false;
      let transientFailure = false;
      let nativeHasTerminalOnly = nativeTokens.length > 0;

      // Native Android is the preferred channel. When a native token exists,
      // do not also send Web Push for the same outbox row; this avoids duplicate
      // alerts and lets FCM transient failures retry independently.
      if (nativeTokens.length > 0) {
        for (const nativeToken of nativeTokens) {
          try {
            await sendNativeFcm({
              token: nativeToken.token,
              title: notification.title || "YashFlow",
              body: notification.message || "New notification",
              notificationId: notification.id,
              relatedType: notification.related_type,
              relatedId: notification.related_id,
            });

            delivered = true;
            pushed += 1;

            await db
              .from("native_push_tokens")
              .update({
                last_success_at: now,
                last_error: null,
                updated_at: now,
              })
              .eq("id", nativeToken.id);
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Native push failed.";

            if (nativeTokenInvalid(error)) {
              await db
                .from("native_push_tokens")
                .update({
                  is_active: false,
                  last_error: message,
                  updated_at: now,
                })
                .eq("id", nativeToken.id);
            } else {
              nativeHasTerminalOnly = false;
              transientFailure = true;

              await db
                .from("native_push_tokens")
                .update({
                  last_error: message,
                  updated_at: now,
                })
                .eq("id", nativeToken.id);
            }
          }
        }
      }

      // If at least one native device received the notification, the employee
      // delivery is complete. Web Push is deliberately skipped to prevent a
      // second alert for the same event.
      if (delivered) {
        await db
          .from("push_outbox")
          .update({
            sent_at: now,
            last_error: null,
          })
          .eq("id", row.id);
        deliveredRows += 1;
        continue;
      }

      // Keep a native transient failure pending rather than masking it with a
      // successful Web Push. This fixes closed-app Android notifications being
      // silently lost when browser push happened to succeed first.
      if (nativeTokens.length > 0 && transientFailure) {
        const attempts = Number(row.attempts || 0) + 1;
        await db
          .from("push_outbox")
          .update({
            attempts,
            last_error: "Temporary native push delivery failure.",
            sent_at: attempts >= 5 ? now : null,
          })
          .eq("id", row.id);
        retryRows += attempts >= 5 ? 0 : 1;
        continue;
      }

      // Native tokens were absent or all became terminally invalid. Fall back
      // to Web Push, if available.
      transientFailure = false;

      if (
        webSubscriptions.length > 0 &&
        (nativeTokens.length === 0 || nativeHasTerminalOnly)
      ) {
        for (const subscription of webSubscriptions) {
          await db
            .from("push_subscriptions")
            .update({
              last_notification_id: notification.id,
              updated_at: now,
            })
            .eq("id", subscription.id);

          try {
            await sendEmptyWebPush(
              subscription.endpoint,
              settings
            );

            delivered = true;
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
              (error.status === 404 || error.status === 410)
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
      }

      if (delivered) {
        await db
          .from("push_outbox")
          .update({
            sent_at: now,
            last_error: null,
          })
          .eq("id", row.id);
        deliveredRows += 1;
        continue;
      }

      if (transientFailure) {
        const attempts = Number(row.attempts || 0) + 1;
        await db
          .from("push_outbox")
          .update({
            attempts,
            last_error: "Temporary push delivery failure.",
            sent_at: attempts >= 5 ? now : null,
          })
          .eq("id", row.id);
        retryRows += attempts >= 5 ? 0 : 1;
        continue;
      }

      await db
        .from("push_outbox")
        .update({
          sent_at: now,
          last_error: "No deliverable push subscription.",
        })
        .eq("id", row.id);
    }

    return NextResponse.json({
      ok: true,
      processed: outboxRows.length,
      deliveredRows,
      retryRows,
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
