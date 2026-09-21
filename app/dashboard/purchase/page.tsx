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
  supplier_name: string | null;
  is_active: boolean;
};

type PurchaseStatus =
  | "requested"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

type PurchaseOrder = {
  id: string;
  purchase_number: string;
  item_id: string;
  supplier_name: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_price: number | null;
  order_date: string;
  expected_date: string | null;
  status: PurchaseStatus;
  note: string | null;
  created_at: string;
};

export default function PurchaseManagementPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const [purchaseNumber, setPurchaseNumber] = useState("");
  const [itemId, setItemId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [orderedQty, setOrderedQty] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [orderDate, setOrderDate] = useState(
    new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    })
  );
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  async function loadData() {
    const supabase = createClient();

    const [itemResult, purchaseResult] =
      await Promise.all([
        supabase
          .from("inventory_items")
          .select(`
            id,
            item_code,
            item_name,
            unit,
            current_stock,
            minimum_stock,
            supplier_name,
            is_active
          `)
          .eq("is_active", true)
          .order("item_name"),

        supabase
          .from("inventory_purchase_orders")
          .select(`
            id,
            purchase_number,
            item_id,
            supplier_name,
            ordered_quantity,
            received_quantity,
            unit_price,
            order_date,
            expected_date,
            status,
            note,
            created_at
          `)
          .order("created_at", { ascending: false }),
      ]);

    const firstError =
      itemResult.error || purchaseResult.error;

    if (firstError) {
      setMessage(
        `Purchase Load Error: ${firstError.message}`
      );
      return;
    }

    setItems(
      (itemResult.data || []) as InventoryItem[]
    );

    setPurchases(
      (purchaseResult.data || []) as PurchaseOrder[]
    );
  }

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/");
        return;
      }

      if (profile.role === "admin") {
        setIsAdmin(true);
        setCanManage(true);
        await loadData();
        setLoading(false);
        return;
      }

      const [viewResult, manageResult] =
        await Promise.all([
          supabase.rpc("has_app_permission", {
            p_permission_key: "purchase.view",
          }),
          supabase.rpc("has_app_permission", {
            p_permission_key: "purchase.manage",
          }),
        ]);

      const firstError =
        viewResult.error || manageResult.error;

      if (firstError) {
        setMessage(
          `Permission Error: ${firstError.message}`
        );
        setLoading(false);
        return;
      }

      const manageAllowed =
        Boolean(manageResult.data);

      const viewAllowed =
        Boolean(viewResult.data) || manageAllowed;

      if (!viewAllowed) {
        router.replace("/dashboard");
        return;
      }

      setCanManage(manageAllowed);

      await loadData();
      setLoading(false);
    }

    loadPage();
  }, [router]);

  useEffect(() => {
    if (!itemId) return;

    const item = itemMap.get(itemId);

    if (item?.supplier_name && !supplierName) {
      setSupplierName(item.supplier_name);
    }
  }, [itemId, itemMap, supplierName]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();

    return purchases.filter((purchase) => {
      const item = itemMap.get(purchase.item_id);

      const searchMatch =
        !q ||
        purchase.purchase_number
          .toLowerCase()
          .includes(q) ||
        purchase.supplier_name
          .toLowerCase()
          .includes(q) ||
        (item?.item_name || "")
          .toLowerCase()
          .includes(q) ||
        (item?.item_code || "")
          .toLowerCase()
          .includes(q);

      const statusMatch =
        statusFilter === "all" ||
        purchase.status === statusFilter;

      return searchMatch && statusMatch;
    });
  }, [
    purchases,
    itemMap,
    search,
    statusFilter,
  ]);

  const openCount = purchases.filter(
    (row) =>
      row.status === "requested" ||
      row.status === "ordered" ||
      row.status === "partially_received"
  ).length;

  const partialCount = purchases.filter(
    (row) =>
      row.status === "partially_received"
  ).length;

  const receivedCount = purchases.filter(
    (row) => row.status === "received"
  ).length;

  const totalOpenValue = purchases.reduce(
    (total, row) => {
      if (
        row.status === "cancelled" ||
        row.status === "received" ||
        row.unit_price === null
      ) {
        return total;
      }

      const remaining =
        Number(row.ordered_quantity) -
        Number(row.received_quantity);

      return (
        total +
        remaining * Number(row.unit_price)
      );
    },
    0
  );

  function statusClass(status: PurchaseStatus) {
    if (status === "received") {
      return "bg-green-100 text-green-700";
    }

    if (status === "partially_received") {
      return "bg-amber-100 text-amber-800";
    }

    if (status === "cancelled") {
      return "bg-red-100 text-red-700";
    }

    return "bg-blue-100 text-blue-700";
  }

  function statusLabel(status: PurchaseStatus) {
    return status
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) =>
        c.toUpperCase()
      );
  }

  async function createPurchase() {
    if (!canManage) return;

    if (!purchaseNumber.trim()) {
      setMessage("Purchase Number જરૂરી છે.");
      return;
    }

    if (!itemId) {
      setMessage("Inventory Item select કરો.");
      return;
    }

    if (!supplierName.trim()) {
      setMessage("Supplier Name જરૂરી છે.");
      return;
    }

    const qty = Number(orderedQty);

    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage(
        "Ordered Quantity સાચી નાખો."
      );
      return;
    }

    let price: number | null = null;

    if (unitPrice.trim()) {
      price = Number(unitPrice);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        setMessage("Unit Price સાચી નાખો.");
        return;
      }
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "create_purchase_order",
      {
        p_purchase_number:
          purchaseNumber.trim(),
        p_item_id: itemId,
        p_supplier_name:
          supplierName.trim(),
        p_ordered_quantity: qty,
        p_unit_price: price,
        p_order_date: orderDate || null,
        p_expected_date:
          expectedDate || null,
        p_note: note.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `Purchase Create Error: ${error.message}`
      );
      setSaving(false);
      return;
    }

    setPurchaseNumber("");
    setItemId("");
    setSupplierName("");
    setOrderedQty("");
    setUnitPrice("");
    setExpectedDate("");
    setNote("");
    setShowCreate(false);

    setMessage(
      "Purchase Order Created ✅"
    );

    await loadData();
    setSaving(false);
  }

  async function receiveStock(
    purchase: PurchaseOrder
  ) {
    if (!canManage) return;

    const remaining =
      Number(purchase.ordered_quantity) -
      Number(purchase.received_quantity);

    const value = window.prompt(
      `Receive Quantity લખો. Remaining: ${remaining}`
    );

    if (value === null) return;

    const qty = Number(value);

    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage(
        "Receive Quantity સાચી નાખો."
      );
      return;
    }

    if (qty > remaining) {
      setMessage(
        `Receive Quantity Remaining ${remaining} કરતાં વધારે ન હોઈ શકે.`
      );
      return;
    }

    const reference = window.prompt(
      "Supplier Invoice / Challan / Reference (optional):"
    );

    if (reference === null) return;

    const receiptNote = window.prompt(
      "Receipt Note (optional):"
    );

    if (receiptNote === null) return;

    setActionId(`receive-${purchase.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "receive_purchase_stock",
      {
        p_purchase_order_id: purchase.id,
        p_received_quantity: qty,
        p_reference:
          reference.trim() || null,
        p_note:
          receiptNote.trim() || null,
      }
    );

    if (error) {
      setMessage(
        `Receive Stock Error: ${error.message}`
      );
      setActionId(null);
      return;
    }

    setMessage(
      `${purchase.purchase_number} Stock Received ✅`
    );

    await loadData();
    setActionId(null);
  }

  async function cancelPurchase(
    purchase: PurchaseOrder
  ) {
    if (!canManage) return;

    const reason = window.prompt(
      "Purchase Cancel Reason લખો:"
    );

    if (reason === null) return;

    if (!reason.trim()) {
      setMessage("Cancel Reason જરૂરી છે.");
      return;
    }

    setActionId(`cancel-${purchase.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "cancel_purchase_order",
      {
        p_purchase_order_id: purchase.id,
        p_reason: reason.trim(),
      }
    );

    if (error) {
      setMessage(
        `Cancel Error: ${error.message}`
      );
      setActionId(null);
      return;
    }

    setMessage("Purchase Cancelled.");
    await loadData();
    setActionId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">
          Purchase Management લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              YASHFLOW PURCHASE
            </p>

            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Purchase Management
            </h1>

            <p className="text-sm text-blue-100 mt-1">
              {canManage
                ? "Manage Access"
                : "View Only"}
              {" • "}
              Purchase → Stock Receive
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(isAdmin ? "/admin" : "/dashboard")
            }
            className="yf-btn bg-white text-blue-700"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 font-bold text-blue-900">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">
              OPEN PURCHASES
            </p>
            <p className="text-3xl font-black text-blue-700 mt-1">
              {openCount}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">
              PARTIAL RECEIVE
            </p>
            <p className="text-3xl font-black text-amber-700 mt-1">
              {partialCount}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">
              RECEIVED
            </p>
            <p className="text-3xl font-black text-green-700 mt-1">
              {receivedCount}
            </p>
          </div>

          <div className="yf-card p-4">
            <p className="text-xs font-black text-slate-500">
              OPEN VALUE
            </p>
            <p className="text-2xl font-black text-purple-700 mt-1">
              ₹
              {totalOpenValue.toLocaleString(
                "en-IN",
                {
                  maximumFractionDigits: 2,
                }
              )}
            </p>
          </div>
        </section>

        <section className="yf-card p-4 sm:p-5 mb-5">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex-1 grid sm:grid-cols-2 gap-3">
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search Purchase / Item / Supplier..."
                className="yf-input"
              />

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value
                  )
                }
                className="yf-input"
              >
                <option value="all">
                  All Status
                </option>
                <option value="ordered">
                  Ordered
                </option>
                <option value="partially_received">
                  Partially Received
                </option>
                <option value="received">
                  Received
                </option>
                <option value="cancelled">
                  Cancelled
                </option>
              </select>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() =>
                  setShowCreate(
                    (current) => !current
                  )
                }
                className="yf-btn yf-btn-primary"
              >
                {showCreate
                  ? "✕ Close"
                  : "+ New Purchase"}
              </button>
            )}
          </div>
        </section>

        {showCreate && canManage && (
          <section className="yf-card p-5 sm:p-6 mb-5">
            <p className="text-xs font-black tracking-[0.15em] text-blue-700">
              NEW PURCHASE
            </p>

            <h2 className="yf-section-title mt-1">
              Create Purchase Order
            </h2>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
              <input
                value={purchaseNumber}
                onChange={(event) =>
                  setPurchaseNumber(
                    event.target.value
                  )
                }
                placeholder="Purchase Number / PO-1001"
                className="yf-input"
              />

              <select
                value={itemId}
                onChange={(event) =>
                  setItemId(event.target.value)
                }
                className="yf-input"
              >
                <option value="">
                  Select Inventory Item
                </option>

                {items.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.item_name} ({item.item_code}) • Stock {item.current_stock} {item.unit}
                  </option>
                ))}
              </select>

              <input
                value={supplierName}
                onChange={(event) =>
                  setSupplierName(
                    event.target.value
                  )
                }
                placeholder="Supplier Name"
                className="yf-input"
              />

              <input
                type="number"
                min="0.0001"
                step="0.0001"
                value={orderedQty}
                onChange={(event) =>
                  setOrderedQty(
                    event.target.value
                  )
                }
                placeholder="Quantity"
                className="yf-input"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(event) =>
                  setUnitPrice(
                    event.target.value
                  )
                }
                placeholder="Unit Price"
                className="yf-input"
              />

              <input
                type="date"
                value={orderDate}
                onChange={(event) =>
                  setOrderDate(
                    event.target.value
                  )
                }
                className="yf-input"
              />

              <input
                type="date"
                value={expectedDate}
                onChange={(event) =>
                  setExpectedDate(
                    event.target.value
                  )
                }
                className="yf-input"
              />

              <textarea
                rows={2}
                value={note}
                onChange={(event) =>
                  setNote(event.target.value)
                }
                placeholder="Note"
                className="yf-input resize-none md:col-span-2 xl:col-span-3"
              />

              <button
                type="button"
                onClick={createPurchase}
                disabled={saving}
                className="yf-btn yf-btn-primary md:col-span-2 xl:col-span-3 disabled:opacity-50"
              >
                {saving
                  ? "Creating..."
                  : "Create Purchase Order"}
              </button>
            </div>
          </section>
        )}

        <section className="yf-card overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="yf-section-title">
              Purchase Orders
            </h2>

            <p className="yf-section-subtitle mt-1">
              {filteredPurchases.length} purchase(s)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead className="bg-slate-50">
                <tr className="text-xs font-black uppercase text-slate-500">
                  <th className="text-left px-4 py-3">
                    Purchase
                  </th>
                  <th className="text-left px-4 py-3">
                    Item
                  </th>
                  <th className="text-left px-4 py-3">
                    Supplier
                  </th>
                  <th className="text-left px-4 py-3">
                    Ordered
                  </th>
                  <th className="text-left px-4 py-3">
                    Received
                  </th>
                  <th className="text-left px-4 py-3">
                    Remaining
                  </th>
                  <th className="text-left px-4 py-3">
                    Price
                  </th>
                  <th className="text-left px-4 py-3">
                    Expected
                  </th>
                  <th className="text-left px-4 py-3">
                    Status
                  </th>
                  <th className="text-left px-4 py-3">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredPurchases.map(
                  (purchase) => {
                    const item = itemMap.get(
                      purchase.item_id
                    );

                    const remaining =
                      Number(
                        purchase.ordered_quantity
                      ) -
                      Number(
                        purchase.received_quantity
                      );

                    return (
                      <tr
                        key={purchase.id}
                        className="border-t border-slate-100 align-top"
                      >
                        <td className="px-4 py-3">
                          <p className="font-black text-blue-700">
                            {purchase.purchase_number}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {purchase.order_date}
                          </p>
                        </td>

                        <td className="px-4 py-3">
                          <p className="font-bold">
                            {item?.item_name ||
                              "Unknown Item"}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {item?.item_code || ""}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Current Stock:{" "}
                            {item?.current_stock ??
                              "-"}{" "}
                            {item?.unit || ""}
                          </p>
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {purchase.supplier_name}
                        </td>

                        <td className="px-4 py-3 font-black">
                          {purchase.ordered_quantity}{" "}
                          {item?.unit || ""}
                        </td>

                        <td className="px-4 py-3 font-black text-green-700">
                          {purchase.received_quantity}{" "}
                          {item?.unit || ""}
                        </td>

                        <td className="px-4 py-3 font-black text-amber-700">
                          {remaining}{" "}
                          {item?.unit || ""}
                        </td>

                        <td className="px-4 py-3 font-bold">
                          {purchase.unit_price ==
                          null
                            ? "-"
                            : `₹${Number(
                                purchase.unit_price
                              ).toLocaleString(
                                "en-IN"
                              )}`}
                        </td>

                        <td className="px-4 py-3">
                          {purchase.expected_date ||
                            "-"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`yf-badge ${statusClass(
                              purchase.status
                            )}`}
                          >
                            {statusLabel(
                              purchase.status
                            )}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {canManage &&
                          [
                            "ordered",
                            "partially_received",
                          ].includes(
                            purchase.status
                          ) ? (
                            <div className="flex flex-col gap-2 w-[150px]">
                              <button
                                type="button"
                                disabled={
                                  actionId ===
                                  `receive-${purchase.id}`
                                }
                                onClick={() =>
                                  receiveStock(
                                    purchase
                                  )
                                }
                                className="yf-btn yf-btn-success"
                              >
                                Receive Stock
                              </button>

                              {Number(
                                purchase.received_quantity
                              ) === 0 && (
                                <button
                                  type="button"
                                  disabled={
                                    actionId ===
                                    `cancel-${purchase.id}`
                                  }
                                  onClick={() =>
                                    cancelPurchase(
                                      purchase
                                    )
                                  }
                                  className="yf-btn bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">
                              {canManage
                                ? statusLabel(
                                    purchase.status
                                  )
                                : "View Only"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}

                {filteredPurchases.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      કોઈ Purchase Order મળ્યો નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
