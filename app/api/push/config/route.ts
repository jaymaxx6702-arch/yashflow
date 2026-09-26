import { NextResponse } from "next/server";
import { ensurePushSettings } from "@/utils/web-push-server";
import { pushAuth } from "@/utils/push-auth";

export async function GET(request: Request) {
  const auth = await pushAuth(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    let settings = await ensurePushSettings(auth.db);
    const processUrl = `${new URL(request.url).origin}/api/push/process`;

    if (
      settings.process_url !== processUrl ||
      settings.cron_enabled !== true
    ) {
      const { data: updated, error: updateError } = await auth.db
        .from("push_settings")
        .update({
          process_url: processUrl,
          cron_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1)
        .select(
          "id, public_key, private_jwk, vapid_subject, process_url, process_token, cron_enabled"
        )
        .single();

      if (updateError || !updated) {
        throw new Error(
          updateError?.message || "Push dispatcher configuration failed."
        );
      }

      settings = updated;
    }

    // Best-effort immediate dispatch. Recurring pg_cron remains the normal path.
    await auth.db.rpc("yf_dispatch_push_outbox").catch(() => null);

    return NextResponse.json({
      ok: true,
      publicKey: settings.public_key,
      cronEnabled: settings.cron_enabled,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Push configuration failed.",
        code: "PUSH_CONFIG_FAILED",
      },
      { status: 500 }
    );
  }
}
