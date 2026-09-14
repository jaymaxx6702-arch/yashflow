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

type Product = {
  id: string;
  name: string;
};

type WorkflowStage = {
  id: string;
  code: string;
  name: string;
};

type ProductBom = {
  id: string;
  product_id: string;
  item_id: string;
  consume_stage_id: string;
  quantity_per_unit: number;
  is_active: boolean;
  created_at: string;
};

type InventoryConsumption = {
  id: string;
  order_id: string;
  order_stage_work_id: string;
  bom_id: string;
  item_id: string;
  order_quantity: number;
  quantity_used: number;
  status: "active" | "reversed";
  reversed_reason: string | null;
  created_at: string;
  reversed_at: string | null;
  orders?: {
    order_number?: string | null;
    product_name?: string | null;
  } | null;
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

  const [canViewInventory, setCanViewInventory] = useState(false);
  const [canManageInventory, setCanManageInventory] = useState(false);

  const [items, setItems] = useState<InventoryItem[]>(
    []
  );

  const [transactions, setTransactions] = useState<
    InventoryTransaction[]
  >([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [workflowStages, setWorkflowStages] = useState<WorkflowStage[]>([]);
  const [bomRows, setBomRows] = useState<ProductBom[]>([]);
  const [consumptions, setConsumptions] = useState<InventoryConsumption[]>([]);

  const [bomProductId, setBomProductId] = useState("");
  const [bomItemId, setBomItemId] = useState("");
  const [bomStageId, setBomStageId] = useState("");
  const [bomQtyPerUnit, setBomQtyPerUnit] = useState("1");
  const [bomSaving, setBomSaving] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);

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

    const [
      productResult,
      stageResult,
      bomResult,
      consumptionResult,
    ] = await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),

      supabase
        .from("workflow_stages")
        .select("id, code, name")
        .eq("is_active", true)
        .order("sort_order"),

      supabase
        .from("product_inventory_bom")
        .select(`
          id,
          product_id,
          item_id,
          consume_stage_id,
          quantity_per_unit,
          is_active,
          created_at
        `)
        .order("created_at", { ascending: false }),

      supabase
        .from("order_inventory_consumptions")
        .select(`
          id,
          order_id,
          order_stage_work_id,
          bom_id,
          item_id,
          order_quantity,
          quantity_used,
          status,
          reversed_reason,
          created_at,
          reversed_at,
          orders (
            order_number,
            product_name
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const extraError =
      productResult.error ||
      stageResult.error ||
      bomResult.error ||
      consumptionResult.error;

    if (extraError) {
      setMessage(
        `Inventory Automation Load Error: ${extraError.message}`
      );
      return;
    }

    setProducts((productResult.data || []) as Product[]);
    setWorkflowStages(
      (stageResult.data || []) as WorkflowStage[]
    );
    setBomRows((bomResult.data || []) as ProductBom[]);
    setConsumptions(
      (consumptionResult.data || []) as unknown as InventoryConsumption[]
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
        data: profile,
        error: profileError,
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
        profileError ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/");
        return;
      }

      const isAdmin = profile.role === "admin";

      let viewAllowed = isAdmin;
      let manageAllowed = isAdmin;

      if (!isAdmin) {
        const [viewPermission, managePermission] =
          await Promise.all([
            supabase.rpc("has_app_permission", {
              p_permission_key: "inventory.view",
            }),
            supabase.rpc("has_app_permission", {
              p_permission_key: "inventory.manage",
            }),
          ]);

        if (viewPermission.error || managePermission.error) {
          setMessage(
            `Permission Check Error: ${
              viewPermission.error?.message ||
              managePermission.error?.message ||
              "Unknown error"
            }`
          );
          setLoading(false);
          return;
        }

        viewAllowed =
          Boolean(viewPermission.data) ||
          Boolean(managePermission.data);

        manageAllowed = Boolean(managePermission.data);
      }

      if (!viewAllowed) {
        router.replace("/dashboard");
        return;
      }

      setAdminId(profile.id);
      setCanViewInventory(viewAllowed);
      setCanManageInventory(manageAllowed);

      await loadInventory();

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleCreateItem() {
    if (!canManageInventory) {
      setMessage("Inventory Manage permission જરૂરી છે.");
      return;
    }

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
    if (!canManageInventory) {
      setMessage("Inventory Manage permission જરૂરી છે.");
      return;
    }

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
    if (!canManageInventory) {
      setMessage("Inventory Manage permission જરૂરી છે.");
      return;
    }

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

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );

  const stageMap = useMemo(
    () => new Map(workflowStages.map((stage) => [stage.id, stage])),
    [workflowStages]
  );

  async function handleCreateBom() {
    if (!canManageInventory) {
      setMessage("Inventory Manage permission જરૂરી છે.");
      return;
    }

    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    if (!bomProductId || !bomItemId || !bomStageId) {
      setMessage(
        "BOM માટે Product, Material અને Consume Stage select કરો."
      );
      return;
    }

    const qty = Number(bomQtyPerUnit);

    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage("Material Qty per Product સાચી નાખો.");
      return;
    }

    setBomSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("product_inventory_bom")
      .insert({
        product_id: bomProductId,
        item_id: bomItemId,
        consume_stage_id: bomStageId,
        quantity_per_unit: qty,
        created_by: adminId,
      });

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ Product + Material + Stage mapping પહેલેથી છે."
          : `BOM Save Error: ${error.message}`
      );
      setBomSaving(false);
      return;
    }

    setBomItemId("");
    setBomQtyPerUnit("1");
    setMessage("Product Material Mapping Saved ✅");

    await loadInventory();
    setBomSaving(false);
  }

  async function handleDeleteBom(row: ProductBom) {
    if (!canManageInventory) {
      setMessage("Inventory Manage permission જરૂરી છે.");
      return;
    }

    const productName =
      productMap.get(row.product_id)?.name || "Product";
    const itemName =
      itemMap.get(row.item_id)?.item_name || "Material";

    const confirmed = window.confirm(
      `${productName} → ${itemName} mapping remove કરવું છે?`
    );

    if (!confirmed) return;

    const supabase = createClient();

    const { error } = await supabase
      .from("product_inventory_bom")
      .delete()
      .eq("id", row.id);

    if (error) {
      setMessage(`BOM Remove Error: ${error.message}`);
      return;
    }

    setMessage("Material Mapping Removed ✅");
    await loadInventory();
  }

  async function handleReverseConsumption(
    consumption: InventoryConsumption
  ) {
    if (!canManageInventory) {
      setMessage("Inventory Manage permission જરૂરી છે.");
      return;
    }

    const reason = window.prompt(
      "Stock consumption reverse કરવાનું કારણ લખો:"
    );

    if (reason === null) return;

    if (!reason.trim()) {
      setMessage("Reverse Reason જરૂરી છે.");
      return;
    }

    const confirmed = window.confirm(
      "આ consumption reverse કરતાં Stock પાછો Inventoryમાં add થશે. Continue?"
    );

    if (!confirmed) return;

    setReverseId(consumption.id);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase.rpc(
      "admin_reverse_inventory_consumption",
      {
        p_consumption_id: consumption.id,
        p_reason: reason.trim(),
      }
    );

    if (error) {
      setMessage(`Reverse Error: ${error.message}`);
      setReverseId(null);
      return;
    }

    setMessage("Stock Consumption Reversed ✅");
    await loadInventory();
    setReverseId(null);
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
              {" • "}
              {canManageInventory ? "Manage Access" : "View Only"}
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

        {canManageInventory && (
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
        )}

        {canManageInventory && (
          <section className="bg-white border border-slate-200 rounded-2xl mt-5 p-6">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-700">
              AUTO STOCK CONSUMPTION
            </p>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              Product Material / BOM Mapping
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Productના selected Workflow Stage પર Start Work થતાં required stock automatic deduct થશે.
            </p>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 mt-5">
            <select
              value={bomProductId}
              onChange={(e) => setBomProductId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
            >
              <option value="">Select Product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            <select
              value={bomItemId}
              onChange={(e) => setBomItemId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
            >
              <option value="">Select Material</option>
              {items
                .filter((item) => item.is_active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.item_name} ({item.unit})
                  </option>
                ))}
            </select>

            <input
              type="number"
              min="0.0001"
              step="0.0001"
              value={bomQtyPerUnit}
              onChange={(e) => setBomQtyPerUnit(e.target.value)}
              placeholder="Qty / Product"
              className="w-full border border-slate-300 rounded-xl px-4 py-3"
            />

            <select
              value={bomStageId}
              onChange={(e) => setBomStageId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
            >
              <option value="">Consume at Stage</option>
              {workflowStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleCreateBom}
              disabled={bomSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold disabled:opacity-50"
            >
              {bomSaving ? "Saving..." : "+ Add Mapping"}
            </button>
          </div>

          <div className="overflow-x-auto mt-5">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-sm">Product</th>
                  <th className="text-left px-4 py-3 text-sm">Material</th>
                  <th className="text-left px-4 py-3 text-sm">Qty / Product</th>
                  <th className="text-left px-4 py-3 text-sm">Consume Stage</th>
                  <th className="text-left px-4 py-3 text-sm">Action</th>
                </tr>
              </thead>

              <tbody>
                {bomRows.map((row) => {
                  const item = itemMap.get(row.item_id);
                  const product = productMap.get(row.product_id);
                  const stage = stageMap.get(row.consume_stage_id);

                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold">
                        {product?.name || "Unknown Product"}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold">
                          {item?.item_name || "Unknown Material"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item?.item_code || ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-black">
                        {row.quantity_per_unit} {item?.unit || ""}
                      </td>
                      <td className="px-4 py-3 font-bold text-blue-700">
                        {stage?.name || "Unknown Stage"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleDeleteBom(row)}
                          className="bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 rounded-lg text-xs font-bold"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {bomRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      હજુ કોઈ Product Material Mapping નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

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
                        {canManageInventory ? (
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
                        ) : (
                          <span className="text-xs font-bold text-slate-400">
                            View Only
                          </span>
                        )}
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

                          {canManageInventory && (
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
                          )}
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
              Auto Order Consumptions
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Order workflowથી automatic deduct થયેલા stockનો audit.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">Date</th>
                  <th className="text-left px-5 py-4 text-sm">Order</th>
                  <th className="text-left px-5 py-4 text-sm">Material</th>
                  <th className="text-left px-5 py-4 text-sm">Order Qty</th>
                  <th className="text-left px-5 py-4 text-sm">Stock Used</th>
                  <th className="text-left px-5 py-4 text-sm">Status</th>
                  <th className="text-left px-5 py-4 text-sm">Action</th>
                </tr>
              </thead>

              <tbody>
                {consumptions.map((row) => {
                  const item = itemMap.get(row.item_id);

                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-5 py-4 text-sm font-semibold">
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-black">
                          {row.orders?.order_number || row.order_id}
                        </p>
                        <p className="text-xs text-slate-400">
                          {row.orders?.product_name || ""}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold">
                          {item?.item_name || "Unknown Item"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item?.item_code || ""}
                        </p>
                      </td>
                      <td className="px-5 py-4 font-bold">
                        {row.order_quantity}
                      </td>
                      <td className="px-5 py-4 font-black text-red-700">
                        -{row.quantity_used} {item?.unit || ""}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-black ${
                            row.status === "active"
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.status === "active" ? "CONSUMED" : "REVERSED"}
                        </span>
                        {row.reversed_reason && (
                          <p className="text-xs text-slate-500 mt-1 max-w-xs">
                            {row.reversed_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {row.status === "active" && canManageInventory ? (
                          <button
                            type="button"
                            disabled={reverseId === row.id}
                            onClick={() => handleReverseConsumption(row)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-800 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                          >
                            {reverseId === row.id
                              ? "Reversing..."
                              : "Reverse Stock"}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">
                            {row.status === "reversed" ? "Reversed" : "View Only"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {consumptions.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      હજુ કોઈ Auto Stock Consumption નથી.
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