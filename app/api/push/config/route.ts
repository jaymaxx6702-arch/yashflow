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
    const settings = await ensurePushSettings(auth.db);

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
      },
      { status: 500 }
    );
  }
}
