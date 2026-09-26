import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

const columns = [
  "id",
  "employee_id",
  "attendance_date",
  "punch_in_time",
  "punch_out_time",
  "reason",
  "status",
  "requested_at",
  "reviewed_at",
  "admin_note",
] as const;

export async function GET() {
  const db = integrationSupabase();
  const checks: Record<string, boolean> = {};
  const errors: Record<string, string> = {};

  for (const column of columns) {
    const { error } = await db
      .from("manual_attendance_requests")
      .select(column)
      .limit(1);

    checks[column] = !error;
    if (error) errors[column] = error.message;
  }

  return NextResponse.json({ ok: true, checks, errors });
}
