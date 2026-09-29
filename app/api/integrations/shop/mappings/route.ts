import { NextResponse } from "next/server";
import {
  integrationAuthorised,
  integrationSupabase,
} from "@/utils/supabase/integration-server";

type MappingBody = {
  shopProductId?: unknown;
  yashflowProductId?: unknown;
  isActive?: unknown;
};

function cleanShopProductId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function cleanUuid(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : "";
}

async function workflowReadiness(
  db: ReturnType<typeof integrationSupabase>,
  productIds: string[],
) {
  if (!productIds.length) return new Map<string, number>();

  const { data: templates, error: templateError } = await db
    .from("workflow_templates")
    .select("id,product_id")
    .in("product_id", productIds)
    .eq("is_active", true);
  if (templateError) throw templateError;

  const templateIds = (templates || []).map((row) => row.id as string);
  const stageCountsByTemplate = new Map<string, number>();

  if (templateIds.length) {
    const { data: stages, error: stageError } = await db
      .from("workflow_template_stages")
      .select("template_id")
      .in("template_id", templateIds);
    if (stageError) throw stageError;

    for (const stage of stages || []) {
      const id = stage.template_id as string;
      stageCountsByTemplate.set(id, (stageCountsByTemplate.get(id) || 0) + 1);
    }
  }

  const stageCountsByProduct = new Map<string, number>();
  for (const template of templates || []) {
    const productId = template.product_id as string;
    const count = stageCountsByTemplate.get(template.id as string) || 0;
    stageCountsByProduct.set(
      productId,
      (stageCountsByProduct.get(productId) || 0) + count,
    );
  }
  return stageCountsByProduct;
}

export async function GET(request: Request) {
  if (!integrationAuthorised(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const db = integrationSupabase();
    const [{ data: mappings, error: mappingError }, { data: products, error: productError }] =
      await Promise.all([
        db
          .from("website_product_mappings")
          .select(
            "id,shop_product_id,yashflow_product_id,is_active,created_at,updated_at",
          )
          .order("shop_product_id"),
        db
          .from("products")
          .select("id,name,is_active")
          .order("name"),
      ]);

    if (mappingError) throw mappingError;
    if (productError) throw productError;

    const productIds = (products || []).map((row) => row.id as string);
    const stageCounts = await workflowReadiness(db, productIds);
    const productById = new Map(
      (products || []).map((row) => [row.id as string, row]),
    );

    return NextResponse.json({
      ok: true,
      products: (products || []).map((row) => ({
        id: row.id,
        name: row.name,
        isActive: Boolean(row.is_active),
        workflowStageCount: stageCounts.get(row.id as string) || 0,
        workflowReady:
          Boolean(row.is_active) && (stageCounts.get(row.id as string) || 0) > 0,
      })),
      mappings: (mappings || []).map((row) => {
        const product = productById.get(row.yashflow_product_id as string);
        const stages = stageCounts.get(row.yashflow_product_id as string) || 0;
        return {
          id: row.id,
          shopProductId: row.shop_product_id,
          yashflowProductId: row.yashflow_product_id,
          yashflowProductName: product?.name || "Unknown product",
          isActive: Boolean(row.is_active),
          workflowStageCount: stages,
          workflowReady: Boolean(product?.is_active) && stages > 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load product mappings.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!integrationAuthorised(request))
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as MappingBody | null;
  const shopProductId = cleanShopProductId(body?.shopProductId);
  const yashflowProductId = cleanUuid(body?.yashflowProductId);
  const isActive = body?.isActive === true;

  if (!shopProductId || !yashflowProductId || typeof body?.isActive !== "boolean") {
    return NextResponse.json(
      { error: "Invalid product mapping payload." },
      { status: 400 },
    );
  }

  try {
    const db = integrationSupabase();
    const { data: product, error: productError } = await db
      .from("products")
      .select("id,name,is_active")
      .eq("id", yashflowProductId)
      .maybeSingle();

    if (productError) throw productError;
    if (!product)
      return NextResponse.json(
        { error: "YashFlow product not found." },
        { status: 404 },
      );

    const readiness = await workflowReadiness(db, [yashflowProductId]);
    const workflowStageCount = readiness.get(yashflowProductId) || 0;
    const workflowReady = Boolean(product.is_active) && workflowStageCount > 0;

    if (isActive && !workflowReady) {
      return NextResponse.json(
        {
          error:
            "This YashFlow product cannot be activated for Shop routing until it has an active workflow with at least one stage.",
          code: "WORKFLOW_REQUIRED",
        },
        { status: 409 },
      );
    }

    const { data: mapping, error: mappingError } = await db
      .from("website_product_mappings")
      .upsert(
        {
          shop_product_id: shopProductId,
          yashflow_product_id: yashflowProductId,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_product_id" },
      )
      .select(
        "id,shop_product_id,yashflow_product_id,is_active,created_at,updated_at",
      )
      .single();

    if (mappingError) throw mappingError;

    return NextResponse.json({
      ok: true,
      mapping: {
        id: mapping.id,
        shopProductId: mapping.shop_product_id,
        yashflowProductId: mapping.yashflow_product_id,
        yashflowProductName: product.name,
        isActive: Boolean(mapping.is_active),
        workflowStageCount,
        workflowReady,
        createdAt: mapping.created_at,
        updatedAt: mapping.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update product mapping.",
      },
      { status: 500 },
    );
  }
}
