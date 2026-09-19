import "server-only";
import { createClient } from "@supabase/supabase-js";

export function integrationSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("YashFlow server Supabase credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function integrationAuthorised(request: Request) {
  const expected = process.env.YASHFLOW_INTEGRATION_SECRET;
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${expected}`;
}
