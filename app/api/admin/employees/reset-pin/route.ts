import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { pushAuth } from "@/utils/push-auth";

const WEAK_PINS = new Set([
  "000000","111111","123456","654321","121212",
  "222222","333333","444444","555555",
  "666666","777777","888888","999999",
]);

function generateTemporaryPin() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const pin = String(randomInt(100000, 1000000));
    if (!WEAK_PINS.has(pin)) return pin;
  }

  return String(randomInt(100000, 1000000));
}

export async function POST(request: Request) {
  const auth = await pushAuth(request);

  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { employeeId?: string }
    | null;

  const employeeId = body?.employeeId?.trim();

  if (!employeeId) {
    return NextResponse.json(
      { error: "Employee ID required." },
      { status: 400 }
    );
  }

  const { data: employee, error: employeeError } = await auth.db
    .from("employees")
    .select("id, full_name, role, auth_user_id, is_active")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    return NextResponse.json(
      { error: employeeError?.message || "Employee not found." },
      { status: 404 }
    );
  }

  if (employee.role === "admin") {
    return NextResponse.json(
      { error: "Admin PIN cannot be reset from employee tools." },
      { status: 400 }
    );
  }

  if (!employee.auth_user_id) {
    return NextResponse.json(
      { error: "Employee login account is not linked yet." },
      { status: 400 }
    );
  }

  const temporaryPin = generateTemporaryPin();

  const { error: resetError } =
    await auth.db.auth.admin.updateUserById(employee.auth_user_id, {
      password: temporaryPin,
    });

  if (resetError) {
    return NextResponse.json(
      { error: resetError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    employeeId: employee.id,
    employeeName: employee.full_name,
    temporaryPin,
  });
}
