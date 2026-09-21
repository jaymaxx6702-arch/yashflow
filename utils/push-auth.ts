import { integrationSupabase } from "@/utils/supabase/integration-server";

export async function pushAuth(request: Request) {
  const token = (request.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    return { error: "Session required.", status: 401 } as const;
  }

  const db = integrationSupabase();

  const { data: userData, error: userError } =
    await db.auth.getUser(token);

  const user = userData.user;

  if (userError || !user) {
    return { error: "Invalid session.", status: 401 } as const;
  }

  const { data: profile, error: profileError } = await db
    .from("employees")
    .select("id, role, approval_status, is_active")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.approval_status !== "approved" ||
    !profile.is_active
  ) {
    return {
      error: "Active employee profile required.",
      status: 403,
    } as const;
  }

  return { db, profile } as const;
}
