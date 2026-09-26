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

  // Self-heal the live push dispatcher whenever a native Android device
  // registers. The pg_cron job already calls yf_dispatch_push_outbox(); these
  // settings tell that job where to send the queued notifications.
  const processUrl = `${new URL(request.url).origin}/api/push/process`;
  const { error: settingsError } = await auth.db
    .from("push_settings")
    .update({
      process_url: processUrl,
      cron_enabled: true,
      updated_at: now,
    })
    .eq("id", 1);

  if (settingsError) {
    return NextResponse.json(
      {
        error: settingsError.message,
        code: "PUSH_DISPATCHER_CONFIG_FAILED",
      },
      { status: 500 }
    );
  }

  // Kick the dispatcher once immediately so a just-registered device does not
  // have to wait for the next one-minute cron tick. The recurring cron remains
  // the normal delivery mechanism for subsequent notifications.
  const { error: dispatchError } = await auth.db.rpc(
    "yf_dispatch_push_outbox"
  );

  return NextResponse.json({
    ok: true,
    dispatcherConfigured: true,
    dispatchQueued: !dispatchError,
  });
}
