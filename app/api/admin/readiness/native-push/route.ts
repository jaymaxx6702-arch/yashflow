import { NextResponse } from "next/server";
import { pushAuth } from "@/utils/push-auth";

export async function GET(request: Request) {
  const auth = await pushAuth(request);

  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  if (auth.profile.role !== "admin") {
    return NextResponse.json(
      { error: "Admin access required." },
      { status: 403 }
    );
  }

  const { data, error, count } = await auth.db
    .from("native_push_tokens")
    .select("is_active, last_success_at, last_error, updated_at", {
      count: "exact",
    })
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }

  const rows = data || [];
  const activeRows = rows.filter((row) => row.is_active === true);
  const lastSuccessful = rows
    .filter((row) => Boolean(row.last_success_at))
    .sort(
      (a, b) =>
        new Date(b.last_success_at as string).getTime() -
        new Date(a.last_success_at as string).getTime()
    )[0];

  return NextResponse.json({
    ok: true,
    total: count ?? rows.length,
    active: activeRows.length,
    lastSuccessAt: lastSuccessful?.last_success_at || null,
  });
}
