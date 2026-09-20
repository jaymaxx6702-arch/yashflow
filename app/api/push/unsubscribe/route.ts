import { NextResponse } from "next/server";
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
  } | null;

  if (!body?.endpoint) {
    return NextResponse.json(
      { error: "Push endpoint required." },
      { status: 400 }
    );
  }

  const { error } = await auth.db
    .from("push_subscriptions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("endpoint", body.endpoint)
    .eq("employee_id", auth.profile.id);

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
