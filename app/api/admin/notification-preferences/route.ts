import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";
import {
  ADMIN_NOTIFICATION_PREFERENCES,
  type AdminNotificationPreferenceKey,
} from "@/utils/admin-notification-preferences";

async function adminProfile(request: Request) {
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return { error: "Admin session required.", status: 401 as const };
  }

  const db = integrationSupabase();

  const { data: userData, error: userError } =
    await db.auth.getUser(token);

  const user = userData.user;

  if (userError || !user) {
    return { error: "Invalid session.", status: 401 as const };
  }

  const { data: profile, error: profileError } = await db
    .from("employees")
    .select("id, role, approval_status, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== "admin" ||
    profile.approval_status !== "approved" ||
    !profile.is_active
  ) {
    return { error: "Admin access required.", status: 403 as const };
  }

  return { db, profile };
}

async function ensurePreferenceMaster(
  db: ReturnType<typeof integrationSupabase>
) {
  const rows = ADMIN_NOTIFICATION_PREFERENCES.map((item, index) => ({
    permission_key: item.key,
    label: \`\${item.label} Notifications\`,
    description: item.description,
    category: "Admin Notification",
    sort_order: (index + 1) * 10,
    is_active: true,
  }));

  const { error } = await db
    .from("app_permissions")
    .upsert(rows, { onConflict: "permission_key" });

  if (error) throw new Error(error.message);
}

export async function GET(request: Request) {
  const auth = await adminProfile(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { db, profile } = auth;

  try {
    await ensurePreferenceMaster(db);

    const keys = ADMIN_NOTIFICATION_PREFERENCES.map(
      (item) => item.key
    );

    const { data: permissions, error: permissionError } = await db
      .from("app_permissions")
      .select("id, permission_key")
      .in("permission_key", keys)
      .eq("is_active", true);

    if (permissionError) throw new Error(permissionError.message);

    const permissionRows = permissions || [];
    const permissionIds = permissionRows.map((item) => item.id);

    const { data: assignments, error: assignmentError } = await db
      .from("employee_app_permissions")
      .select("permission_id, is_allowed")
      .eq("employee_id", profile.id)
      .in("permission_id", permissionIds);

    if (assignmentError) throw new Error(assignmentError.message);

    const assignmentMap = new Map(
      (assignments || []).map((item) => [
        item.permission_id,
        item.is_allowed === true,
      ])
    );

    const hasAnyPreference = (assignments || []).length > 0;

    const selected = permissionRows
      .filter((item) =>
        hasAnyPreference
          ? assignmentMap.get(item.id) === true
          : true
      )
      .map((item) => item.permission_key as AdminNotificationPreferenceKey);

    if (!hasAnyPreference && permissionRows.length > 0) {
      await db.from("employee_app_permissions").insert(
        permissionRows.map((item) => ({
          employee_id: profile.id,
          permission_id: item.id,
          is_allowed: true,
        }))
      );
    }

    return NextResponse.json({
      ok: true,
      selected,
      options: ADMIN_NOTIFICATION_PREFERENCES,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Notification preferences failed.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await adminProfile(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const { db, profile } = auth;

  try {
    const body = (await request.json()) as {
      selected?: string[];
    };

    const validKeys = new Set(
      ADMIN_NOTIFICATION_PREFERENCES.map((item) => item.key)
    );

    const selected = Array.from(
      new Set(
        (body.selected || []).filter((key) =>
          validKeys.has(key as AdminNotificationPreferenceKey)
        )
      )
    ) as AdminNotificationPreferenceKey[];

    await ensurePreferenceMaster(db);

    const keys = ADMIN_NOTIFICATION_PREFERENCES.map(
      (item) => item.key
    );

    const { data: permissions, error: permissionError } = await db
      .from("app_permissions")
      .select("id, permission_key")
      .in("permission_key", keys)
      .eq("is_active", true);

    if (permissionError) throw new Error(permissionError.message);

    const permissionRows = permissions || [];
    const permissionIds = permissionRows.map((item) => item.id);

    if (permissionIds.length > 0) {
      const { error: deleteError } = await db
        .from("employee_app_permissions")
        .delete()
        .eq("employee_id", profile.id)
        .in("permission_id", permissionIds);

      if (deleteError) throw new Error(deleteError.message);
    }

    if (permissionRows.length > 0) {
      const { error: insertError } = await db
        .from("employee_app_permissions")
        .insert(
          permissionRows.map((item) => ({
            employee_id: profile.id,
            permission_id: item.id,
            is_allowed: selected.includes(
              item.permission_key as AdminNotificationPreferenceKey
            ),
          }))
        );

      if (insertError) throw new Error(insertError.message);
    }

    return NextResponse.json({ ok: true, selected });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Notification preferences save failed.",
      },
      { status: 500 }
    );
  }
}
