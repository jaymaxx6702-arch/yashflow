"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type AnyRow = Record<string, any>;

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
};

function indiaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function indiaMonthStart() {
  const today = indiaToday();
  return `${today.slice(0, 8)}01`;
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>())
  );

  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(",")),
  ].join("\r\n");

  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDateTime(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function AdminReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const [fromDate, setFromDate] = useState(indiaMonthStart());
  const [toDate, setToDate] = useState(indiaToday());

  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [attendance, setAttendance] = useState<AnyRow[]>([]);
  const [inventory, setInventory] = useState<AnyRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  async function loadReports() {
    setRefreshing(true);
    setMessage("");

    const supabase = createClient();

    const [ordersResult, attendanceResult, inventoryResult, employeesResult] =
      await Promise.all([
        supabase
          .from("orders")
          .select(`
            id,
            order_number,
            customer_name,
            customer_mobile,
            product_name,
            quantity,
            current_stage,
            workflow_status,
            priority,
            order_date,
            due_date,
            customer_note,
            admin_note,
            created_at,
            completed_at
          `)
          .gte("order_date", fromDate)
          .lte("order_date", toDate)
          .order("order_date", { ascending: false }),

        supabase
          .from("attendance")
          .select(`
            id,
            employee_id,
            attendance_date,
            check_in,
            check_out,
            status,
            attendance_type,
            late_minutes,
            working_minutes,
            approval_status,
            admin_note
          `)
          .gte("attendance_date", fromDate)
          .lte("attendance_date", toDate)
          .order("attendance_date", { ascending: false }),

        supabase
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
            is_active
          `)
          .order("item_name", { ascending: true }),

        supabase
          .from("employees")
          .select("id, full_name, department")
          .eq("is_hidden", false)
          .order("full_name"),
      ]);

    const firstError =
      ordersResult.error ||
      attendanceResult.error ||
      inventoryResult.error ||
      employeesResult.error;

    if (firstError) {
      setMessage(`Report Load Error: ${firstError.message}`);
      setRefreshing(false);
      return;
    }

    setOrders((ordersResult.data || []) as AnyRow[]);
    setAttendance((attendanceResult.data || []) as AnyRow[]);
    setInventory((inventoryResult.data || []) as AnyRow[]);
    setEmployees((employeesResult.data || []) as Employee[]);
    setRefreshing(false);
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
        .select("id, role, approval_status, is_active")
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

      await loadReports();
      setLoading(false);
    }

    void loadPage();
  }, [router]);

  const orderRows = useMemo(
    () =>
      orders.map((order) => ({
        Order_No: order.order_number,
        Order_Date: order.order_date,
        Customer: order.customer_name,
        Mobile: order.customer_mobile || "",
        Product: order.product_name,
        Quantity: order.quantity,
        Priority: order.priority,
        Current_Stage: order.current_stage,
        Workflow_Status: order.workflow_status,
        Due_Date: order.due_date || "",
        Customer_Note: order.customer_note || "",
        Admin_Note: order.admin_note || "",
        Created_At: formatDateTime(order.created_at),
        Completed_At: formatDateTime(order.completed_at),
      })),
    [orders]
  );

  const attendanceRows = useMemo(
    () =>
      attendance.map((row) => {
        const employee = employeeMap.get(row.employee_id);
        return {
          Date: row.attendance_date,
          Employee: employee?.full_name || row.employee_id,
          Department: employee?.department || "",
          Status: row.status || "",
          Attendance_Type: row.attendance_type || "",
          Check_In: formatDateTime(row.check_in),
          Check_Out: formatDateTime(row.check_out),
          Late_Minutes: row.late_minutes ?? 0,
          Working_Minutes: row.working_minutes ?? 0,
          Approval_Status: row.approval_status || "",
          Admin_Note: row.admin_note || "",
        };
      }),
    [attendance, employeeMap]
  );

  const inventoryRows = useMemo(
    () =>
      inventory.map((item) => ({
        Item_Code: item.item_code,
        Item_Name: item.item_name,
        Category: item.category,
        Unit: item.unit,
        Current_Stock: item.current_stock,
        Minimum_Stock: item.minimum_stock,
        Low_Stock:
          Number(item.current_stock || 0) <= Number(item.minimum_stock || 0)
            ? "YES"
            : "NO",
        Purchase_Price: item.purchase_price ?? "",
        Supplier: item.supplier_name || "",
        Location: item.location || "",
        Note: item.note || "",
        Active: item.is_active ? "YES" : "NO",
      })),
    [inventory]
  );

  const lowStockCount = inventory.filter(
    (item) => Number(item.current_stock || 0) <= Number(item.minimum_stock || 0)
  ).length;

  const presentCount = attendance.filter(
    (row) => row.status === "present" || row.attendance_type === "present"
  ).length;

  const completedOrders = orders.filter(
    (order) => order.current_stage === "completed" || order.workflow_status === "completed"
  ).length;

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-semibold text-slate-500">Reports લોડ થઈ રહ્યા છે...</p>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black">YashFlow Reports</h1>
            <p className="text-blue-100 text-sm">Orders • Attendance • Inventory Export</p>
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
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="yf-card p-5">
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label className="block">
              <span className="text-sm font-bold text-slate-600">From Date</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-600">To Date</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3"
              />
            </label>

            <button
              type="button"
              onClick={() => void loadReports()}
              disabled={refreshing || !fromDate || !toDate || fromDate > toDate}
              className="yf-btn yf-btn-primary disabled:opacity-50"
            >
              {refreshing ? "Loading..." : "Apply Date"}
            </button>
          </div>
        </section>

        <section className="grid gap-4 mt-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="yf-metric-card">
            <p className="text-sm text-slate-500">Orders</p>
            <p className="text-3xl font-black text-blue-700 mt-2">{orders.length}</p>
            <p className="text-xs text-slate-500 mt-1">{completedOrders} completed</p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm text-slate-500">Attendance Rows</p>
            <p className="text-3xl font-black text-green-700 mt-2">{attendance.length}</p>
            <p className="text-xs text-slate-500 mt-1">{presentCount} present entries</p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm text-slate-500">Inventory Items</p>
            <p className="text-3xl font-black text-violet-700 mt-2">{inventory.length}</p>
            <p className="text-xs text-slate-500 mt-1">Current master stock</p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm text-slate-500">Low Stock</p>
            <p className="text-3xl font-black text-orange-700 mt-2">{lowStockCount}</p>
            <p className="text-xs text-slate-500 mt-1">At / below minimum</p>
          </div>
        </section>

        <section className="grid gap-5 mt-5 lg:grid-cols-3">
          <div className="yf-card p-5">
            <div className="text-3xl">📦</div>
            <h2 className="text-xl font-black mt-3">Orders Report</h2>
            <p className="text-sm text-slate-500 mt-1">Selected date rangeના orders export કરો.</p>
            <button
              type="button"
              onClick={() =>
                downloadCsv(`yashflow-orders-${fromDate}-to-${toDate}.csv`, orderRows)
              }
              disabled={!orderRows.length}
              className="yf-btn yf-btn-primary mt-5 w-full disabled:opacity-50"
            >
              Download Orders CSV
            </button>
          </div>

          <div className="yf-card p-5">
            <div className="text-3xl">🕘</div>
            <h2 className="text-xl font-black mt-3">Attendance Report</h2>
            <p className="text-sm text-slate-500 mt-1">Employee name, check-in/out, late અને working minutes.</p>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `yashflow-attendance-${fromDate}-to-${toDate}.csv`,
                  attendanceRows
                )
              }
              disabled={!attendanceRows.length}
              className="yf-btn yf-btn-primary mt-5 w-full disabled:opacity-50"
            >
              Download Attendance CSV
            </button>
          </div>

          <div className="yf-card p-5">
            <div className="text-3xl">🏷️</div>
            <h2 className="text-xl font-black mt-3">Inventory Report</h2>
            <p className="text-sm text-slate-500 mt-1">Current stock, minimum stock, supplier અને low stock status.</p>
            <button
              type="button"
              onClick={() =>
                downloadCsv(`yashflow-inventory-${indiaToday()}.csv`, inventoryRows)
              }
              disabled={!inventoryRows.length}
              className="yf-btn yf-btn-primary mt-5 w-full disabled:opacity-50"
            >
              Download Inventory CSV
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
