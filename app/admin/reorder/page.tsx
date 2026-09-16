"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type InventoryItem = {
  id: string;
  item_code: string;
  item_name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  purchase_price: number | null;
  supplier_name: string | null;
};

type PurchaseOrder = {
  id: string;
  item_id: string;
  purchase_number: string;
  ordered_quantity: number;
  received_quantity: number;
  status: string;
};

type Draft = {
  purchaseNumber: string;
  supplier: string;
  quantity: string;
  unitPrice: string;
  expectedDate: string;
};

function indiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function makePurchaseNumber(itemCode: string) {
  const now = new Date();
  const stamp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(/[^0-9]/g, "");

  return `PO-${itemCode}-${stamp}`;
}

export default function ReorderCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function loadData() {
    const supabase = createClient();

    const [itemsResult, purchaseResult] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, item_code, item_name, unit, current_stock, minimum_stock, purchase_price, supplier_name")
        .eq("is_active", true)
        .order("item_name"),
      supabase
        .from("inventory_purchase_orders")
        .select("id, item_id, purchase_number, ordered_quantity, received_quantity, status")
        .in("status", ["requested", "ordered", "partially_received"])
        .order("created_at", { ascending: false }),
    ]);

    const error = itemsResult.error || purchaseResult.error;
    if (error) {
      setMessage(`Reorder Load Error: ${error.message}`);
      return;
    }

    const itemRows = (itemsResult.data || []) as InventoryItem[];
    const purchaseRows = (purchaseResult.data || []) as PurchaseOrder[];

    setItems(itemRows);
    setPurchases(purchaseRows);

    const openQty = new Map<string, number>();
    for (const row of purchaseRows) {
      const remaining = Math.max(
        Number(row.ordered_quantity || 0) - Number(row.received_quantity || 0),
        0
      );
      openQty.set(row.item_id, (openQty.get(row.item_id) || 0) + remaining);
    }

    const nextDrafts: Record<string, Draft> = {};
    for (const item of itemRows) {
      const shortage = Math.max(
        Number(item.minimum_stock || 0) -
          Number(item.current_stock || 0) -
          (openQty.get(item.id) || 0),
        0
      );

      nextDrafts[item.id] = {
        purchaseNumber: makePurchaseNumber(item.item_code),
        supplier: item.supplier_name || "",
        quantity: String(shortage > 0 ? shortage : 1),
        unitPrice:
          item.purchase_price == null ? "" : String(item.purchase_price),
        expectedDate: "",
      };
    }

    setDrafts(nextDrafts);
  }

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      const isAdmin = profile.role === "admin";
      let viewAllowed = isAdmin;
      let manageAllowed = isAdmin;

      if (!isAdmin) {
        const [inventoryView, purchaseView, purchaseManage] = await Promise.all([
          supabase.rpc("has_app_permission", {
            p_permission_key: "inventory.view",
          }),
          supabase.rpc("has_app_permission", {
            p_permission_key: "purchase.view",
          }),
          supabase.rpc("has_app_permission", {
            p_permission_key: "purchase.manage",
          }),
        ]);

        const error =
          inventoryView.error || purchaseView.error || purchaseManage.error;

        if (error) {
          setMessage(`Permission Error: ${error.message}`);
          setLoading(false);
          return;
        }

        manageAllowed = Boolean(purchaseManage.data);
        viewAllowed =
          Boolean(inventoryView.data) &&
          (Boolean(purchaseView.data) || manageAllowed);
      }

      if (!viewAllowed) {
        router.replace("/dashboard");
        return;
      }

      setCanManage(manageAllowed);
      await loadData();
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  const openQtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of purchases) {
      const remaining = Math.max(
        Number(row.ordered_quantity || 0) - Number(row.received_quantity || 0),
        0
      );
      map.set(row.item_id, (map.get(row.item_id) || 0) + remaining);
    }
    return map;
  }, [purchases]);

  const lowStockItems = useMemo(
    () =>
      items.filter(
        (item) => Number(item.current_stock) <= Number(item.minimum_stock)
      ),
    [items]
  );

  const uncoveredCount = lowStockItems.filter((item) => {
    const openQty = openQtyByItem.get(item.id) || 0;
    return Number(item.current_stock) + openQty < Number(item.minimum_stock);
  }).length;

  function updateDraft(itemId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        ...patch,
      },
    }));
  }

  async function createPurchase(item: InventoryItem) {
    if (!canManage) return;

    const draft = drafts[item.id];
    if (!draft) return;

    const qty = Number(draft.quantity);
    if (!draft.purchaseNumber.trim()) {
      setMessage("Purchase Number જરૂરી છે.");
      return;
    }
    if (!draft.supplier.trim()) {
      setMessage(`${item.item_name}: Supplier Name જરૂરી છે.`);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage(`${item.item_name}: Quantity સાચી નાખો.`);
      return;
    }

    let price: number | null = null;
    if (draft.unitPrice.trim()) {
      price = Number(draft.unitPrice);
      if (!Number.isFinite(price) || price < 0) {
        setMessage(`${item.item_name}: Unit Price સાચી નાખો.`);
        return;
      }
    }

    setSavingId(item.id);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("create_purchase_order", {
      p_purchase_number: draft.purchaseNumber.trim(),
      p_item_id: item.id,
      p_supplier_name: draft.supplier.trim(),
      p_ordered_quantity: qty,
      p_unit_price: price,
      p_order_date: indiaDate(),
      p_expected_date: draft.expectedDate || null,
      p_note: `Low Stock Reorder Center • Current ${item.current_stock} ${item.unit} • Minimum ${item.minimum_stock} ${item.unit}`,
    });

    if (error) {
      setMessage(`Purchase Create Error: ${error.message}`);
      setSavingId(null);
      return;
    }

    setMessage(`${item.item_name} માટે Purchase Order Created ✅`);
    await loadData();
    setSavingId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Reorder Center લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              PURCHASE → INVENTORY
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Low Stock Reorder Center
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Low stock જુઓ, open purchase ગણો અને સીધો Purchase Order બનાવો.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard/purchase")}
              className="yf-btn bg-white/10 text-white border border-white/20"
            >
              🛒 Purchase
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/inventory")}
              className="yf-btn bg-white/10 text-white border border-white/20"
            >
              🏷️ Inventory
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="yf-btn bg-white text-blue-700"
            >
              ← Admin
            </button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="grid grid-cols-3 gap-3 mb-5">
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">LOW STOCK ITEMS</p>
            <p className="text-3xl font-black text-orange-700 mt-1">{lowStockItems.length}</p>
          </div>
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">NEEDS ORDER</p>
            <p className="text-3xl font-black text-red-700 mt-1">{uncoveredCount}</p>
          </div>
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">OPEN PURCHASES</p>
            <p className="text-3xl font-black text-blue-700 mt-1">{purchases.length}</p>
          </div>
        </section>

        <section className="grid gap-4">
          {lowStockItems.map((item) => {
            const openQty = openQtyByItem.get(item.id) || 0;
            const projected = Number(item.current_stock) + openQty;
            const covered = projected >= Number(item.minimum_stock);
            const draft = drafts[item.id];

            return (
              <article key={item.id} className="yf-card p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 xl:w-[310px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-blue-700">{item.item_code}</span>
                      <span
                        className={`yf-badge ${
                          covered
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {covered ? "Covered by Open PO" : "Needs Purchase"}
                      </span>
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mt-2">{item.item_name}</h2>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-[10px] font-bold text-slate-500">CURRENT</p>
                        <p className="font-black">{item.current_stock} {item.unit}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-[10px] font-bold text-slate-500">MINIMUM</p>
                        <p className="font-black">{item.minimum_stock} {item.unit}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-[10px] font-bold text-slate-500">OPEN PO</p>
                        <p className="font-black">{openQty} {item.unit}</p>
                      </div>
                    </div>
                  </div>

                  {draft && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[190px_180px_110px_120px_150px_auto] xl:items-end flex-1">
                      <label className="block">
                        <span className="text-xs font-black text-slate-500">Purchase No.</span>
                        <input
                          value={draft.purchaseNumber}
                          onChange={(event) => updateDraft(item.id, { purchaseNumber: event.target.value })}
                          className="yf-input mt-1"
                          disabled={!canManage}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black text-slate-500">Supplier</span>
                        <input
                          value={draft.supplier}
                          onChange={(event) => updateDraft(item.id, { supplier: event.target.value })}
                          className="yf-input mt-1"
                          disabled={!canManage}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black text-slate-500">Qty</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={draft.quantity}
                          onChange={(event) => updateDraft(item.id, { quantity: event.target.value })}
                          className="yf-input mt-1"
                          disabled={!canManage}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black text-slate-500">Unit Price</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.unitPrice}
                          onChange={(event) => updateDraft(item.id, { unitPrice: event.target.value })}
                          className="yf-input mt-1"
                          disabled={!canManage}
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black text-slate-500">Expected</span>
                        <input
                          type="date"
                          value={draft.expectedDate}
                          onChange={(event) => updateDraft(item.id, { expectedDate: event.target.value })}
                          className="yf-input mt-1"
                          disabled={!canManage}
                        />
                      </label>

                      {canManage && (
                        <button
                          type="button"
                          disabled={savingId === item.id}
                          onClick={() => void createPurchase(item)}
                          className="yf-btn yf-btn-primary disabled:opacity-50"
                        >
                          {savingId === item.id ? "Creating..." : covered ? "Create Extra PO" : "Create PO"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}

          {lowStockItems.length === 0 && (
            <div className="yf-card p-10 text-center">
              <div className="text-4xl">✅</div>
              <p className="font-black text-slate-800 mt-3">No Low Stock Items</p>
              <p className="text-sm text-slate-500 mt-1">બધું inventory minimum stock ઉપર છે.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
