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

function minutesOfDay(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function timeStringToMinutes(value: string | null | undefined) {
  if (!value) return 0;
  const [hour, minute] = value.split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      client_action_at?: string;
      offline_action_id?: string;
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

    const offlineActionId = String(body.offline_action_id || "").trim();

    if (offlineActionId) {
      const { data: receipt, error: receiptError } = await db
        .from("offline_action_receipts")
        .select("response")
        .eq("action_id", offlineActionId)
        .maybeSingle();

      if (receiptError) {
        return NextResponse.json({ error: receiptError.message }, { status: 500 });
      }

      if (receipt?.response) {
        return NextResponse.json(receipt.response);
      }
    }

    const [
      { data: office, error: officeError },
      { data: geofence, error: geofenceError },
    ] = await Promise.all([
      db
        .from("office_settings")
        .select("timezone, office_start_time, grace_minutes, half_day_checkin_time")
        .eq("is_active", true)
        .maybeSingle(),
      db
        .from("attendance_geofence_settings")
        .select("latitude, longitude, radius_m, max_accuracy_m, require_check_in, is_active")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (officeError || !office) {
      return NextResponse.json(
        { error: officeError?.message || "Office settings મળ્યા નથી." },
        { status: 500 }
      );
    }

    if (geofenceError) {
      return NextResponse.json({ error: geofenceError.message }, { status: 500 });
    }

    const gpsRequired = Boolean(geofence?.is_active && geofence.require_check_in);
    let distanceM: number | null = null;
    let accuracyM: number | null = null;

    if (gpsRequired) {
      if (!geofence) {
        return NextResponse.json(
          { error: "GPS Settings મળ્યાં નથી." },
          { status: 400 }
        );
      }

      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const accuracy = Number(body.accuracy);

      if (geofence.latitude === null || geofence?.longitude === null) {
        return NextResponse.json(
          { error: "Office GPS Location set થયેલું નથી." },
          { status: 400 }
        );
      }

      const officeLatitude = Number(geofence.latitude);
      const officeLongitude = Number(geofence.longitude);
      const radiusM = Number(geofence.radius_m || 200);

      if (
        !Number.isFinite(officeLatitude) ||
        !Number.isFinite(officeLongitude) ||
        (Math.abs(officeLatitude) < 0.000001 &&
          Math.abs(officeLongitude) < 0.000001)
      ) {
        return NextResponse.json(
          {
            error:
              "Office GPS Location set નથી. Admin → GPS Attendance → Use Current Location as Office → Save કરો.",
          },
          { status: 400 }
        );
      }
      const maxAccuracyM = Number(geofence.max_accuracy_m || 150);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(accuracy)
      ) {
        return NextResponse.json(
          {
            error: "GPS Location જરૂરી છે.",
            code: "GPS_REQUIRED",
            gps_required: true,
          },
          { status: 428 }
        );
      }

      accuracyM = Math.round(accuracy);

      if (accuracy > maxAccuracyM) {
        return NextResponse.json(
          {
            error: `GPS Accuracy ±${Math.round(accuracy)}m છે. Precise Location ON કરીને ફરી Try કરો.`,
          },
          { status: 400 }
        );
      }

      distanceM = Math.round(
        distanceMeters(officeLatitude, officeLongitude, latitude, longitude)
      );

      if (distanceM > radiusM) {
        return NextResponse.json(
          {
            error: `Officeથી ${distanceM}m દૂર છો. Check In office radiusમાં જ કરી શકાય.`,
          },
          { status: 400 }
        );
      }
    }

    const timeZone = office.timezone || "Asia/Kolkata";
    const serverNow = new Date();
    let now = serverNow;
    let offlineSync = false;

    if (offlineActionId && body.client_action_at) {
      const capturedAt = new Date(body.client_action_at);
      const ageMs = serverNow.getTime() - capturedAt.getTime();

      if (!Number.isFinite(capturedAt.getTime())) {
        return NextResponse.json(
          { error: "Offline Punch timestamp valid નથી." },
          { status: 400 }
        );
      }

      if (ageMs < -5 * 60 * 1000 || ageMs > 12 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: "Offline Punch 12 કલાકની અંદર sync કરવો જરૂરી છે." },
          { status: 400 }
        );
      }

      now = capturedAt;
      offlineSync = true;
    }

    const today = dateInTimeZone(now, timeZone);
    const checkInMinutes = minutesOfDay(now, timeZone);
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

    const approvalRequired =
      offlineSync ||
      attendanceType === "late" ||
      attendanceType === "half_day";

    const { data: existingRows, error: existingError } = await db
      .from("attendance")
      .select("id, check_in, check_out")
      .eq("employee_id", employee.id)
      .eq("attendance_date", today)
      .order("check_in", { ascending: false, nullsFirst: false });

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const alreadyCheckedIn = (existingRows || []).find((row) => Boolean(row.check_in));

    if (alreadyCheckedIn?.check_in) {
      return NextResponse.json(
        {
          error: "આજે Check In પહેલેથી થઈ ગયું છે.",
          attendance_id: alreadyCheckedIn.id,
          check_in: alreadyCheckedIn.check_in,
        },
        { status: 409 }
      );
    }

    const existing = (existingRows || [])[0];

    const payload = {
      employee_id: employee.id,
      attendance_date: today,
      check_in: now.toISOString(),
      check_out: null,
      status: attendanceType === "half_day" ? "half_day" : "present",
      attendance_type: attendanceType,
      late_minutes: lateMinutes,
      working_minutes: 0,
      approval_required: approvalRequired,
      approval_status: approvalRequired ? "pending" : "approved",
      approved_at: approvalRequired ? null : now.toISOString(),
      ...(offlineSync
        ? {
            admin_note: `Offline Punch In synced • Captured ${now.toISOString()}`,
          }
        : {}),
    };

    const saveResult = existing?.id
      ? await db
          .from("attendance")
          .update(payload)
          .eq("id", existing.id)
          .select("id, check_in, attendance_type, late_minutes, approval_required")
          .single()
      : await db
          .from("attendance")
          .insert(payload)
          .select("id, check_in, attendance_type, late_minutes, approval_required")
          .single();

    if (saveResult.error || !saveResult.data?.check_in) {
      return NextResponse.json(
        { error: saveResult.error?.message || "Check In databaseમાં save થયું નથી." },
        { status: 500 }
      );
    }

    if (approvalRequired) {
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
            title: offlineSync ? "Offline Punch Review" : "Attendance Approval",
            message: offlineSync
              ? `${employee.full_name} Offline Punch In sync થયું • Admin review required.`
              : attendanceType === "half_day"
              ? `${employee.full_name} Half Day Check In — approval required.`
              : `${employee.full_name} ${lateMinutes} min Late — approval required.`,
            related_type: "attendance",
            related_id: saveResult.data.id,
          }))
        );
      }
    }

    const responsePayload = {
      ok: true,
      attendance_id: saveResult.data.id,
      check_in: saveResult.data.check_in,
      attendance_type: saveResult.data.attendance_type,
      late_minutes: saveResult.data.late_minutes || 0,
      approval_required: Boolean(saveResult.data.approval_required),
      distance_m: distanceM,
      accuracy_m: accuracyM,
      gps_required: gpsRequired,
      offline_sync: offlineSync,
    };

    if (offlineActionId) {
      await db.from("offline_action_receipts").upsert({
        action_id: offlineActionId,
        employee_id: employee.id,
        action_type: "attendance_check_in",
        response: responsePayload,
      });
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Check In failed." },
      { status: 500 }
    );
  }
}
