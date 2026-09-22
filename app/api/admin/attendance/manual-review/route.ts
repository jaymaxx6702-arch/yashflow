import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

function timeStringToMinutes(value: string | null | undefined) {
  if (!value) return 0;
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function isoFromIndiaLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function localMinutesFromIso(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

export async function POST(request: Request) {
  try {
    const token = (request.headers.get("authorization") || "")
      .replace(/^Bearer\s+/i, "")
      .trim();

    if (!token) {
      return NextResponse.json({ error: "Admin session required." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      request_id?: string;
      action?: "approve" | "reject";
      admin_note?: string | null;
    };

    const requestId = String(body.request_id || "").trim();
    const action = body.action;
    const adminNote = body.admin_note ? String(body.admin_note).trim() : null;

    if (!requestId || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "Valid request/action required." }, { status: 400 });
    }

    const db = integrationSupabase();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid admin session." }, { status: 401 });
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

    const { data: punchRequest, error: requestError } = await db
      .from("manual_attendance_requests")
      .select(
        "id, employee_id, attendance_date, punch_in_time, punch_out_time, reason, status"
      )
      .eq("id", requestId)
      .maybeSingle();

    if (requestError || !punchRequest) {
      return NextResponse.json(
        { error: requestError?.message || "Manual Punch Request મળ્યો નથી." },
        { status: 404 }
      );
    }

    if (punchRequest.status !== "pending") {
      return NextResponse.json(
        { error: "આ Manual Punch Request પહેલેથી review થઈ ગઈ છે." },
        { status: 409 }
      );
    }

    const reviewedAt = new Date().toISOString();

    if (action === "reject") {
      const { error: rejectError } = await db
        .from("manual_attendance_requests")
        .update({
          status: "rejected",
          reviewed_at: reviewedAt,
          admin_note: adminNote,
        })
        .eq("id", requestId)
        .eq("status", "pending");

      if (rejectError) {
        return NextResponse.json({ error: rejectError.message }, { status: 500 });
      }

      await db.from("notifications").insert({
        employee_id: punchRequest.employee_id,
        notification_type: "attendance",
        title: "Manual Punch Rejected",
        message: `${punchRequest.attendance_date} Manual Punch Request rejected.`,
        related_type: "manual_attendance_request",
        related_id: requestId,
      });

      return NextResponse.json({ ok: true, status: "rejected" });
    }

    const { data: office, error: officeError } = await db
      .from("office_settings")
      .select(
        "office_start_time, grace_minutes, recess_start_time, recess_end_time, half_day_checkin_time"
      )
      .eq("is_active", true)
      .maybeSingle();

    if (officeError || !office) {
      return NextResponse.json(
        { error: officeError?.message || "Office settings મળ્યા નથી." },
        { status: 500 }
      );
    }

    const { data: existingRows, error: attendanceError } = await db
      .from("attendance")
      .select("id, check_in, check_out")
      .eq("employee_id", punchRequest.employee_id)
      .eq("attendance_date", punchRequest.attendance_date)
      .order("check_in", { ascending: false, nullsFirst: false });

    if (attendanceError) {
      return NextResponse.json({ error: attendanceError.message }, { status: 500 });
    }

    let existing = (existingRows || [])[0] || null;

    if (existingRows?.length) {
      // Prefer the active/open attendance row. Legacy duplicate days can
      // contain both an open row and an older closed row; selecting the
      // closed row first can apply a manual correction to the wrong record.
      existing =
        existingRows.find(
          (row) => Boolean(row.check_in) && !row.check_out
        ) ||
        existingRows.find((row) => Boolean(row.check_in)) ||
        existingRows[0];
    }

    const finalCheckIn = punchRequest.punch_in_time
      ? isoFromIndiaLocal(punchRequest.attendance_date, punchRequest.punch_in_time)
      : existing?.check_in || null;

    const finalCheckOut = punchRequest.punch_out_time
      ? isoFromIndiaLocal(punchRequest.attendance_date, punchRequest.punch_out_time)
      : existing?.check_out || null;

    if (!finalCheckIn) {
      return NextResponse.json(
        { error: "Approve કરવા માટે Check In time જરૂરી છે." },
        { status: 400 }
      );
    }

    const checkInMinutes = punchRequest.punch_in_time
      ? timeStringToMinutes(punchRequest.punch_in_time)
      : localMinutesFromIso(finalCheckIn);

    const officeStartMinutes = timeStringToMinutes(office.office_start_time);
    const graceEndMinutes = officeStartMinutes + Number(office.grace_minutes || 0);
    const halfDayMinutes = timeStringToMinutes(office.half_day_checkin_time);

    let attendanceType = "present";

    if (checkInMinutes >= halfDayMinutes) {
      attendanceType = "half_day";
    } else if (checkInMinutes > graceEndMinutes) {
      attendanceType = "late";
    }

    const lateMinutes =
      checkInMinutes > graceEndMinutes
        ? checkInMinutes - graceEndMinutes
        : 0;

    let workingMinutes = 0;

    if (finalCheckOut) {
      const checkOutMinutes = punchRequest.punch_out_time
        ? timeStringToMinutes(punchRequest.punch_out_time)
        : localMinutesFromIso(finalCheckOut);

      if (checkOutMinutes < checkInMinutes) {
        return NextResponse.json(
          { error: "Check Out Time, Check In કરતાં પહેલાં ન હોઈ શકે." },
          { status: 400 }
        );
      }

      const recessStartMinutes = timeStringToMinutes(office.recess_start_time);
      const recessEndMinutes = timeStringToMinutes(office.recess_end_time);
      const overlapStart = Math.max(checkInMinutes, recessStartMinutes);
      const overlapEnd = Math.min(checkOutMinutes, recessEndMinutes);
      const recessOverlap = Math.max(0, overlapEnd - overlapStart);

      workingMinutes = Math.max(
        0,
        checkOutMinutes - checkInMinutes - recessOverlap
      );
    }

    const attendancePayload = {
      employee_id: punchRequest.employee_id,
      attendance_date: punchRequest.attendance_date,
      check_in: finalCheckIn,
      check_out: finalCheckOut,
      status: attendanceType === "half_day" ? "half_day" : "present",
      attendance_type: attendanceType,
      late_minutes: lateMinutes,
      working_minutes: workingMinutes,
      approval_required: false,
      approval_status: "approved",
      approved_by: admin.id,
      approved_at: reviewedAt,
      admin_note:
        adminNote ||
        `Manual Punch approved: ${punchRequest.reason}`,
    };

    const attendanceSave = existing?.id
      ? await db
          .from("attendance")
          .update(attendancePayload)
          .eq("id", existing.id)
          .select("id")
          .single()
      : await db
          .from("attendance")
          .insert(attendancePayload)
          .select("id")
          .single();

    if (attendanceSave.error || !attendanceSave.data) {
      return NextResponse.json(
        { error: attendanceSave.error?.message || "Attendance update થયું નથી." },
        { status: 500 }
      );
    }

    const { error: requestUpdateError } = await db
      .from("manual_attendance_requests")
      .update({
        status: "approved",
        reviewed_at: reviewedAt,
        admin_note: adminNote,
      })
      .eq("id", requestId)
      .eq("status", "pending");

    if (requestUpdateError) {
      return NextResponse.json({ error: requestUpdateError.message }, { status: 500 });
    }

    await db.from("notifications").insert({
      employee_id: punchRequest.employee_id,
      notification_type: "attendance",
      title: "Manual Punch Approved",
      message: `${punchRequest.attendance_date} Attendance updated successfully.`,
      related_type: "manual_attendance_request",
      related_id: requestId,
    });

    return NextResponse.json({
      ok: true,
      status: "approved",
      attendance_id: attendanceSave.data.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual Punch Review failed." },
      { status: 500 }
    );
  }
}
