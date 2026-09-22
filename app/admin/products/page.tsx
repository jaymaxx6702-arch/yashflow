"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import YashFlowIcon from "@/components/YashFlowIcon";

type Product = {
  id: string;
  name: string;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
};

type ProductOption = {
  id: string;
  product_id: string;
  name: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
};

type OptionValue = {
  id: string;
  product_option_id: string;
  value: string;
  parent_value_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type ValueDependency = {
  id: string;
  value_id: string;
  parent_value_id: string;
};

export default function AdminProductsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [values, setValues] = useState<OptionValue[]>([]);
  const [dependencies, setDependencies] = useState<ValueDependency[]>([]);

  const [selectedProductId, setSelectedProductId] = useState("");

  const [productName, setProductName] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");

  const [newOptionName, setNewOptionName] = useState("");
  const [newOptionRequired, setNewOptionRequired] = useState(false);

  const [valueInputs, setValueInputs] = useState<Record<string, string>>({});
  const [bulkValueInputs, setBulkValueInputs] = useState<Record<string, string>>({});
  const [selectedParents, setSelectedParents] = useState<
    Record<string, string[]>
  >({});
const [editingValueId, setEditingValueId] = useState<string | null>(null);

const [editParents, setEditParents] = useState<string[]>([]);

  const [message, setMessage] = useState("");

  async function loadProducts() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setMessage(`Product Load Error: ${error.message}`);
      return;
    }

    const rows = (data || []) as Product[];
    setProducts(rows);

    if (!selectedProductId && rows.length > 0) {
      setSelectedProductId(rows[0].id);
    }
  }

  async function loadProductConfiguration(productId: string) {
    if (!productId) {
      setOptions([]);
      setValues([]);
      setDependencies([]);
      return;
    }

    const supabase = createClient();

    const { data: optionData, error: optionError } = await supabase
      .from("product_options")
      .select("*")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (optionError) {
      setMessage(`Option Load Error: ${optionError.message}`);
      return;
    }

    const loadedOptions = (optionData || []) as ProductOption[];
    setOptions(loadedOptions);

    if (loadedOptions.length === 0) {
      setValues([]);
      setDependencies([]);
      return;
    }

    const optionIds = loadedOptions.map((option) => option.id);

    const { data: valueData, error: valueError } = await supabase
      .from("product_option_values")
      .select("*")
      .in("product_option_id", optionIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (valueError) {
      setMessage(`Value Load Error: ${valueError.message}`);
      return;
    }

    const loadedValues = (valueData || []) as OptionValue[];
    setValues(loadedValues);

    if (loadedValues.length === 0) {
      setDependencies([]);
      return;
    }

    const valueIds = loadedValues.map((item) => item.id);

    const { data: dependencyData, error: dependencyError } = await supabase
      .from("product_value_dependencies")
      .select("*")
      .in("value_id", valueIds);

    if (dependencyError) {
      setMessage(`Dependency Load Error: ${dependencyError.message}`);
      return;
    }

    setDependencies((dependencyData || []) as ValueDependency[]);
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

      const { data: adminProfile, error: adminError } = await supabase
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

      await loadProducts();
      setLoading(false);
    }

    loadPage();
  }, [router]);

  useEffect(() => {
    if (selectedProductId) {
      loadProductConfiguration(selectedProductId);
    }
  }, [selectedProductId]);

  const selectedProduct = useMemo(
    () =>
      products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  function valuesForOption(optionId: string) {
    return values.filter((item) => item.product_option_id === optionId);
  }
function getParentDisplayLabel(parent: OptionValue) {
  const parentOption = options.find(
    (option) => option.id === parent.product_option_id
  );

  if (!parentOption) return parent.value;

  const parentLinks = dependencies.filter(
    (dependency) => dependency.value_id === parent.id
  );

  const grandParents = values.filter((value) =>
    parentLinks.some(
      (dependency) => dependency.parent_value_id === value.id
    )
  );

  if (grandParents.length === 0) {
    return parent.value;
  }

  return `${grandParents.map((item) => item.value).join(" / ")} → ${
    parent.value
  }`;
}
  function parentValuesForValue(valueId: string) {
    const parentIds = dependencies
      .filter((item) => item.value_id === valueId)
      .map((item) => item.parent_value_id);

    return values.filter((item) => parentIds.includes(item.id));
  }

  function toggleParent(optionId: string, parentValueId: string) {
    setSelectedParents((current) => {
      const existing = current[optionId] || [];

      if (existing.includes(parentValueId)) {
        return {
          ...current,
          [optionId]: existing.filter((id) => id !== parentValueId),
        };
      }

      return {
        ...current,
        [optionId]: [...existing, parentValueId],
      };
    });
  }

  async function handleAddProduct() {
    const name = productName.trim();

    if (!name) {
      setMessage("Product Name જરૂરી છે.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        image_url: productImageUrl.trim() || null,
      })
      .select("*")
      .single();

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ Product પહેલેથી Product Masterમાં છે."
          : `Product Add Error: ${error.message}`
      );
      setSaving(false);
      return;
    }

    setProductName("");
    setProductImageUrl("");

    await loadProducts();

    if (data) {
      setSelectedProductId(data.id);
    }

    setMessage(`${name} Product Masterમાં add થયો ✅`);
    setSaving(false);
  }

  async function handleToggleProduct(product: Product) {
    const supabase = createClient();

    const { error } = await supabase
      .from("products")
      .update({
        is_active: !product.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", product.id);

    if (error) {
      setMessage(`Product Update Error: ${error.message}`);
      return;
    }

    await loadProducts();

    setMessage(
      product.is_active
        ? `${product.name} inactive થયો.`
        : `${product.name} active થયો ✅`
    );
  }

  async function handleAddOption() {
    if (!selectedProductId) {
      setMessage("પહેલા Product select કરો.");
      return;
    }

    const name = newOptionName.trim();

    if (!name) {
      setMessage("Option Name જરૂરી છે.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const nextSortOrder =
      options.length > 0
        ? Math.max(...options.map((item) => item.sort_order)) + 1
        : 1;

    const { error } = await supabase.from("product_options").insert({
      product_id: selectedProductId,
      name,
      sort_order: nextSortOrder,
      is_required: newOptionRequired,
    });

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ Option પહેલેથી છે."
          : `Option Add Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    setNewOptionName("");
    setNewOptionRequired(false);

    await loadProductConfiguration(selectedProductId);

    setMessage(`${name} option add થયો ✅`);
    setSaving(false);
  }

  async function handleAddValue(
    option: ProductOption,
    previousOption: ProductOption | null
  ) {
    const value = (valueInputs[option.id] || "").trim();

    if (!value) {
      setMessage(`${option.name} માટે value લખો.`);
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const currentValues = valuesForOption(option.id);

    const nextSortOrder =
      currentValues.length > 0
        ? Math.max(...currentValues.map((item) => item.sort_order)) + 1
        : 1;

    const selectedParentIds = selectedParents[option.id] || [];

    const { data: newValue, error } = await supabase
      .from("product_option_values")
      .insert({
        product_option_id: option.id,
        value,
        parent_value_id:
          selectedParentIds.length === 1 ? selectedParentIds[0] : null,
        sort_order: nextSortOrder,
      })
      .select("id")
      .single();

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ Value પહેલેથી છે."
          : `Value Add Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    if (
      newValue &&
      previousOption &&
      selectedParentIds.length > 0
    ) {
      const dependencyRows = selectedParentIds.map((parentId) => ({
        value_id: newValue.id,
        parent_value_id: parentId,
      }));

      const { error: dependencyError } = await supabase
        .from("product_value_dependencies")
        .insert(dependencyRows);

      if (dependencyError) {
        setMessage(
          `Value add થયું, પણ Dependency Error: ${dependencyError.message}`
        );

        setSaving(false);
        await loadProductConfiguration(selectedProductId);
        return;
      }
    }

    setValueInputs((current) => ({
      ...current,
      [option.id]: "",
    }));

    setSelectedParents((current) => ({
      ...current,
      [option.id]: [],
    }));

    await loadProductConfiguration(selectedProductId);

    setMessage(`${value} add થયું ✅`);
    setSaving(false);
  }

  async function handleBulkAddValues(
    option: ProductOption,
    previousOption: ProductOption | null
  ) {
    const raw = bulkValueInputs[option.id] || "";

    const bulkValues = Array.from(
      new Set(
        raw
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );

    if (bulkValues.length === 0) {
      setMessage(`${option.name} માટે ઓછામાં ઓછી એક value લખો.`);
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const selectedParentIds = selectedParents[option.id] || [];
    const currentValues = valuesForOption(option.id);

    let nextSortOrder =
      currentValues.length > 0
        ? Math.max(...currentValues.map((item) => item.sort_order)) + 1
        : 1;

    let addedCount = 0;
    const skipped: string[] = [];

    for (const value of bulkValues) {
      const { data: newValue, error } = await supabase
        .from("product_option_values")
        .insert({
          product_option_id: option.id,
          value,
          parent_value_id:
            selectedParentIds.length === 1 ? selectedParentIds[0] : null,
          sort_order: nextSortOrder,
        })
        .select("id")
        .single();

      if (error) {
        if (error.code === "23505") {
          skipped.push(value);
          continue;
        }

        setMessage(`Bulk Add Error (${value}): ${error.message}`);
        setSaving(false);
        await loadProductConfiguration(selectedProductId);
        return;
      }

      if (newValue && previousOption && selectedParentIds.length > 0) {
        const dependencyRows = selectedParentIds.map((parentId) => ({
          value_id: newValue.id,
          parent_value_id: parentId,
        }));

        const { error: dependencyError } = await supabase
          .from("product_value_dependencies")
          .insert(dependencyRows);

        if (dependencyError) {
          setMessage(
            `${value} add થયું, પણ Dependency Error: ${dependencyError.message}`
          );
          setSaving(false);
          await loadProductConfiguration(selectedProductId);
          return;
        }
      }

      addedCount += 1;
      nextSortOrder += 1;
    }

    setBulkValueInputs((current) => ({
      ...current,
      [option.id]: "",
    }));

    setSelectedParents((current) => ({
      ...current,
      [option.id]: [],
    }));

    await loadProductConfiguration(selectedProductId);

    setMessage(
      `${addedCount} values bulk add થઈ ✅${
        skipped.length ? ` | ${skipped.length} duplicate skip થઈ.` : ""
      }`
    );
    setSaving(false);
  }

  async function handleToggleOption(option: ProductOption) {
    const supabase = createClient();

    const { error } = await supabase
      .from("product_options")
      .update({
        is_active: !option.is_active,
      })
      .eq("id", option.id);

    if (error) {
      setMessage(`Option Update Error: ${error.message}`);
      return;
    }

    await loadProductConfiguration(selectedProductId);
    setMessage("Option status update થયો ✅");
  }
function startEditValue(item: OptionValue) {
  const currentParents = dependencies
    .filter((dependency) => dependency.value_id === item.id)
    .map((dependency) => dependency.parent_value_id);

  setEditingValueId(item.id);
  setEditParents(currentParents);
  setMessage("");
}

function toggleEditParent(parentId: string) {
  setEditParents((current) =>
    current.includes(parentId)
      ? current.filter((id) => id !== parentId)
      : [...current, parentId]
  );
}

async function saveValueDependencies(item: OptionValue) {
  setSaving(true);
  setMessage("");

  const supabase = createClient();

  const { error: deleteError } = await supabase
    .from("product_value_dependencies")
    .delete()
    .eq("value_id", item.id);

  if (deleteError) {
    setMessage(`Dependency Delete Error: ${deleteError.message}`);
    setSaving(false);
    return;
  }

  if (editParents.length > 0) {
    const rows = editParents.map((parentId) => ({
      value_id: item.id,
      parent_value_id: parentId,
    }));

    const { error: insertError } = await supabase
      .from("product_value_dependencies")
      .insert(rows);

    if (insertError) {
      setMessage(`Dependency Save Error: ${insertError.message}`);
      setSaving(false);
      return;
    }
  }

  // Legacy parent fieldને પણ synchronized રાખીએ.
  const { error: valueError } = await supabase
    .from("product_option_values")
    .update({
      parent_value_id:
        editParents.length === 1 ? editParents[0] : null,
    })
    .eq("id", item.id);

  if (valueError) {
    setMessage(`Value Update Error: ${valueError.message}`);
    setSaving(false);
    return;
  }

  setEditingValueId(null);
  setEditParents([]);

  await loadProductConfiguration(selectedProductId);

  setMessage(`${item.value} applicability update થઈ ✅`);
  setSaving(false);
}
  async function handleToggleValue(item: OptionValue) {
    const supabase = createClient();

    const { error } = await supabase
      .from("product_option_values")
      .update({
        is_active: !item.is_active,
      })
      .eq("id", item.id);

    if (error) {
      setMessage(`Value Update Error: ${error.message}`);
      return;
    }

    await loadProductConfiguration(selectedProductId);
    setMessage("Value status update થયો ✅");
  }

  async function handleDeleteValue(item: OptionValue) {
    const confirmed = window.confirm(
      `"${item.value}" permanently DELETE કરવું છે?\n\nઆ action undo થઈ શકશે નહીં.`
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    // Legacy parent_value_id references clear કરીએ જેથી FK block ન કરે.
    const { error: legacyReferenceError } = await supabase
      .from("product_option_values")
      .update({ parent_value_id: null })
      .eq("parent_value_id", item.id);

    if (legacyReferenceError) {
      setMessage(
        `Delete પહેલાં reference cleanup error: ${legacyReferenceError.message}`
      );
      setSaving(false);
      return;
    }

    // Dependency tableમાં બંને directions cleanup.
    const { error: childDependencyError } = await supabase
      .from("product_value_dependencies")
      .delete()
      .eq("parent_value_id", item.id);

    if (childDependencyError) {
      setMessage(`Dependency Cleanup Error: ${childDependencyError.message}`);
      setSaving(false);
      return;
    }

    const { error: ownDependencyError } = await supabase
      .from("product_value_dependencies")
      .delete()
      .eq("value_id", item.id);

    if (ownDependencyError) {
      setMessage(`Dependency Cleanup Error: ${ownDependencyError.message}`);
      setSaving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("product_option_values")
      .delete()
      .eq("id", item.id);

    if (deleteError) {
      setMessage(`Value Delete Error: ${deleteError.message}`);
      setSaving(false);
      return;
    }

    if (editingValueId === item.id) {
      setEditingValueId(null);
      setEditParents([]);
    }

    await loadProductConfiguration(selectedProductId);

    setMessage(`${item.value} permanently delete થયું ✅`);
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-bold text-slate-600">
          Product Master લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">Product Master</h1>
            <p className="text-slate-300 text-sm mt-1">
              Products & Dynamic Order Options
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-5">
            {message}
          </div>
        )}

        <section className="yf-card p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black">Add Product</h2>
              <p className="text-sm text-slate-600 mt-1">
                Product image optional છે.
              </p>
            </div>

            <div className="yf-badge yf-badge-blue">
              {products.length} Products
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mt-5">
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2">
                Product Name *
              </label>

              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Example: ID CARD"
                className="yf-input"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-black text-slate-700 mb-2">
                Product Image URL — Optional
              </label>

              <input
                value={productImageUrl}
                onChange={(e) => setProductImageUrl(e.target.value)}
                placeholder="Image URL"
                className="yf-input"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddProduct}
            disabled={saving}
            className="yf-btn yf-btn-primary mt-4 px-6 disabled:opacity-50"
          >
            + Add Product
          </button>
        </section>

        <section className="grid lg:grid-cols-[320px_1fr] gap-5 mt-5">
          <aside className="yf-card p-4 h-fit">
            <h2 className="text-lg font-black px-2 py-2">
              Products
            </h2>

            <div className="space-y-2 mt-2">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setSelectedProductId(product.id)}
                  className={`w-full text-left rounded-2xl border p-3 ${
                    product.id === selectedProductId
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-14 h-14 rounded-xl object-cover border"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center">
                        <YashFlowIcon name="products" size={26} />
                      </div>
                    )}

                    <div>
                      <p className="font-black">{product.name}</p>
                      <p
                        className={`text-xs font-bold mt-1 ${
                          product.is_active
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {product.is_active ? "ACTIVE" : "INACTIVE"}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div>
            {selectedProduct && (
              <>
                <section className="yf-card p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <p className="text-xs text-blue-600 font-black">
                        SELECTED PRODUCT
                      </p>
                      <h2 className="text-2xl font-black mt-1">
                        {selectedProduct.name}
                      </h2>
                    </div>

                    <button
                      onClick={() => handleToggleProduct(selectedProduct)}
                      className="yf-btn yf-btn-secondary"
                    >
                      {selectedProduct.is_active
                        ? "Deactivate Product"
                        : "Activate Product"}
                    </button>
                  </div>
                </section>

                <section className="yf-card p-4 sm:p-5 mt-5">
                  <h2 className="text-xl font-black">
                    Add Configuration Field
                  </h2>

                  <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 mt-5 items-end">
                    <input
                      value={newOptionName}
                      onChange={(e) => setNewOptionName(e.target.value)}
                      placeholder="Category / Sub Category / Pattern..."
                      className="yf-input"
                    />

                    <label className="flex items-center gap-2 border rounded-xl px-4 py-3 font-bold">
                      <input
                        type="checkbox"
                        checked={newOptionRequired}
                        onChange={(e) =>
                          setNewOptionRequired(e.target.checked)
                        }
                      />
                      Required
                    </label>

                    <button
                      onClick={handleAddOption}
                      disabled={saving}
                      className="yf-btn bg-slate-900 text-white"
                    >
                      + Add Field
                    </button>
                  </div>
                </section>

                <div className="space-y-5 mt-5">
                  {options.map((option, optionIndex) => {
                    const optionValues = valuesForOption(option.id);

                    const previousOption =
                      optionIndex > 0 ? options[optionIndex - 1] : null;

                    const possibleParents = previousOption
                      ? valuesForOption(previousOption.id)
                      : [];

                    const checkedParents =
                      selectedParents[option.id] || [];

                    return (
                      <section
                        key={option.id}
                        className="yf-card p-4 sm:p-5"
                      >
                        <div className="flex justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black">
                              {optionIndex + 1}
                            </span>

                            <h3 className="text-xl font-black">
                              {option.name}
                            </h3>

                            {option.is_required && (
                              <span className="yf-badge yf-badge-red">
                                REQUIRED
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleToggleOption(option)}
                            className="border rounded-xl px-3 py-2 text-sm font-bold"
                          >
                            {option.is_active
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </div>

                        <div className="mt-5">
                          <label className="block text-sm font-black mb-2">
                            New {option.name}
                          </label>

                          <input
                            value={valueInputs[option.id] || ""}
                            onChange={(e) =>
                              setValueInputs((current) => ({
                                ...current,
                                [option.id]: e.target.value,
                              }))
                            }
                            className="yf-input"
                          />
                        </div>

                        <div className="mt-5 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                          <label className="block text-sm font-black mb-2">
                            Bulk Add {option.name}
                          </label>

                          <p className="text-xs text-slate-500 mb-3">
                            દરેક value નવી lineમાં લખો અથવા paste કરો.
                          </p>

                          <textarea
                            rows={5}
                            value={bulkValueInputs[option.id] || ""}
                            onChange={(e) =>
                              setBulkValueInputs((current) => ({
                                ...current,
                                [option.id]: e.target.value,
                              }))
                            }
                            placeholder={"Red\nBlue\nBlack\nWhite"}
                            className="yf-input resize-y"
                          />
                        </div>

                        {previousOption && (
                          <div className="mt-5">
                            <p className="text-sm font-black mb-2">
                              Applicable To
                            </p>

                            <p className="text-xs text-slate-500 mb-3">
                              કંઈ select ન કરો તો Any{" "}
                              {previousOption.name} ગણાશે.
                            </p>

                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {possibleParents.map((parent) => (
                                <label
                                  key={parent.id}
                                  className={`flex items-center gap-3 border rounded-xl px-3 py-3 cursor-pointer ${
                                    checkedParents.includes(parent.id)
                                      ? "border-blue-500 bg-blue-50"
                                      : "border-slate-200 bg-white"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checkedParents.includes(
                                      parent.id
                                    )}
                                    onChange={() =>
                                      toggleParent(
                                        option.id,
                                        parent.id
                                      )
                                    }
                                  />

                                 <span className="font-bold text-sm">
  {getParentDisplayLabel(parent)}
</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleAddValue(option, previousOption)
                          }
                          disabled={saving}
                          className="yf-btn yf-btn-primary mt-5 disabled:opacity-50"
                        >
                          + Add Value
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleBulkAddValues(option, previousOption)
                          }
                          disabled={
                            saving || !(bulkValueInputs[option.id] || "").trim()
                          }
                          className="yf-btn yf-btn-success mt-3 sm:mt-5 sm:ml-3 disabled:opacity-50"
                        >
                          + Add All Values
                        </button>

                        <div className="mt-6">
                          <p className="text-sm font-black mb-3">
                            Saved Values
                          </p>

                          <div className="space-y-2">
                          {optionValues.map((item) => {
  const linkedParents = parentValuesForValue(item.id);
  const isEditing = editingValueId === item.id;

  return (
    <div
      key={item.id}
      className={`border rounded-2xl p-4 ${
        item.is_active
          ? "bg-green-50 border-green-200"
          : "bg-slate-100 border-slate-300"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p
            className={`font-black ${
              !item.is_active ? "line-through text-slate-500" : ""
            }`}
          >
            {item.value}
          </p>

          {linkedParents.length > 0 ? (
            <p className="text-xs text-slate-600 mt-1">
              Applicable:{" "}
              {linkedParents.map((parent) => parent.value).join(", ")}
            </p>
          ) : previousOption ? (
            <p className="text-xs text-slate-500 mt-1">
              Applicable: Any {previousOption.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {previousOption && (
            <button
              type="button"
              onClick={() => startEditValue(item)}
              className="yf-btn yf-btn-primary yf-btn-sm"
            >
              Edit Applicable To
            </button>
          )}

          <button
            type="button"
            onClick={() => handleToggleValue(item)}
            className={`px-3 py-2 rounded-xl text-xs font-black ${
              item.is_active
                ? "bg-red-50 border border-red-200 text-red-700"
                : "bg-green-600 text-white"
            }`}
          >
            {item.is_active ? "Deactivate" : "Activate"}
          </button>

          <button
            type="button"
            onClick={() => handleDeleteValue(item)}
            disabled={saving}
            className="yf-btn yf-btn-danger yf-btn-sm disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {isEditing && previousOption && (
        <div className="mt-4 bg-white border border-blue-200 rounded-2xl p-4">
          <p className="font-black text-sm">
            Applicable To — {previousOption.name}
          </p>

          <p className="text-xs text-slate-500 mt-1">
            કંઈ select નહીં કરો તો Any {previousOption.name}.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
            {possibleParents.map((parent) => (
              <label
                key={parent.id}
                className={`flex items-center gap-3 border rounded-xl px-3 py-3 cursor-pointer ${
                  editParents.includes(parent.id)
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={editParents.includes(parent.id)}
                  onChange={() => toggleEditParent(parent.id)}
                />

                <span className="font-bold text-sm">
  {getParentDisplayLabel(parent)}
</span>
              </label>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => saveValueDependencies(item)}
              className="yf-btn yf-btn-success yf-btn-sm disabled:opacity-50"
            >
              Save Changes
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingValueId(null);
                setEditParents([]);
              }}
              className="yf-btn yf-btn-secondary yf-btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
})}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}