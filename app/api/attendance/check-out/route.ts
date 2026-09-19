import { NextResponse } from "next/server";
import { integrationSupabase } from "@/utils/supabase/integration-server";

function indiaDate(date: Date, timeZone: string) {
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
    };

    const db = integrationSupabase();
    const { data: userData, error: userError } = await db.auth.getUser(token);
    const user = userData.user;

    if (userError || !user) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }

    const { data: employee, error: employeeError } = await db
      .from("employees")
      .select("id, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (
      employeeError ||
      !employee ||
      employee.approval_status !== "approved" ||
      !employee.is_active
    ) {
      return NextResponse.json({ error: "Active employee profile required." }, { status: 403 });
    }

    const [
      { data: office, error: officeError },
      { data: geofence, error: geofenceError },
    ] = await Promise.all([
      db
        .from("office_settings")
        .select("timezone, recess_start_time, recess_end_time")
        .eq("is_active", true)
        .maybeSingle(),
      db
        .from("attendance_geofence_settings")
        .select("latitude, longitude, radius_m, max_accuracy_m, require_check_out, is_active")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (officeError || !office) {
      return NextResponse.json({ error: officeError?.message || "Office settings મળ્યા નથી." }, { status: 500 });
    }

    if (geofenceError) {
      return NextResponse.json({ error: geofenceError.message }, { status: 500 });
    }

    const timeZone = office.timezone || "Asia/Kolkata";
    const now = new Date();
    const today = indiaDate(now, timeZone);

    const { data: attendanceRows, error: attendanceError } = await db
      .from("attendance")
      .select("id, check_in, check_out, working_minutes")
      .eq("employee_id", employee.id)
      .eq("attendance_date", today)
      .order("check_in", { ascending: false })
      .limit(1);

    if (attendanceError) {
      return NextResponse.json({ error: attendanceError.message }, { status: 500 });
    }

    const attendance = attendanceRows?.[0];

    if (!attendance?.check_in) {
      return NextResponse.json({ error: "આજે Check In મળ્યું નથી." }, { status: 400 });
    }

    const gpsRequired = Boolean(geofence?.is_active && geofence.require_check_out);
    let distanceM: number | null = null;
    let accuracyM: number | null = null;

    if (gpsRequired) {
      const latitude = Number(body.latitude);
      const longitude = Number(body.longitude);
      const accuracy = Number(body.accuracy);
      if (geofence?.latitude === null || geofence?.longitude === null) {
        return NextResponse.json({ error: "Office GPS Location set થયેલું નથી." }, { status: 400 });
      }

      const officeLatitude = Number(geofence.latitude);
      const officeLongitude = Number(geofence.longitude);
      const radiusM = Number(geofence?.radius_m || 200);
      const maxAccuracyM = Number(geofence?.max_accuracy_m || 150);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(accuracy)
      ) {
        return NextResponse.json({ error: "GPS Location જરૂરી છે." }, { status: 400 });
      }

      if (!Number.isFinite(officeLatitude) || !Number.isFinite(officeLongitude)) {
        return NextResponse.json({ error: "Office GPS Location set થયેલું નથી." }, { status: 400 });
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
          { error: `Officeથી ${distanceM}m દૂર છો. Check Out office radiusમાં જ કરી શકાય.` },
          { status: 400 }
        );
      }
    }

    const checkInDate = new Date(attendance.check_in);
    const checkInMinutes = minutesOfDay(checkInDate, timeZone);
    const checkOutMinutes = minutesOfDay(now, timeZone);
    const recessStart = timeStringToMinutes(office.recess_start_time);
    const recessEnd = timeStringToMinutes(office.recess_end_time);

    let grossMinutes = checkOutMinutes - checkInMinutes;
    if (grossMinutes < 0) {
      grossMinutes = Math.max(
        0,
        Math.floor((now.getTime() - checkInDate.getTime()) / 60000)
      );
    }

    const overlapStart = Math.max(checkInMinutes, recessStart);
    const overlapEnd = Math.min(checkOutMinutes, recessEnd);
    const recessOverlap = Math.max(0, overlapEnd - overlapStart);
    const workingMinutes = Math.max(0, grossMinutes - recessOverlap);
    const checkOutIso = now.toISOString();

    const { data: updated, error: updateError } = await db
      .from("attendance")
      .update({
        check_out: checkOutIso,
        working_minutes: workingMinutes,
      })
      .eq("id", attendance.id)
      .select("id, check_out, working_minutes")
      .single();

    if (updateError || !updated?.check_out) {
      return NextResponse.json(
        { error: updateError?.message || "Check Out databaseમાં save થયું નથી." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      check_out: updated.check_out,
      working_minutes: updated.working_minutes || 0,
      distance_m: distanceM,
      accuracy_m: accuracyM,
      gps_required: gpsRequired,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Check Out failed." },
      { status: 500 }
    );
  }
}
