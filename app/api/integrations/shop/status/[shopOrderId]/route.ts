import { NextResponse } from "next/server";
import {
  integrationAuthorised,
  integrationSupabase,
} from "@/utils/supabase/integration-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ shopOrderId: string }> },
) {
  if (!integrationAuthorised(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { shopOrderId } = await context.params;
  const db = integrationSupabase();
  const { data: imports, error } = await db
    .from("website_order_imports")
    .select("shop_order_item_id,yashflow_order_id")
    .eq("shop_order_id", shopOrderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids=(imports || []).map((x)=>x.yashflow_order_id);
  if (!ids.length) return NextResponse.json({ shopOrderId, orders: [] });
  const { data: orders } = await db
    .from("orders")
    .select("id,order_number,current_stage,workflow_status,completed_at,updated_at")
    .in("id", ids);
  return NextResponse.json({ shopOrderId, orders: orders || [] });
}
