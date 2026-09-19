import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return `${year}-${month}-${day}`;
}

function subtractDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function validTime(value: string | null) {
  if (!value) return true;
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function POST(request: Request) {
  try {
    const token = (request.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return NextResponse.json({ error: "Session required." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      attendance_date?: string;
      punch_in_time?: string | null;
      punch_out_time?: string | null;
      reason?: string;
    };

    const db = integrationSupabase();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const { data: employee, error: employeeError } = await db
      .from("employees")
      .select("id, full_name, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (
      employeeError ||
      !employee ||
      employee.approval_status !== "approved" ||
      !employee.is_active
    ) {
      return NextResponse.json(
        { error: "Active employee profile required." },
        { status: 403 }
      );
    }

    const attendanceDate = String(body.attendance_date || "").trim();
    const punchIn = body.punch_in_time ? String(body.punch_in_time).trim() : null;
    const punchOut = body.punch_out_time ? String(body.punch_out_time).trim() : null;
    const reason = String(body.reason || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
      return NextResponse.json({ error: "Valid Attendance Date જરૂરી છે." }, { status: 400 });
    }

    if (!punchIn && !punchOut) {
      return NextResponse.json(
        { error: "Punch In અથવા Punch Outમાંથી ઓછામાં ઓછો એક સમય જરૂરી છે." },
        { status: 400 }
      );
    }

    if (!validTime(punchIn) || !validTime(punchOut)) {
      return NextResponse.json({ error: "Punch time valid નથી." }, { status: 400 });
    }

    if (punchIn && punchOut && punchOut <= punchIn) {
      return NextResponse.json(
        { error: "Punch Out time Punch In પછીનો હોવો જોઈએ." },
        { status: 400 }
      );
    }

    if (reason.length < 3) {
      return NextResponse.json({ error: "Reason જરૂરી છે." }, { status: 400 });
    }

    const today = dateInTimeZone(new Date(), "Asia/Kolkata");
    const minDate = subtractDays(today, 7);

    if (attendanceDate < minDate || attendanceDate > today) {
      return NextResponse.json(
        { error: "Manual Punch ફક્ત આજે અથવા છેલ્લા 7 દિવસ માટે કરી શકાય." },
        { status: 400 }
      );
    }

    const { data: existingPending, error: pendingError } = await db
      .from("manual_attendance_requests")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("attendance_date", attendanceDate)
      .eq("status", "pending")
      .limit(1);

    if (pendingError) {
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }

    if (existingPending?.length) {
      return NextResponse.json(
        { error: "આ તારીખ માટે Manual Punch Request પહેલેથી Pending છે." },
        { status: 409 }
      );
    }

    const { data: saved, error: saveError } = await db
      .from("manual_attendance_requests")
      .insert({
        employee_id: employee.id,
        attendance_date: attendanceDate,
        punch_in_time: punchIn,
        punch_out_time: punchOut,
        reason,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (saveError || !saved) {
      return NextResponse.json(
        { error: saveError?.message || "Manual Punch Request save થયું નથી." },
        { status: 500 }
      );
    }

    const { data: admins } = await db
      .from("employees")
      .select("id")
      .eq("role", "admin")
      .eq("approval_status", "approved")
      .eq("is_active", true);

    if (admins?.length) {
      await db.from("notifications").insert(
        admins.map((admin) => ({
          employee_id: admin.id,
          notification_type: "attendance",
          title: "Manual Punch Request",
          message: `${employee.full_name} • ${attendanceDate} • approval required.`,
          related_type: "manual_attendance_request",
          related_id: saved.id,
        }))
      );
    }

    return NextResponse.json({ ok: true, request_id: saved.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual Punch Request failed." },
      { status: 500 }
    );
  }
}
