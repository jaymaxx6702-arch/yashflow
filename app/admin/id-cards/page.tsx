"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type BatchStatus = "draft" | "in_progress" | "ready" | "completed" | "cancelled";
type EntryStatus = "pending" | "ready" | "printed" | "rejected";

type Batch = {
  id: string;
  batch_name: string;
  customer_name: string;
  order_id: string | null;
  status: BatchStatus;
  print_matter: string | null;
  logo_path: string | null;
  note: string | null;
  created_at: string;
};

type Entry = {
  id: string;
  batch_id: string;
  serial_no: number;
  card_number: string | null;
  full_name: string;
  designation: string | null;
  department: string | null;
  mobile: string | null;
  blood_group: string | null;
  custom_text: string | null;
  photo_path: string | null;
  status: EntryStatus;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
};

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function statusClass(status: string) {
  if (status === "completed" || status === "printed") return "bg-green-100 text-green-700";
  if (status === "ready") return "bg-blue-100 text-blue-700";
  if (status === "cancelled" || status === "rejected") return "bg-red-100 text-red-700";
  if (status === "in_progress") return "bg-purple-100 text-purple-700";
  return "bg-amber-100 text-amber-800";
}

function nice(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BulkIdCardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  const [batches, setBatches] = useState<Batch[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");

  const [batchName, setBatchName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderId, setOrderId] = useState("");
  const [printMatter, setPrintMatter] = useState("");
  const [note, setNote] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.id === selectedBatchId) || null,
    [batches, selectedBatchId]
  );

  const batchEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((entry) => entry.batch_id === selectedBatchId)
      .filter((entry) => {
        if (!q) return true;
        return [
          entry.full_name,
          entry.card_number || "",
          entry.designation || "",
          entry.department || "",
          entry.mobile || "",
        ].some((value) => value.toLowerCase().includes(q));
      })
      .sort((a, b) => a.serial_no - b.serial_no);
  }, [entries, selectedBatchId, search]);

  async function loadData() {
    const supabase = createClient();
    const [batchResult, entryResult, orderResult] = await Promise.all([
      supabase
        .from("id_card_batches")
        .select("id, batch_name, customer_name, order_id, status, print_matter, logo_path, note, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("id_card_entries")
        .select("id, batch_id, serial_no, card_number, full_name, designation, department, mobile, blood_group, custom_text, photo_path, status")
        .order("serial_no", { ascending: true }),
      supabase
        .from("orders")
        .select("id, order_number, customer_name, product_name")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const error = batchResult.error || entryResult.error || orderResult.error;
    if (error) {
      setMessage(`ID Card Load Error: ${error.message}`);
      return;
    }

    const batchRows = (batchResult.data || []) as Batch[];
    setBatches(batchRows);
    setEntries((entryResult.data || []) as Entry[]);
    setOrders((orderResult.data || []) as Order[]);

    if (!selectedBatchId && batchRows.length) setSelectedBatchId(batchRows[0].id);
  }

  useEffect(() => {
    async function boot() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
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
        const [viewPermission, managePermission] = await Promise.all([
          supabase.rpc("has_app_permission", { p_permission_key: "idcards.view" }),
          supabase.rpc("has_app_permission", { p_permission_key: "idcards.manage" }),
        ]);

        const error = viewPermission.error || managePermission.error;
        if (error) {
          setMessage(`Permission Error: ${error.message}`);
          setLoading(false);
          return;
        }

        manageAllowed = Boolean(managePermission.data);
        viewAllowed = Boolean(viewPermission.data) || manageAllowed;
      }

      if (!viewAllowed) {
        router.replace("/dashboard");
        return;
      }

      setEmployeeId(profile.id);
      setCanManage(manageAllowed);
      await loadData();
      setLoading(false);
    }

    void boot();
  }, [router]);

  async function createBatch() {
    if (!canManage || !employeeId) return;
    if (!batchName.trim() || !customerName.trim()) {
      setMessage("Batch Name અને Customer Name જરૂરી છે.");
      return;
    }

    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase
      .from("id_card_batches")
      .insert({
        batch_name: batchName.trim(),
        customer_name: customerName.trim(),
        order_id: orderId || null,
        print_matter: printMatter.trim() || null,
        note: note.trim() || null,
        created_by: employeeId,
      })
      .select("id")
      .single();

    if (error || !data) {
      setMessage(`Batch Create Error: ${error?.message || "Create failed"}`);
      setSaving(false);
      return;
    }

    setBatchName("");
    setCustomerName("");
    setOrderId("");
    setPrintMatter("");
    setNote("");
    setSelectedBatchId(data.id);
    setMessage("ID Card Batch Created ✅");
    await loadData();
    setSaving(false);
  }

  async function addBulkEntries() {
    if (!canManage || !selectedBatchId) return;
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      setMessage("Bulk matter paste કરો.");
      return;
    }

    const currentCount = entries.filter((entry) => entry.batch_id === selectedBatchId).length;
    const rows = lines.map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      return {
        batch_id: selectedBatchId,
        serial_no: currentCount + index + 1,
        full_name: parts[0] || `Card ${currentCount + index + 1}`,
        card_number: parts[1] || null,
        designation: parts[2] || null,
        department: parts[3] || null,
        mobile: parts[4] || null,
        blood_group: parts[5] || null,
        custom_text: parts[6] || null,
      };
    });

    setSaving(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.from("id_card_entries").insert(rows);
    if (error) {
      setMessage(`Bulk Insert Error: ${error.message}`);
      setSaving(false);
      return;
    }

    setBulkText("");
    setMessage(`${rows.length} ID Card entries add થયા ✅`);
    await loadData();
    setSaving(false);
  }

  async function updateEntryStatus(entry: Entry, status: EntryStatus) {
    if (!canManage) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("id_card_entries")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", entry.id);
    if (error) {
      setMessage(`Status Error: ${error.message}`);
      return;
    }
    await loadData();
  }

  async function updateBatchStatus(status: BatchStatus) {
    if (!canManage || !selectedBatchId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("id_card_batches")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", selectedBatchId);
    if (error) {
      setMessage(`Batch Status Error: ${error.message}`);
      return;
    }
    setMessage("Batch Status Updated ✅");
    await loadData();
  }

  async function uploadBatchLogo(file: File) {
    if (!canManage || !selectedBatchId) return;
    setUploading("logo");
    setMessage("");
    const supabase = createClient();
    const path = `${selectedBatchId}/logo/${Date.now()}-${cleanFileName(file.name)}`;
    const upload = await supabase.storage.from("id-card-files").upload(path, file, { upsert: true });
    if (upload.error) {
      setMessage(`Logo Upload Error: ${upload.error.message}`);
      setUploading(null);
      return;
    }
    const { error } = await supabase
      .from("id_card_batches")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", selectedBatchId);
    if (error) setMessage(`Logo Save Error: ${error.message}`);
    else setMessage("Batch Logo Uploaded ✅");
    await loadData();
    setUploading(null);
  }

  async function uploadEntryPhoto(entry: Entry, file: File) {
    if (!canManage) return;
    setUploading(entry.id);
    setMessage("");
    const supabase = createClient();
    const path = `${entry.batch_id}/photos/${entry.id}-${Date.now()}-${cleanFileName(file.name)}`;
    const upload = await supabase.storage.from("id-card-files").upload(path, file, { upsert: true });
    if (upload.error) {
      setMessage(`Photo Upload Error: ${upload.error.message}`);
      setUploading(null);
      return;
    }
    const { error } = await supabase
      .from("id_card_entries")
      .update({ photo_path: path, updated_at: new Date().toISOString() })
      .eq("id", entry.id);
    if (error) setMessage(`Photo Save Error: ${error.message}`);
    else setMessage(`${entry.full_name} Photo Uploaded ✅`);
    await loadData();
    setUploading(null);
  }

  async function openStorageFile(path: string | null) {
    if (!path) return;
    const supabase = createClient();
    const { data, error } = await supabase.storage.from("id-card-files").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) {
      setMessage(`File Open Error: ${error?.message || "URL not available"}`);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function exportCsv() {
    if (!selectedBatch) return;
    const rows = entries
      .filter((entry) => entry.batch_id === selectedBatch.id)
      .sort((a, b) => a.serial_no - b.serial_no);
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [
      ["Sr", "Card No", "Name", "Designation", "Department", "Mobile", "Blood Group", "Custom Text", "Status"],
      ...rows.map((row) => [row.serial_no, row.card_number, row.full_name, row.designation, row.department, row.mobile, row.blood_group, row.custom_text, row.status]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedBatch.batch_name.replace(/\s+/g, "-")}-id-cards.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <main className="yf-page flex items-center justify-center"><div className="yf-card p-6 font-bold">Bulk ID Card Module લોડ થઈ રહ્યું છે...</div></main>;
  }

  const allSelectedEntries = entries.filter((entry) => entry.batch_id === selectedBatchId);
  const readyCount = allSelectedEntries.filter((entry) => entry.status === "ready").length;
  const printedCount = allSelectedEntries.filter((entry) => entry.status === "printed").length;

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW ID CARD</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Bulk ID Card Module</h1>
            <p className="text-sm text-blue-100 mt-1">Batch → Bulk Matter → Photo/Logo → Ready → Printed</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">← Admin</button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        {canManage && (
          <section className="yf-card p-5 mb-5">
            <h2 className="yf-section-title">Create New Batch</h2>
            <div className="grid gap-3 md:grid-cols-2 mt-4">
              <input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Batch Name" className="yf-input" />
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer / School / Company" className="yf-input" />
              <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="yf-input">
                <option value="">Link Order (optional)</option>
                {orders.map((order) => <option key={order.id} value={order.id}>{order.order_number} • {order.customer_name} • {order.product_name}</option>)}
              </select>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Batch Note" className="yf-input" />
              <textarea value={printMatter} onChange={(e) => setPrintMatter(e.target.value)} placeholder="Common Print Matter / Instructions" className="yf-input resize-none md:col-span-2" rows={3} />
            </div>
            <button type="button" onClick={() => void createBatch()} disabled={saving} className="yf-btn yf-btn-primary mt-4 disabled:opacity-50">{saving ? "Saving..." : "Create Batch"}</button>
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[300px_1fr]">
          <aside className="yf-card p-4 h-fit">
            <h2 className="yf-section-title">Batches</h2>
            <div className="space-y-2 mt-3">
              {batches.map((batch) => (
                <button key={batch.id} type="button" onClick={() => setSelectedBatchId(batch.id)} className={`w-full rounded-xl border p-3 text-left ${selectedBatchId === batch.id ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <p className="font-black text-slate-900">{batch.batch_name}</p>
                  <p className="text-xs text-slate-500 mt-1">{batch.customer_name}</p>
                  <span className={`yf-badge mt-2 ${statusClass(batch.status)}`}>{nice(batch.status)}</span>
                </button>
              ))}
              {batches.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No batches</p>}
            </div>
          </aside>

          <div className="space-y-5">
            {selectedBatch ? (
              <>
                <section className="yf-card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-black text-slate-900">{selectedBatch.batch_name}</h2>
                      <p className="text-sm text-slate-500 mt-1">{selectedBatch.customer_name}</p>
                      {selectedBatch.print_matter && <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{selectedBatch.print_matter}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedBatch.logo_path && <button type="button" onClick={() => void openStorageFile(selectedBatch.logo_path)} className="yf-btn yf-btn-secondary">Open Logo</button>}
                      <button type="button" onClick={exportCsv} className="yf-btn yf-btn-secondary">Export CSV</button>
                      {canManage && (
                        <select value={selectedBatch.status} onChange={(e) => void updateBatchStatus(e.target.value as BatchStatus)} className="yf-input w-auto">
                          <option value="draft">Draft</option><option value="in_progress">In Progress</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mt-5">
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-black text-slate-500">TOTAL</p><p className="text-2xl font-black">{allSelectedEntries.length}</p></div>
                    <div className="rounded-xl bg-blue-50 p-3"><p className="text-[10px] font-black text-blue-600">READY</p><p className="text-2xl font-black text-blue-700">{readyCount}</p></div>
                    <div className="rounded-xl bg-green-50 p-3"><p className="text-[10px] font-black text-green-600">PRINTED</p><p className="text-2xl font-black text-green-700">{printedCount}</p></div>
                  </div>

                  {canManage && (
                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <label className="yf-btn yf-btn-secondary cursor-pointer">
                        {uploading === "logo" ? "Uploading..." : "Upload Batch Logo"}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadBatchLogo(file); e.currentTarget.value = ""; }} />
                      </label>
                    </div>
                  )}
                </section>

                {canManage && (
                  <section className="yf-card p-5">
                    <h2 className="yf-section-title">Bulk Matter Paste</h2>
                    <p className="text-xs text-slate-500 mt-1">એક line = એક card. Format: Name | Card No | Designation | Department | Mobile | Blood Group | Custom Text</p>
                    <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={7} className="yf-input resize-y mt-3 font-mono text-sm" placeholder="Rahul Patel | 101 | Manager | Sales | 9876543210 | B+ | Valid Till 2027" />
                    <button type="button" onClick={() => void addBulkEntries()} disabled={saving} className="yf-btn yf-btn-primary mt-3 disabled:opacity-50">Add Bulk Cards</button>
                  </section>
                )}

                <section className="yf-card p-4">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Name / Card No / Department / Mobile..." className="yf-input" />
                </section>

                <section className="grid gap-3">
                  {batchEntries.map((entry) => (
                    <article key={entry.id} className="yf-card p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-blue-700">#{entry.serial_no}</span>
                            <h3 className="font-black text-slate-900">{entry.full_name}</h3>
                            <span className={`yf-badge ${statusClass(entry.status)}`}>{nice(entry.status)}</span>
                          </div>
                          <p className="text-sm text-slate-600 mt-1">{entry.card_number || "No Card No"} • {entry.designation || "-"} • {entry.department || "-"}</p>
                          <p className="text-xs text-slate-400 mt-1">{entry.mobile || "-"} {entry.blood_group ? `• ${entry.blood_group}` : ""}</p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {entry.photo_path && <button type="button" onClick={() => void openStorageFile(entry.photo_path)} className="yf-btn yf-btn-secondary">Photo</button>}
                          {canManage && (
                            <>
                              <label className="yf-btn yf-btn-secondary cursor-pointer">
                                {uploading === entry.id ? "Uploading..." : "Upload Photo"}
                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadEntryPhoto(entry, file); e.currentTarget.value = ""; }} />
                              </label>
                              <select value={entry.status} onChange={(e) => void updateEntryStatus(entry, e.target.value as EntryStatus)} className="yf-input w-auto">
                                <option value="pending">Pending</option><option value="ready">Ready</option><option value="printed">Printed</option><option value="rejected">Rejected</option>
                              </select>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                  {batchEntries.length === 0 && <div className="yf-card p-10 text-center text-slate-400">આ batchમાં હજુ ID Card data નથી.</div>}
                </section>
              </>
            ) : (
              <div className="yf-card p-10 text-center text-slate-400">Batch select કરો.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
