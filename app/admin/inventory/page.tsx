"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type InventoryItem = {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  purchase_price: number | null;
  supplier_name: string | null;
  location: string | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

type InventoryTransaction = {
  id: string;
  item_id: string;
  transaction_type:
    | "purchase"
    | "usage"
    | "adjustment_in"
    | "adjustment_out"
    | "return_in"
    | "return_out";
  quantity: number;
  reference: string | null;
  note: string | null;
  created_at: string;
};

export default function AdminInventoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stockSavingId, setStockSavingId] =
    useState<string | null>(null);

  const [adminId, setAdminId] = useState<string | null>(
    null
  );

  const [items, setItems] = useState<InventoryItem[]>(
    []
  );

  const [transactions, setTransactions] = useState<
    InventoryTransaction[]
  >([]);

  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("other");
  const [unit, setUnit] = useState("pcs");
  const [currentStock, setCurrentStock] =
    useState("0");
  const [minimumStock, setMinimumStock] =
    useState("0");
  const [purchasePrice, setPurchasePrice] =
    useState("");
  const [supplierName, setSupplierName] =
    useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] =
    useState("all");
  const [showLowStockOnly, setShowLowStockOnly] =
    useState(false);

  const [stockQty, setStockQty] = useState<
    Record<string, string>
  >({});

  const [stockType, setStockType] = useState<
    Record<string, "in" | "out">
  >({});

  const [stockReference, setStockReference] =
    useState<Record<string, string>>({});

  const [stockNote, setStockNote] = useState<
    Record<string, string>
  >({});

  const [message, setMessage] = useState("");

  async function loadInventory() {
    const supabase = createClient();

    const { data: itemData, error: itemError } =
      await supabase
        .from("inventory_items")
        .select(`
          id,
          item_code,
          item_name,
          category,
          unit,
          current_stock,
          minimum_stock,
          purchase_price,
          supplier_name,
          location,
          note,
          is_active,
          created_at
        `)
        .order("item_name", { ascending: true });

    if (itemError) {
      setMessage(
        `Inventory Load Error: ${itemError.message}`
      );
      return;
    }

    const {
      data: transactionData,
      error: transactionError,
    } = await supabase
      .from("inventory_transactions")
      .select(`
        id,
        item_id,
        transaction_type,
        quantity,
        reference,
        note,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (transactionError) {
      setMessage(
        `Transaction Load Error: ${transactionError.message}`
      );
      return;
    }

    setItems((itemData || []) as InventoryItem[]);

    setTransactions(
      (transactionData ||
        []) as InventoryTransaction[]
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

      const {
        data: adminProfile,
        error: adminError,
      } = await supabase
        .from("employees")
        .select(`
          id,
          role,
          approval_status,
          is_active
        `)
        .eq("auth_user_id", user.id)
        .single();

      if (
        adminError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        adminProfile.approval_status !== "approved" ||
        !adminProfile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      setAdminId(adminProfile.id);

      await loadInventory();

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleCreateItem() {
    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    if (!itemCode.trim()) {
      setMessage("Item Code જરૂરી છે.");
      return;
    }

    if (!itemName.trim()) {
      setMessage("Item Name જરૂરી છે.");
      return;
    }

    const stock = Number(currentStock);
    const minStock = Number(minimumStock);

    if (Number.isNaN(stock) || stock < 0) {
      setMessage("Current Stock સાચો નાખો.");
      return;
    }

    if (
      Number.isNaN(minStock) ||
      minStock < 0
    ) {
      setMessage("Minimum Stock સાચો નાખો.");
      return;
    }

    let price: number | null = null;

    if (purchasePrice.trim()) {
      price = Number(purchasePrice);

      if (Number.isNaN(price) || price < 0) {
        setMessage(
          "Purchase Price સાચી નાખો."
        );
        return;
      }
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { data: newItem, error } =
      await supabase
        .from("inventory_items")
        .insert({
          item_code: itemCode.trim(),
          item_name: itemName.trim(),
          category,
          unit,
          current_stock: stock,
          minimum_stock: minStock,
          purchase_price: price,
          supplier_name:
            supplierName.trim() || null,
          location: location.trim() || null,
          note: note.trim() || null,
          created_by: adminId,
        })
        .select("id")
        .single();

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ Item Code પહેલેથી છે."
          : `Item Create Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    if (newItem && stock > 0) {
      await supabase
        .from("inventory_transactions")
        .insert({
          item_id: newItem.id,
          transaction_type: "adjustment_in",
          quantity: stock,
          reference: "Opening Stock",
          note: "Initial Inventory Stock",
          created_by: adminId,
        });
    }

    setItemCode("");
    setItemName("");
    setCategory("other");
    setUnit("pcs");
    setCurrentStock("0");
    setMinimumStock("0");
    setPurchasePrice("");
    setSupplierName("");
    setLocation("");
    setNote("");

    setMessage(
      "Inventory Item સફળતાપૂર્વક Add થયો ✅"
    );

    await loadInventory();

    setSaving(false);
  }

  async function handleStockUpdate(
    item: InventoryItem
  ) {
    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    const qty = Number(stockQty[item.id] || "");

    if (
      Number.isNaN(qty) ||
      qty <= 0
    ) {
      setMessage(
        `${item.item_name} માટે Quantity સાચી નાખો.`
      );
      return;
    }

    const type = stockType[item.id] || "in";

    let newStock = item.current_stock;
    let transactionType:
      | "purchase"
      | "usage";

    if (type === "in") {
      newStock = item.current_stock + qty;
      transactionType = "purchase";
    } else {
      if (qty > item.current_stock) {
        setMessage(
          `${item.item_name}માં પૂરતો Stock નથી.`
        );
        return;
      }

      newStock = item.current_stock - qty;
      transactionType = "usage";
    }

    setStockSavingId(item.id);
    setMessage("");

    const supabase = createClient();

    const { error: updateError } =
      await supabase
        .from("inventory_items")
        .update({
          current_stock: newStock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);

    if (updateError) {
      setMessage(
        `Stock Update Error: ${updateError.message}`
      );

      setStockSavingId(null);
      return;
    }

    const { error: transactionError } =
      await supabase
        .from("inventory_transactions")
        .insert({
          item_id: item.id,
          transaction_type: transactionType,
          quantity: qty,
          reference:
            stockReference[item.id]?.trim() ||
            null,
          note:
            stockNote[item.id]?.trim() || null,
          created_by: adminId,
        });

    if (transactionError) {
      setMessage(
        `Stock update થયો, પણ Transaction Error: ${transactionError.message}`
      );
    } else {
      setMessage(
        `${item.item_name} Stock ${
          type === "in" ? "IN" : "OUT"
        } સફળ ✅`
      );
    }

    setStockQty((old) => ({
      ...old,
      [item.id]: "",
    }));

    setStockReference((old) => ({
      ...old,
      [item.id]: "",
    }));

    setStockNote((old) => ({
      ...old,
      [item.id]: "",
    }));

    await loadInventory();

    setStockSavingId(null);
  }

  async function handleToggleActive(
    item: InventoryItem
  ) {
    const supabase = createClient();

    const { error } = await supabase
      .from("inventory_items")
      .update({
        is_active: !item.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(
        `Status Update Error: ${error.message}`
      );
      return;
    }

    setMessage(
      item.is_active
        ? `${item.item_name} Deactivate થયો.`
        : `${item.item_name} Activate થયો ✅`
    );

    await loadInventory();
  }

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => item.category)
          .filter(Boolean)
      )
    ).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const searchValue =
      search.trim().toLowerCase();

    return items.filter((item) => {
      const searchMatch =
        !searchValue ||
        item.item_name
          .toLowerCase()
          .includes(searchValue) ||
        item.item_code
          .toLowerCase()
          .includes(searchValue) ||
        (item.supplier_name || "")
          .toLowerCase()
          .includes(searchValue);

      const categoryMatch =
        filterCategory === "all" ||
        item.category === filterCategory;

      const lowStockMatch =
        !showLowStockOnly ||
        item.current_stock <=
          item.minimum_stock;

      return (
        searchMatch &&
        categoryMatch &&
        lowStockMatch
      );
    });
  }, [
    items,
    search,
    filterCategory,
    showLowStockOnly,
  ]);

  const activeItems = items.filter(
    (item) => item.is_active
  );

  const lowStockCount =
    activeItems.filter(
      (item) =>
        item.current_stock <=
        item.minimum_stock
    ).length;

  const outOfStockCount =
    activeItems.filter(
      (item) => item.current_stock === 0
    ).length;

  const totalStockValue =
    activeItems.reduce((total, item) => {
      if (item.purchase_price === null) {
        return total;
      }

      return (
        total +
        item.current_stock *
          item.purchase_price
      );
    }, 0);

  function getTransactionLabel(
    type: InventoryTransaction["transaction_type"]
  ) {
    if (type === "purchase")
      return "Stock IN";

    if (type === "usage")
      return "Stock OUT";

    if (type === "adjustment_in")
      return "Adjustment IN";

    if (type === "adjustment_out")
      return "Adjustment OUT";

    if (type === "return_in")
      return "Return IN";

    return "Return OUT";
  }

  function getTransactionStyle(
    type: InventoryTransaction["transaction_type"]
  ) {
    if (
      type === "purchase" ||
      type === "adjustment_in" ||
      type === "return_in"
    ) {
      return "bg-green-100 text-green-700";
    }

    return "bg-red-100 text-red-700";
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Inventory Management લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Inventory & Stock Management
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/admin")
            }
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4 font-semibold text-blue-800">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Active Items
            </p>

            <p className="text-3xl font-black mt-2 text-blue-600">
              {activeItems.length}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Low Stock
            </p>

            <p className="text-3xl font-black mt-2 text-amber-600">
              {lowStockCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Out of Stock
            </p>

            <p className="text-3xl font-black mt-2 text-red-600">
              {outOfStockCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Stock Value
            </p>

            <p className="text-3xl font-black mt-2 text-green-600">
              ₹
              {totalStockValue.toLocaleString(
                "en-IN",
                {
                  maximumFractionDigits: 2,
                }
              )}
            </p>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-xl font-black text-slate-900">
            Add Inventory Item
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Item Code
              </label>

              <input
                value={itemCode}
                onChange={(e) =>
                  setItemCode(e.target.value)
                }
                placeholder="Example: ACR-3MM"
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Item Name
              </label>

              <input
                value={itemName}
                onChange={(e) =>
                  setItemName(e.target.value)
                }
                placeholder="Example: Acrylic Sheet 3mm"
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Category
              </label>

              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
              >
                <option value="acrylic">
                  Acrylic
                </option>
                <option value="printing">
                  Printing Material
                </option>
                <option value="base">
                  Base / Stand
                </option>
                <option value="packing">
                  Packing
                </option>
                <option value="medal">
                  Medal
                </option>
                <option value="trophy">
                  Trophy
                </option>
                <option value="keychain">
                  Keychain
                </option>
                <option value="id_card">
                  ID Card
                </option>
                <option value="hardware">
                  Hardware
                </option>
                <option value="other">
                  Other
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Unit
              </label>

              <select
                value={unit}
                onChange={(e) =>
                  setUnit(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
              >
                <option value="pcs">
                  Pcs
                </option>
                <option value="sheet">
                  Sheet
                </option>
                <option value="kg">
                  Kg
                </option>
                <option value="meter">
                  Meter
                </option>
                <option value="roll">
                  Roll
                </option>
                <option value="box">
                  Box
                </option>
                <option value="pack">
                  Pack
                </option>
                <option value="liter">
                  Liter
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Opening Stock
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={currentStock}
                onChange={(e) =>
                  setCurrentStock(
                    e.target.value
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Minimum Stock
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={minimumStock}
                onChange={(e) =>
                  setMinimumStock(
                    e.target.value
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Purchase Price
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(e) =>
                  setPurchasePrice(
                    e.target.value
                  )
                }
                placeholder="₹"
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Supplier
              </label>

              <input
                value={supplierName}
                onChange={(e) =>
                  setSupplierName(
                    e.target.value
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Storage Location
              </label>

              <input
                value={location}
                onChange={(e) =>
                  setLocation(e.target.value)
                }
                placeholder="Rack A-1"
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Note
              </label>

              <textarea
                rows={2}
                value={note}
                onChange={(e) =>
                  setNote(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 resize-none"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={handleCreateItem}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : "Add Inventory Item"}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl mt-5 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Inventory Items
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Stock IN / OUT અને Low Stock Track કરો
                </p>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                  placeholder="Search item/code/supplier"
                  className="border border-slate-300 rounded-xl px-4 py-2"
                />

                <select
                  value={filterCategory}
                  onChange={(e) =>
                    setFilterCategory(
                      e.target.value
                    )
                  }
                  className="border border-slate-300 rounded-xl px-4 py-2 bg-white"
                >
                  <option value="all">
                    All Categories
                  </option>

                  {categories.map(
                    (categoryName) => (
                      <option
                        key={categoryName}
                        value={categoryName}
                      >
                        {categoryName}
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setShowLowStockOnly(
                      !showLowStockOnly
                    )
                  }
                  className={`px-4 py-2 rounded-xl font-bold ${
                    showLowStockOnly
                      ? "bg-amber-500 text-white"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  Low Stock Only
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1500px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Item
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Category
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Stock
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Minimum
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Price
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Supplier
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Location
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Stock Movement
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => {
                  const lowStock =
                    item.current_stock <=
                    item.minimum_stock;

                  return (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900">
                          {item.item_name}
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                          {item.item_code}
                        </p>

                        {item.note && (
                          <p className="text-xs text-slate-500 mt-2 max-w-[220px]">
                            {item.note}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4 capitalize font-semibold">
                        {item.category.replace(
                          /_/g,
                          " "
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`text-lg font-black ${
                            item.current_stock === 0
                              ? "text-red-600"
                              : lowStock
                              ? "text-amber-600"
                              : "text-green-600"
                          }`}
                        >
                          {item.current_stock}{" "}
                          {item.unit}
                        </span>

                        {lowStock && (
                          <p className="text-xs font-bold text-amber-600 mt-1">
                            LOW STOCK
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {item.minimum_stock}{" "}
                        {item.unit}
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {item.purchase_price ===
                        null
                          ? "-"
                          : `₹${Number(
                              item.purchase_price
                            ).toLocaleString(
                              "en-IN"
                            )}`}
                      </td>

                      <td className="px-5 py-4">
                        {item.supplier_name || "-"}
                      </td>

                      <td className="px-5 py-4">
                        {item.location || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <div className="w-[260px] space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={
                                stockType[
                                  item.id
                                ] || "in"
                              }
                              onChange={(e) =>
                                setStockType(
                                  (old) => ({
                                    ...old,
                                    [item.id]:
                                      e.target
                                        .value as
                                        | "in"
                                        | "out",
                                  })
                                )
                              }
                              className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm font-semibold"
                            >
                              <option value="in">
                                Stock IN
                              </option>

                              <option value="out">
                                Stock OUT
                              </option>
                            </select>

                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={
                                stockQty[
                                  item.id
                                ] || ""
                              }
                              onChange={(e) =>
                                setStockQty(
                                  (old) => ({
                                    ...old,
                                    [item.id]:
                                      e.target
                                        .value,
                                  })
                                )
                              }
                              placeholder="Qty"
                              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>

                          <input
                            value={
                              stockReference[
                                item.id
                              ] || ""
                            }
                            onChange={(e) =>
                              setStockReference(
                                (old) => ({
                                  ...old,
                                  [item.id]:
                                    e.target.value,
                                })
                              )
                            }
                            placeholder="Reference / PO / Order"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                          />

                          <input
                            value={
                              stockNote[
                                item.id
                              ] || ""
                            }
                            onChange={(e) =>
                              setStockNote(
                                (old) => ({
                                  ...old,
                                  [item.id]:
                                    e.target.value,
                                })
                              )
                            }
                            placeholder="Note"
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                          />

                          <button
                            type="button"
                            disabled={
                              stockSavingId ===
                              item.id
                            }
                            onClick={() =>
                              handleStockUpdate(
                                item
                              )
                            }
                            className="w-full bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                          >
                            {stockSavingId ===
                            item.id
                              ? "Updating..."
                              : "Update Stock"}
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="space-y-2">
                          <span
                            className={`inline-block px-3 py-1.5 rounded-full text-xs font-bold ${
                              item.is_active
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {item.is_active
                              ? "ACTIVE"
                              : "INACTIVE"}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleToggleActive(
                                item
                              )
                            }
                            className="block bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold"
                          >
                            {item.is_active
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      કોઈ Inventory Item મળ્યો નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl mt-5 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h2 className="text-xl font-black text-slate-900">
              Recent Stock Transactions
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Date
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Item
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Type
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Quantity
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Reference
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Note
                  </th>
                </tr>
              </thead>

              <tbody>
                {transactions.map(
                  (transaction) => {
                    const item = items.find(
                      (row) =>
                        row.id ===
                        transaction.item_id
                    );

                    return (
                      <tr
                        key={transaction.id}
                        className="border-t border-slate-100"
                      >
                        <td className="px-5 py-4 text-sm font-semibold">
                          {formatDateTime(
                            transaction.created_at
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-bold">
                            {item?.item_name ||
                              "Unknown Item"}
                          </p>

                          <p className="text-xs text-slate-400">
                            {item?.item_code ||
                              ""}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`px-3 py-1.5 rounded-full text-xs font-bold ${getTransactionStyle(
                              transaction.transaction_type
                            )}`}
                          >
                            {getTransactionLabel(
                              transaction.transaction_type
                            )}
                          </span>
                        </td>

                        <td className="px-5 py-4 font-black">
                          {transaction.quantity}
                        </td>

                        <td className="px-5 py-4">
                          {transaction.reference ||
                            "-"}
                        </td>

                        <td className="px-5 py-4">
                          {transaction.note || "-"}
                        </td>
                      </tr>
                    );
                  }
                )}

                {transactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      હજુ કોઈ Stock Transaction નથી.
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