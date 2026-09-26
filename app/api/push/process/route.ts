import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { integrationSupabase } from "@/utils/supabase/integration-server";
import {
  ensurePushSettings,
  sendEmptyWebPush,
  WebPushError,
} from "@/utils/web-push-server";
import { FcmError, sendNativeFcm } from "@/utils/fcm-server";
import { notificationPreferenceKey } from "@/utils/admin-notification-preferences";

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
      console.info("[push-process] summary", {
        processed: 0,
        pushed: 0,
        deliveredRows: 0,
        retryRows: 0,
      });

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
      employeesResult,
    ] = await Promise.all([
      db
        .from("notifications")
        .select(
          "id, employee_id, notification_type, title, message, related_type, related_id, created_at"
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
      db
        .from("employees")
        .select("id, role")
        .in("id", employeeIds),
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
    if (employeesResult.error) {
      throw new Error(employeesResult.error.message);
    }

    const adminEmployeeIds = new Set(
      (employeesResult.data || [])
        .filter((employee) => employee.role === "admin")
        .map((employee) => employee.id)
    );

    const { data: preferencePermissions, error: preferencePermissionError } =
      await db
        .from("app_permissions")
        .select("id, permission_key")
        .eq("category", "Admin Notification")
        .eq("is_active", true);

    if (preferencePermissionError) {
      throw new Error(preferencePermissionError.message);
    }

    const preferenceIds = (preferencePermissions || []).map(
      (permission) => permission.id
    );

    const { data: preferenceAssignments, error: preferenceAssignmentError } =
      preferenceIds.length > 0 && adminEmployeeIds.size > 0
        ? await db
            .from("employee_app_permissions")
            .select("employee_id, permission_id, is_allowed")
            .in("employee_id", Array.from(adminEmployeeIds))
            .in("permission_id", preferenceIds)
        : { data: [], error: null };

    if (preferenceAssignmentError) {
      throw new Error(preferenceAssignmentError.message);
    }

    const preferenceKeyById = new Map(
      (preferencePermissions || []).map((permission) => [
        permission.id,
        permission.permission_key,
      ])
    );

    const adminPreferenceRows = new Map<
      string,
      { configured: boolean; enabled: Set<string> }
    >();

    for (const adminId of adminEmployeeIds) {
      adminPreferenceRows.set(adminId, {
        configured: false,
        enabled: new Set<string>(),
      });
    }

    for (const assignment of preferenceAssignments || []) {
      const state = adminPreferenceRows.get(assignment.employee_id);
      const key = preferenceKeyById.get(assignment.permission_id);

      if (!state || !key) continue;

      state.configured = true;
      if (assignment.is_allowed === true) {
        state.enabled.add(key);
      }
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

      if (adminEmployeeIds.has(row.employee_id)) {
        const preference = adminPreferenceRows.get(row.employee_id);
        const preferenceKey = notificationPreferenceKey(
          notification.notification_type,
          notification.related_type
        );

        if (
          preference?.configured &&
          !preference.enabled.has(preferenceKey)
        ) {
          await Promise.all([
            db
              .from("push_outbox")
              .update({
                sent_at: now,
                last_error: "Admin notification preference disabled.",
              })
              .eq("id", row.id),
            db
              .from("notifications")
              .update({
                is_read: true,
                read_at: now,
              })
              .eq("id", notification.id)
              .eq("employee_id", row.employee_id),
          ]);
          continue;
        }
      }

      const nativeTokens =
        nativeTokensByEmployee.get(row.employee_id) || [];
      const webSubscriptions =
        subscriptionsByEmployee.get(row.employee_id) || [];

      if (nativeTokens.length === 0 && webSubscriptions.length === 0) {
        console.warn("[push-process] no-subscription", {
          employeeId: row.employee_id,
          notificationId: row.notification_id,
        });

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

            console.info("[push-process] native-success", {
              employeeId: row.employee_id,
              notificationId: row.notification_id,
            });

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

            console.warn("[push-process] native-error", {
              employeeId: row.employee_id,
              notificationId: row.notification_id,
              message: message.slice(0, 500),
            });

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

    console.info("[push-process] summary", {
      processed: outboxRows.length,
      deliveredRows,
      retryRows,
      pushed,
      nativeTokenCount: nativeTokensResult.data?.length || 0,
      webSubscriptionCount: subscriptionsResult.data?.length || 0,
    });

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
