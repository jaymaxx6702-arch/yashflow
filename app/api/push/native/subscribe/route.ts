import { NextResponse } from "next/server";
import { pushAuth } from "@/utils/push-auth";

export async function POST(request: Request) {
  const auth = await pushAuth(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error, code: "code" in auth ? auth.code : undefined },
      { status: auth.status }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { token?: string; platform?: string }
    | null;

  const token = body?.token?.trim() || "";
  if (!token) {
    return NextResponse.json(
      { error: "FCM token required." },
      { status: 400 }
    );
  }

  if (body?.platform && body.platform !== "android") {
    return NextResponse.json(
      { error: "Unsupported native push platform." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // A refreshed FCM token may move between employees/devices.
  const { error } = await auth.db
    .from("native_push_tokens")
    .upsert(
      {
        employee_id: auth.profile.id,
        token,
        platform: "android",
        is_active: true,
        last_error: null,
        updated_at: now,
      },
      { onConflict: "token" }
    );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
