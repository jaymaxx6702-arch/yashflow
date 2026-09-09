"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_mobile: string | null;
  product_name: string;
  quantity: number;
  order_source:
    | "amazon"
    | "flipkart"
    | "website"
    | "whatsapp"
    | "offline"
    | "other";
  current_stage:
     | "design"
     | "cutting"
     | "production"
     | "packing"
     | "transportation_dispatch"
     | "completed"
     | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  order_date: string;
  due_date: string | null;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
  completed_at: string | null;
  product_configuration?: Record<string, string> | null;
};

type Product = {
  id: string;
  name: string;
};

type ProductOption = {
  id: string;
  product_id: string;
  name: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
};

type OptionValue = {
  id: string;
  product_option_id: string;
  value: string;
  parent_value_id: string | null;
  sort_order: number;
  is_active: boolean;
};

type ValueDependency = {
  id: string;
  value_id: string;
  parent_value_id: string;
};

const stages = [
   "design",
  "cutting",
  "production",
  "packing",
  "transportation_dispatch",
  "completed",
  "cancelled",
] as const;

const nextStageMap: Partial<
  Record<Order["current_stage"], Order["current_stage"]>
> = {
   design: "cutting",
  cutting: "production",
  production: "packing",
  packing: "transportation_dispatch",
  transportation_dispatch: "completed",
};

export default function AdminOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);

  const [orders, setOrders] = useState<Order[]>([]);

  const [orderNumber, setOrderNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [optionValues, setOptionValues] = useState<OptionValue[]>([]);
  const [dependencies, setDependencies] = useState<ValueDependency[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedConfig, setSelectedConfig] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState("1");
  const [orderSource, setOrderSource] =
    useState<Order["order_source"]>("other");
  const [priority, setPriority] =
    useState<Order["priority"]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const [filterStage, setFilterStage] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");

  const [message, setMessage] = useState("");

  async function loadProductMaster() {
    const supabase = createClient();

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    if (productError) {
      setMessage(`Product Load Error: ${productError.message}`);
      return;
    }

    setProducts((productData || []) as Product[]);
  }

  async function loadProductConfiguration(productId: string) {
    if (!productId) {
      setProductOptions([]);
      setOptionValues([]);
      setDependencies([]);
      setSelectedConfig({});
      return;
    }

    const supabase = createClient();

    const { data: optionsData, error: optionsError } = await supabase
      .from("product_options")
      .select("id, product_id, name, sort_order, is_required, is_active")
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order");

    if (optionsError) {
      setMessage(`Product Option Error: ${optionsError.message}`);
      return;
    }

    const opts = (optionsData || []) as ProductOption[];
    setProductOptions(opts);
    setSelectedConfig({});

    if (!opts.length) {
      setOptionValues([]);
      setDependencies([]);
      return;
    }

    const { data: valuesData, error: valuesError } = await supabase
      .from("product_option_values")
      .select("id, product_option_id, value, parent_value_id, sort_order, is_active")
      .in("product_option_id", opts.map((o) => o.id))
      .eq("is_active", true)
      .order("sort_order");

    if (valuesError) {
      setMessage(`Product Value Error: ${valuesError.message}`);
      return;
    }

    const vals = (valuesData || []) as OptionValue[];
    setOptionValues(vals);

    if (!vals.length) {
      setDependencies([]);
      return;
    }

    const { data: depsData, error: depsError } = await supabase
      .from("product_value_dependencies")
      .select("id, value_id, parent_value_id")
      .in("value_id", vals.map((v) => v.id));

    if (depsError) {
      setMessage(`Dependency Error: ${depsError.message}`);
      return;
    }

    setDependencies((depsData || []) as ValueDependency[]);
  }

  function availableValuesForOption(option: ProductOption, optionIndex: number) {
    const ownValues = optionValues.filter(
      (value) => value.product_option_id === option.id
    );

    if (optionIndex === 0) return ownValues;

    const previousOption = productOptions[optionIndex - 1];
    const previousSelectedId = selectedConfig[previousOption.id];

    if (!previousSelectedId) return [];

    return ownValues.filter((value) => {
      const links = dependencies.filter((dep) => dep.value_id === value.id);
      return links.length === 0 || links.some((dep) => dep.parent_value_id === previousSelectedId);
    });
  }

  function handleConfigChange(optionIndex: number, optionId: string, valueId: string) {
    setSelectedConfig((current) => {
      const next = { ...current, [optionId]: valueId };

      for (let i = optionIndex + 1; i < productOptions.length; i++) {
        delete next[productOptions[i].id];
      }

      return next;
    });
  }

  async function loadOrders() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_mobile,
        product_name,
        quantity,
        order_source,
        current_stage,
        priority,
        order_date,
        due_date,
        customer_note,
        admin_note,
        created_at,
        completed_at,
        product_configuration
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Order Load Error: ${error.message}`);
      return;
    }

    setOrders((data || []) as Order[]);
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

      const { data: adminProfile, error: adminError } =
        await supabase
          .from("employees")
          .select("id, role, approval_status, is_active")
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

      await Promise.all([loadOrders(), loadProductMaster()]);

      setLoading(false);
    }

    loadPage();
  }, [router]);

  useEffect(() => {
    loadProductConfiguration(selectedProductId);
  }, [selectedProductId]);

  async function handleCreateOrder() {
    if (!orderNumber.trim()) {
      setMessage("Order Number જરૂરી છે.");
      return;
    }

    if (!customerName.trim()) {
      setMessage("Customer Name જરૂરી છે.");
      return;
    }

    const selectedProduct = products.find(
      (product) => product.id === selectedProductId
    );

    if (!selectedProduct) {
      setMessage("Product select કરો.");
      return;
    }

    for (const option of productOptions) {
      if (option.is_required && !selectedConfig[option.id]) {
        setMessage(`${option.name} select કરવું જરૂરી છે.`);
        return;
      }
    }

    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    const qty = Number(quantity);

    if (!Number.isInteger(qty) || qty <= 0) {
      setMessage("Quantity સાચી નાખો.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const configurationSnapshot: Record<string, string> = {};

    for (const option of productOptions) {
      const selectedValueId = selectedConfig[option.id];
      if (!selectedValueId) continue;

      const selectedValue = optionValues.find(
        (value) => value.id === selectedValueId
      );

      if (selectedValue) {
        configurationSnapshot[option.name] = selectedValue.value;
      }
    }

    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber.trim(),
        customer_name: customerName.trim(),
        customer_mobile: customerMobile.trim() || null,
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        product_configuration: configurationSnapshot,
        quantity: qty,
        order_source: orderSource,
        current_stage: "design",
        priority,
        due_date: dueDate || null,
        customer_note: customerNote.trim() || null,
        admin_note: adminNote.trim() || null,
        created_by: adminId,
      })
      .select("id")
      .single();

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ Order Number પહેલેથી છે."
          : `Order Create Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    if (newOrder) {
      const { error: configError } = await supabase
        .from("order_product_configurations")
        .insert({
          order_id: newOrder.id,
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          configuration: configurationSnapshot,
        });

      if (configError) {
        setMessage(`Order create થયો, પણ Configuration Error: ${configError.message}`);
      }

      await supabase.from("order_stage_history").insert({
        order_id: newOrder.id,
        from_stage: null,
        to_stage: "design",
        changed_by: adminId,
        note: "Order Created",
      });
    }

    setOrderNumber("");
    setCustomerName("");
    setCustomerMobile("");
    setSelectedProductId("");
    setSelectedConfig({});
    setProductOptions([]);
    setOptionValues([]);
    setDependencies([]);
    setQuantity("1");
    setOrderSource("other");
    setPriority("normal");
    setDueDate("");
    setCustomerNote("");
    setAdminNote("");

    setMessage("Order સફળતાપૂર્વક create થયો ✅");

    await loadOrders();

    setSaving(false);
  }

  async function handleForceStageChange(
    order: Order,
    newStage: Order["current_stage"]
  ) {
    if (!adminId) return;

    if (newStage === order.current_stage) {
      return;
    }

    const supabase = createClient();

    const updateData: {
      current_stage: Order["current_stage"];
      updated_at: string;
      completed_at?: string | null;
    } = {
      current_stage: newStage,
      updated_at: new Date().toISOString(),
    };

    if (newStage === "completed") {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order.id);

    if (error) {
      setMessage(`Stage Update Error: ${error.message}`);
      return;
    }

    const { error: historyError } = await supabase
      .from("order_stage_history")
      .insert({
        order_id: order.id,
        from_stage: order.current_stage,
        to_stage: newStage,
        changed_by: adminId,
        note: "Admin Force Change",
      });

    if (historyError) {
      setMessage(
        `Order update થયો, પણ History Error: ${historyError.message}`
      );
    } else {
      setMessage("Order stage force change થયો ✅");
    }

    await loadOrders();
  }

  async function handleNextStage(order: Order) {
    if (!adminId) return;

    const nextStage = nextStageMap[order.current_stage];

    if (!nextStage) {
      setMessage(
        order.current_stage === "completed"
          ? "આ Order પહેલેથી Completed છે."
          : order.current_stage === "cancelled"
          ? "Cancelled Order માટે Next Stage નથી."
          : "Next Stage configured નથી."
      );
      return;
    }

    const supabase = createClient();

    const updateData: {
      current_stage: Order["current_stage"];
      updated_at: string;
      completed_at?: string | null;
    } = {
      current_stage: nextStage,
      updated_at: new Date().toISOString(),
    };

    if (nextStage === "completed") {
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order.id)
      .eq("current_stage", order.current_stage);

    if (error) {
      setMessage(`Next Stage Error: ${error.message}`);
      return;
    }

    const { error: historyError } = await supabase
      .from("order_stage_history")
      .insert({
        order_id: order.id,
        from_stage: order.current_stage,
        to_stage: nextStage,
        changed_by: adminId,
        note: "Admin Next Stage",
      });

    if (historyError) {
      setMessage(
        `Order આગળ ગયો, પણ History Error: ${historyError.message}`
      );
    } else {
      setMessage(
        `${order.order_number} → ${formatStage(nextStage)} મોકલાયો ✅`
      );
    }

    await loadOrders();
  }

  function getStageStyle(stage: string) {
    if (stage === "completed")
      return "bg-green-100 text-green-700";

    if (stage === "cancelled")
      return "bg-red-100 text-red-700";

    if (stage === "transportation_dispatch")
      return "bg-purple-100 text-purple-700";

    if (stage === "packing")
      return "bg-amber-100 text-amber-700";

    return "bg-blue-100 text-blue-700";
  }

  function getPriorityStyle(priority: string) {
    if (priority === "urgent")
      return "bg-red-100 text-red-700";

    if (priority === "high")
      return "bg-orange-100 text-orange-700";

    if (priority === "low")
      return "bg-slate-100 text-slate-600";

    return "bg-blue-100 text-blue-700";
  }

  function formatStage(stage: string) {
    return stage
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const stageMatch =
        filterStage === "all" ||
        order.current_stage === filterStage;

      const priorityMatch =
        filterPriority === "all" ||
        order.priority === filterPriority;

      return stageMatch && priorityMatch;
    });
  }, [orders, filterStage, filterPriority]);

  const openCount = orders.filter(
    (order) =>
      order.current_stage !== "completed" &&
      order.current_stage !== "cancelled"
  ).length;

  const urgentCount = orders.filter(
    (order) =>
      order.priority === "urgent" &&
      order.current_stage !== "completed" &&
      order.current_stage !== "cancelled"
  ).length;

  const transportationCount =
orders.filter(
(order)=>order.current_stage==="transportation_dispatch"
).length;

  const completedCount = orders.filter(
    (order) => order.current_stage === "completed"
  ).length;

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Order Management લોડ થઈ રહ્યું છે...
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
              Orders & Production Workflow
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
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
              Open Orders
            </p>
            <p className="text-3xl font-black mt-2 text-blue-600">
              {openCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Urgent Open
            </p>
            <p className="text-3xl font-black mt-2 text-red-600">
              {urgentCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Transportation
            </p>
            <p className="text-3xl font-black mt-2 text-purple-600">
              {transportationCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Completed
            </p>
            <p className="text-3xl font-black mt-2 text-green-600">
              {completedCount}
            </p>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-xl font-black text-slate-900">
            Create New Order
          </h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Order Number
              </label>

              <input
                type="text"
                value={orderNumber}
                onChange={(e) =>
                  setOrderNumber(e.target.value)
                }
                placeholder="Example: YL-1001"
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Customer Name
              </label>

              <input
                type="text"
                value={customerName}
                onChange={(e) =>
                  setCustomerName(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Customer Mobile
              </label>

              <input
                type="text"
                value={customerMobile}
                onChange={(e) =>
                  setCustomerMobile(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Product
              </label>

              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-4 py-3"
              >
                <option value="">Select Product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </div>

            {productOptions.map((option, optionIndex) => {
              const availableValues = availableValuesForOption(option, optionIndex);
              const previousOption = optionIndex > 0 ? productOptions[optionIndex - 1] : null;
              const disabled = !!previousOption && !selectedConfig[previousOption.id];

              return (
                <div key={option.id}>
                  <label className="block text-sm font-bold text-slate-600 mb-2">
                    {option.name}{option.is_required ? " *" : ""}
                  </label>

                  <select
                    value={selectedConfig[option.id] || ""}
                    disabled={disabled}
                    onChange={(e) =>
                      handleConfigChange(optionIndex, option.id, e.target.value)
                    }
                    className="w-full bg-white text-slate-900 border border-slate-300 rounded-xl px-4 py-3 disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">
                      {disabled ? "Select previous option first" : `Select ${option.name}`}
                    </option>

                    {availableValues.map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.value}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Quantity
              </label>

              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) =>
                  setQuantity(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Order Source
              </label>

              <select
                value={orderSource}
                onChange={(e) =>
                  setOrderSource(
                    e.target.value as Order["order_source"]
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
              >
                <option value="amazon">Amazon</option>
                <option value="flipkart">Flipkart</option>
                <option value="website">Website</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="offline">Offline</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Priority
              </label>

              <select
                value={priority}
                onChange={(e) =>
                  setPriority(
                    e.target.value as Order["priority"]
                  )
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Due Date
              </label>

              <input
                type="date"
                value={dueDate}
                onChange={(e) =>
                  setDueDate(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Customer Note
              </label>

              <textarea
                rows={2}
                value={customerNote}
                onChange={(e) =>
                  setCustomerNote(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 resize-none"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Admin Note
              </label>

              <textarea
                rows={2}
                value={adminNote}
                onChange={(e) =>
                  setAdminNote(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 resize-none"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-3">
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Order"}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl mt-5 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <h2 className="text-xl font-black text-slate-900">
                All Orders
              </h2>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={filterStage}
                  onChange={(e) =>
                    setFilterStage(e.target.value)
                  }
                  className="border border-slate-300 rounded-xl px-4 py-2 bg-white"
                >
                  <option value="all">All Stages</option>

                  {stages.map((stage) => (
                    <option key={stage} value={stage}>
                      {formatStage(stage)}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) =>
                    setFilterPriority(e.target.value)
                  }
                  className="border border-slate-300 rounded-xl px-4 py-2 bg-white"
                >
                  <option value="all">All Priority</option>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1250px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Order
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Customer
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Product
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Qty
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Source
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Priority
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Due Date
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Stage
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Action
                  </th>
                 
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-5 py-4 font-black text-slate-900">
                      {order.order_number}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-semibold">
                        {order.customer_name}
                      </p>

                      <p className="text-xs text-slate-400 mt-1">
                        {order.customer_mobile || "-"}
                      </p>
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-black text-slate-900">{order.product_name}</p>
                      {order.product_configuration &&
                        Object.keys(order.product_configuration).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(order.product_configuration).map(
                              ([key, value]) => (
                                <p key={key} className="text-xs text-slate-600">
                                  <span className="font-bold">{key}:</span> {value}
                                </p>
                              )
                            )}
                          </div>
                        )}
                    </td>

                    <td className="px-5 py-4">
                      {order.quantity}
                    </td>

                    <td className="px-5 py-4 capitalize">
                      {order.order_source}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${getPriorityStyle(
                          order.priority
                        )}`}
                      >
                        {order.priority.toUpperCase()}
                      </span>
                    </td>

                    <td className="px-5 py-4 font-semibold">
                      {order.due_date || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-bold ${getStageStyle(
                          order.current_stage
                        )}`}
                      >
                        {formatStage(order.current_stage)}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2 min-w-[190px]">
                        {nextStageMap[order.current_stage] ? (
                          <button
                            type="button"
                            onClick={() => handleNextStage(order)}
                            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold"
                          >
                            Next →{" "}
                            {formatStage(
                              nextStageMap[
                                order.current_stage
                              ] as Order["current_stage"]
                            )}
                          </button>
                        ) : (
                          <div className="bg-slate-100 text-slate-500 px-3 py-2 rounded-lg text-sm font-bold text-center">
                            {order.current_stage === "completed"
                              ? "Completed"
                              : "No Next Stage"}
                          </div>
                        )}

                        <select
                          value={order.current_stage}
                          onChange={(e) =>
                            handleForceStageChange(
                              order,
                              e.target
                                .value as Order["current_stage"]
                            )
                          }
                          className="border border-amber-300 bg-amber-50 rounded-lg px-3 py-2 text-sm font-semibold text-amber-800"
                          title="Emergency / correction માટે Force Change"
                        >
                          {stages.map((stage) => (
                            <option
                              key={stage}
                              value={stage}
                            >
                              Force: {formatStage(stage)}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/admin/orders/${order.id}`
                            )
                          }
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-bold"
                        >
                          View History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      કોઈ Order મળ્યો નથી.
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