import { NextResponse } from "next/server";
import { ensurePushSettings } from "@/utils/web-push-server";
import { pushAuth } from "@/utils/push-auth";

export async function POST(request: Request) {
  const auth = await pushAuth(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
    userAgent?: string;
  } | null;

  if (!body?.endpoint) {
    return NextResponse.json(
      { error: "Push endpoint required." },
      { status: 400 }
    );
  }

  try {
    await ensurePushSettings(auth.db);

    const now = new Date().toISOString();

    const { error } = await auth.db
      .from("push_subscriptions")
      .upsert(
        {
          employee_id: auth.profile.id,
          endpoint: body.endpoint,
          p256dh: body.keys?.p256dh || null,
          auth_secret: body.keys?.auth || null,
          user_agent: body.userAgent || null,
          is_active: true,
          last_error: null,
          updated_at: now,
        },
        {
          onConflict: "endpoint",
        }
      );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (auth.profile.role === "admin") {
      const origin = new URL(request.url).origin;

      await auth.db
        .from("push_settings")
        .update({
          process_url: `${origin}/api/push/process`,
          cron_enabled: true,
          updated_at: now,
        })
        .eq("id", 1);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Push subscribe failed.",
      },
      { status: 500 }
    );
  }
}
