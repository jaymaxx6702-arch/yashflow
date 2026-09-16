"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type ProofFile = {
  id: string;
  order_id: string;
  stage_id: string;
  uploaded_by_employee_id: string;
  file_path: string;
  file_name: string;
  file_type: "photo" | "video";
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

type Order = {
  id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
};

type Employee = {
  id: string;
  full_name: string;
};

function formatSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminFilesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [files, setFiles] = useState<ProofFile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const orderMap = useMemo(
    () => new Map(orders.map((order) => [order.id, order])),
    [orders]
  );

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees]
  );

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();

    return files.filter((file) => {
      if (typeFilter !== "all" && file.file_type !== typeFilter) return false;
      if (!q) return true;

      const order = orderMap.get(file.order_id);
      const employee = employeeMap.get(file.uploaded_by_employee_id) || "";

      return [
        file.file_name,
        file.mime_type || "",
        order?.order_number || "",
        order?.customer_name || "",
        order?.product_name || "",
        employee,
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [files, orderMap, employeeMap, search, typeFilter]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.role !== "admin" ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      const filesResult = await supabase
        .from("order_stage_proofs")
        .select("id, order_id, stage_id, uploaded_by_employee_id, file_path, file_name, file_type, mime_type, file_size, created_at")
        .order("created_at", { ascending: false });

      if (filesResult.error) {
        setMessage(`Files Load Error: ${filesResult.error.message}`);
        setLoading(false);
        return;
      }

      const fileRows = (filesResult.data || []) as ProofFile[];
      setFiles(fileRows);

      const orderIds = Array.from(new Set(fileRows.map((file) => file.order_id)));
      const employeeIds = Array.from(
        new Set(fileRows.map((file) => file.uploaded_by_employee_id))
      );

      const [ordersResult, employeesResult] = await Promise.all([
        orderIds.length
          ? supabase
              .from("orders")
              .select("id, order_number, customer_name, product_name")
              .in("id", orderIds)
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length
          ? supabase
              .from("employees")
              .select("id, full_name")
              .in("id", employeeIds)
              .eq("is_hidden", false)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const firstError = ordersResult.error || employeesResult.error;
      if (firstError) {
        setMessage(`File Details Load Error: ${firstError.message}`);
      }

      setOrders((ordersResult.data || []) as Order[]);
      setEmployees((employeesResult.data || []) as Employee[]);
      setLoading(false);
    }

    void load();
  }, [router]);

  async function openFile(file: ProofFile, download = false) {
    setOpeningId(file.id);
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase.storage
      .from("workflow-proofs")
      .createSignedUrl(file.file_path, 600, download ? { download: file.file_name } : undefined);

    if (error || !data?.signedUrl) {
      setMessage(`File Open Error: ${error?.message || "Signed URL મળ્યો નથી."}`);
      setOpeningId(null);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    setOpeningId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Files Center લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW FILES</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Files / Documents Center</h1>
            <p className="text-sm text-blue-100 mt-1">Existing order workflow uploads એક જગ્યાએ.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="grid grid-cols-3 gap-3 mb-5">
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">TOTAL FILES</p><p className="text-3xl font-black text-blue-700 mt-1">{files.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">PHOTOS</p><p className="text-3xl font-black text-green-700 mt-1">{files.filter((file) => file.file_type === "photo").length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">VIDEOS</p><p className="text-3xl font-black text-purple-700 mt-1">{files.filter((file) => file.file_type === "video").length}</p></div>
        </section>

        <section className="yf-card p-4 mb-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Order / Customer / Product / File / Employee..." className="yf-input" />
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="yf-input">
              <option value="all">All Files</option>
              <option value="photo">Photos</option>
              <option value="video">Videos</option>
            </select>
          </div>
        </section>

        <section className="grid gap-4">
          {filteredFiles.map((file) => {
            const order = orderMap.get(file.order_id);
            const employee = employeeMap.get(file.uploaded_by_employee_id) || "-";

            return (
              <article key={file.id} className="yf-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-2xl">{file.file_type === "video" ? "🎬" : "🖼️"}</span>
                      <h2 className="font-black text-slate-900 break-all">{file.file_name}</h2>
                      <span className="yf-badge bg-slate-100 text-slate-700">{file.file_type.toUpperCase()}</span>
                    </div>
                    <p className="text-sm font-bold text-blue-700 mt-2">
                      {order?.order_number || "Order"} • {order?.customer_name || "-"}
                    </p>
                    <p className="text-sm text-slate-600 mt-1">{order?.product_name || "-"}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500 font-semibold">
                      <span>Uploaded by: {employee}</span>
                      <span>{formatSize(file.file_size)}</span>
                      <span>{formatDate(file.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <button type="button" disabled={openingId === file.id} onClick={() => void openFile(file)} className="yf-btn yf-btn-secondary disabled:opacity-50">Open</button>
                    <button type="button" disabled={openingId === file.id} onClick={() => void openFile(file, true)} className="yf-btn yf-btn-primary disabled:opacity-50">Download</button>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredFiles.length === 0 && (
            <div className="yf-card p-10 text-center">
              <div className="text-4xl">📁</div>
              <p className="font-black text-slate-700 mt-3">કોઈ file મળ્યો નથી.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
