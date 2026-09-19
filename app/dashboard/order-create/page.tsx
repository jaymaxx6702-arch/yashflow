"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Product = { id: string; name: string };
type ProductOption = { id: string; product_id: string; name: string; sort_order: number; is_required: boolean; is_active: boolean };
type OptionValue = { id: string; product_option_id: string; value: string; parent_value_id: string | null; sort_order: number; is_active: boolean };
type Dependency = { id: string; value_id: string; parent_value_id: string };

export default function OrderCreatePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [values, setValues] = useState<OptionValue[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [productId, setProductId] = useState("");
  const [selectedConfig, setSelectedConfig] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState("1");
  const [orderSource, setOrderSource] = useState("other");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [adminNote, setAdminNote] = useState("");

  async function sessionToken() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || "";
  }

  useEffect(() => {
    async function load() {
      const token = await sessionToken();
      if (!token) {
        router.replace("/");
        return;
      }

      const response = await fetch("/api/orders/create", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Order Create access નથી.");
        setLoading(false);
        return;
      }

      setProducts(data.products || []);
      setOptions(data.options || []);
      setValues(data.values || []);
      setDependencies(data.dependencies || []);
      setLoading(false);
    }
    void load();
  }, [router]);

  const productOptions = useMemo(
    () => options.filter((option) => option.product_id === productId).sort((a, b) => a.sort_order - b.sort_order),
    [options, productId]
  );

  function availableValues(option: ProductOption, index: number) {
    const own = values.filter((value) => value.product_option_id === option.id);
    if (index === 0) return own;

    const previous = productOptions[index - 1];
    const parentId = selectedConfig[previous.id];
    if (!parentId) return [];

    return own.filter((value) => {
      const links = dependencies.filter((item) => item.value_id === value.id);
      return links.length === 0 || links.some((item) => item.parent_value_id === parentId);
    });
  }

  function changeConfig(index: number, optionId: string, valueId: string) {
    setSelectedConfig((current) => {
      const next = { ...current, [optionId]: valueId };
      for (let i = index + 1; i < productOptions.length; i++) delete next[productOptions[i].id];
      return next;
    });
  }

  async function createOrder() {
    setSaving(true);
    setMessage("");

    const token = await sessionToken();
    const response = await fetch("/api/orders/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        customerName,
        customerMobile,
        productId,
        selectedConfig,
        quantity: Number(quantity),
        orderSource,
        priority,
        dueDate,
        customerNote,
        adminNote,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Order create failed.");
      setSaving(false);
      return;
    }

    setMessage(`${data.orderNumber} create થયો → ${data.stage} ✅`);
    setCustomerName("");
    setCustomerMobile("");
    setProductId("");
    setSelectedConfig({});
    setQuantity("1");
    setOrderSource("other");
    setPriority("normal");
    setDueDate("");
    setCustomerNote("");
    setAdminNote("");
    setSaving(false);
  }

  if (loading) {
    return <main className="yf-page flex items-center justify-center"><div className="yf-card p-6 font-bold">Order Create લોડ થઈ રહ્યું છે...</div></main>;
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">ORDER ACCESS</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Create Order</h1>
            <p className="text-sm text-blue-100 mt-1">Permission-based new order entry</p>
          </div>
          <button type="button" onClick={() => router.push("/dashboard")} className="yf-btn bg-white text-blue-700">← Dashboard</button>
        </div>
      </header>

      <div className="yf-container max-w-4xl">
        {message && <div className="yf-alert yf-alert-info mb-4">{message}</div>}

        <section className="yf-card p-5">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-black text-slate-700">Customer Name *</span>
              <input className="yf-input mt-2" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm font-black text-slate-700">Mobile</span>
              <input className="yf-input mt-2" value={customerMobile} onChange={(e) => setCustomerMobile(e.target.value)} />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-black text-slate-700">Product *</span>
              <select className="yf-input mt-2" value={productId} onChange={(e) => { setProductId(e.target.value); setSelectedConfig({}); }}>
                <option value="">Product પસંદ કરો</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>

            {productOptions.map((option, index) => (
              <label key={option.id} className="block">
                <span className="text-sm font-black text-slate-700">{option.name}{option.is_required ? " *" : ""}</span>
                <select
                  className="yf-input mt-2"
                  value={selectedConfig[option.id] || ""}
                  onChange={(e) => changeConfig(index, option.id, e.target.value)}
                >
                  <option value="">Select</option>
                  {availableValues(option, index).map((value) => (
                    <option key={value.id} value={value.id}>{value.value}</option>
                  ))}
                </select>
              </label>
            ))}

            <label className="block">
              <span className="text-sm font-black text-slate-700">Quantity *</span>
              <input type="number" min="1" className="yf-input mt-2" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>

            <label className="block">
              <span className="text-sm font-black text-slate-700">Source</span>
              <select className="yf-input mt-2" value={orderSource} onChange={(e) => setOrderSource(e.target.value)}>
                <option value="other">Other</option><option value="offline">Offline</option><option value="whatsapp">WhatsApp</option><option value="website">Website</option><option value="amazon">Amazon</option><option value="flipkart">Flipkart</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-black text-slate-700">Priority</span>
              <select className="yf-input mt-2" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-black text-slate-700">Due Date</span>
              <input type="date" className="yf-input mt-2" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-black text-slate-700">Customer Note</span>
              <textarea rows={3} className="yf-input mt-2" value={customerNote} onChange={(e) => setCustomerNote(e.target.value)} />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-black text-slate-700">Internal / Admin Note</span>
              <textarea rows={3} className="yf-input mt-2" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void createOrder()}
            disabled={saving}
            className="yf-btn yf-btn-primary mt-5 w-full sm:w-auto disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Order"}
          </button>
        </section>
      </div>
    </main>
  );
}
