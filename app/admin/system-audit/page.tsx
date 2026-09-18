"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
  role: string | null;
};

type Permission = {
  id: string;
  permission_key: string;
  label: string;
  category: string;
};

type EmployeePermission = {
  employee_id: string;
  permission_id: string;
  is_allowed: boolean;
};

type TableCheck = {
  table: string;
  label: string;
  count: number | null;
  error: string | null;
};

const backupTables = [
  "departments",
  "employees",
  "products",
  "workflow_stages",
  "workflow_templates",
  "workflow_template_stages",
  "workflow_template_stage_workers",
  "orders",
  "order_stage_work",
  "order_stage_workers",
  "order_operation_details",
  "tasks",
  "task_support_workers",
  "attendance",
  "leave_requests",
  "notifications",
  "inventory_items",
  "inventory_transactions",
  "product_inventory_bom",
  "order_inventory_consumptions",
  "order_payments",
  "order_billing",
  "order_dispatch_records",
  "id_card_batches",
  "id_card_entries",
  "app_permissions",
  "employee_app_permissions",
  "employee_departments",
] as const;

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function indiaStamp() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(/[^0-9]/g, "-");
}

export default function SystemAuditPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [message, setMessage] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [employeePermissions, setEmployeePermissions] = useState<EmployeePermission[]>([]);
  const [tableChecks, setTableChecks] = useState<TableCheck[]>([]);

  useEffect(() => {
    async function init() {
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

      const [employeeResult, permissionResult, assignmentResult] = await Promise.all([
        supabase
          .from("employees")
          .select("id, full_name, department, role")
          .eq("approval_status", "approved")
          .eq("is_active", true)
          .eq("is_hidden", false)
          .order("full_name"),
        supabase
          .from("app_permissions")
          .select("id, permission_key, label, category")
          .eq("is_active", true)
          .order("category")
          .order("sort_order"),
        supabase
          .from("employee_app_permissions")
          .select("employee_id, permission_id, is_allowed")
          .eq("is_allowed", true),
      ]);

      const firstError = employeeResult.error || permissionResult.error || assignmentResult.error;
      if (firstError) {
        setMessage(`Audit Load Error: ${firstError.message}`);
        setLoading(false);
        return;
      }

      setEmployees((employeeResult.data || []) as Employee[]);
      setPermissions((permissionResult.data || []) as Permission[]);
      setEmployeePermissions((assignmentResult.data || []) as EmployeePermission[]);

      const checkDefs = [
        ["employees", "Employees"],
        ["employee_departments", "Employee Departments"],
        ["app_permissions", "Permission Master"],
        ["orders", "Orders"],
        ["tasks", "Tasks"],
        ["attendance", "Attendance"],
        ["leave_requests", "Leave Requests"],
        ["inventory_items", "Inventory Items"],
        ["order_payments", "Payments"],
        ["order_billing", "Billing"],
        ["order_dispatch_records", "Dispatch"],
      ] as const;

      const checks = await Promise.all(
        checkDefs.map(async ([table, label]) => {
          const result = await supabase.from(table).select("*", { count: "exact", head: true });
          return {
            table,
            label,
            count: result.error ? null : result.count ?? 0,
            error: result.error?.message || null,
          } satisfies TableCheck;
        })
      );

      setTableChecks(checks);
      setLoading(false);
    }

    void init();
  }, [router]);

  const permissionMap = useMemo(
    () => new Map(permissions.map((permission) => [permission.id, permission])),
    [permissions]
  );

  const permissionIdsByEmployee = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of employeePermissions) {
      if (!row.is_allowed) continue;
      const current = map.get(row.employee_id) || [];
      current.push(row.permission_id);
      map.set(row.employee_id, current);
    }
    return map;
  }, [employeePermissions]);

  const permissionCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const permission of permissions) {
      map.set(permission.category, (map.get(permission.category) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const employeesWithoutDirectPermission = employees.filter(
    (employee) => employee.role !== "admin" && (permissionIdsByEmployee.get(employee.id)?.length || 0) === 0
  );

  async function createBackup() {
    setBackingUp(true);
    setMessage("");
    const supabase = createClient();
    const snapshot: Record<string, unknown> = {
      schema_version: 2,
      generated_at: new Date().toISOString(),
      timezone: "Asia/Kolkata",
      app: "YashFlow",
      backup_type: "application-json-snapshot",
      note: "Supabase Auth users and Storage file binaries are not included. Keep Supabase platform backups as the authoritative disaster-recovery backup.",
      tables: {},
      row_counts: {},
      errors: {},
    };

    const tableData: Record<string, unknown[]> = {};
    const rowCounts: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const table of backupTables) {
      const { data, error } = await supabase.from(table).select("*");
      if (error) {
        errors[table] = error.message;
      } else {
        tableData[table] = data || [];
        rowCounts[table] = (data || []).length;
      }
    }

    snapshot.tables = tableData;
    snapshot.row_counts = rowCounts;
    snapshot.errors = errors;
    downloadJson(`yashflow-backup-${indiaStamp()}.json`, snapshot);

    const errorCount = Object.keys(errors).length;
    setMessage(
      errorCount === 0
        ? "Backup JSON download થયો ✅"
        : `Backup download થયો; ${errorCount} table(s) RLS/schema કારણે skip થયા.`
    );
    setBackingUp(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">System Audit લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW SAFETY</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">System Audit & Backup</h1>
            <p className="text-sm text-blue-100 mt-1">Permissions audit, table health અને portable JSON backup.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={backingUp} onClick={() => void createBackup()} className="yf-btn bg-emerald-400 text-emerald-950 disabled:opacity-50">
              {backingUp ? "Backing Up..." : "⬇ Download Backup"}
            </button>
            <button type="button" onClick={() => router.push("/admin/recovery")} className="yf-btn bg-white/10 text-white border border-white/20">♻ Recovery</button>
            <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">← Admin</button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-black text-amber-800">BACKUP SAFETY NOTE</p>
          <p className="text-sm font-semibold text-amber-900 mt-1">
            JSON backup app data માટે છે. Supabase Auth accounts અને Storageમાં રહેલા actual photo/video/file binaries આ JSONમાં નથી; full disaster recovery માટે Supabase platform backup પણ રાખવો જરૂરી છે.
          </p>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">VISIBLE EMPLOYEES</p><p className="text-3xl font-black text-blue-700 mt-1">{employees.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">ACTIVE PERMISSIONS</p><p className="text-3xl font-black text-violet-700 mt-1">{permissions.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">PERMISSION GROUPS</p><p className="text-3xl font-black text-emerald-700 mt-1">{permissionCategories.length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">NO DIRECT ACCESS</p><p className="text-3xl font-black text-amber-700 mt-1">{employeesWithoutDirectPermission.length}</p></div>
        </section>

        <section className="yf-card p-5 mb-5">
          <h2 className="yf-section-title">Database / RLS Health</h2>
          <p className="yf-section-subtitle mt-1">Admin sessionથી critical tables readable છે કે નહીં.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
            {tableChecks.map((check) => (
              <div key={check.table} className={`rounded-2xl border p-4 ${check.error ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
                <p className="font-black text-slate-800">{check.label}</p>
                {check.error ? (
                  <p className="text-xs font-bold text-red-700 mt-1">Error: {check.error}</p>
                ) : (
                  <p className="text-sm font-black text-green-700 mt-1">Readable ✅ • {check.count} row(s)</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="yf-card p-5 mb-5">
          <h2 className="yf-section-title">Permission Categories</h2>
          <div className="flex flex-wrap gap-2 mt-4">
            {permissionCategories.map(([category, count]) => (
              <span key={category} className="yf-badge bg-slate-100 text-slate-700">{category}: {count}</span>
            ))}
          </div>
        </section>

        <section className="yf-card overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="yf-section-title">Employee Permission Audit</h2>
            <p className="yf-section-subtitle mt-1">Hidden System Admin intentionally excluded.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="bg-slate-50"><tr className="text-xs font-black uppercase text-slate-500"><th className="text-left px-4 py-3">Employee</th><th className="text-left px-4 py-3">Department</th><th className="text-left px-4 py-3">Role</th><th className="text-left px-4 py-3">Direct Permissions</th></tr></thead>
              <tbody>
                {employees.map((employee) => {
                  const ids = permissionIdsByEmployee.get(employee.id) || [];
                  const rows = ids.map((id) => permissionMap.get(id)).filter(Boolean) as Permission[];
                  return (
                    <tr key={employee.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-black">{employee.full_name}</td>
                      <td className="px-4 py-3">{employee.department || "-"}</td>
                      <td className="px-4 py-3 capitalize">{employee.role || "employee"}</td>
                      <td className="px-4 py-3">
                        {employee.role === "admin" ? (
                          <span className="yf-badge bg-blue-100 text-blue-700">Admin Full Access</span>
                        ) : rows.length ? (
                          <div className="flex flex-wrap gap-1">{rows.map((permission) => <span key={permission.id} className="yf-badge bg-violet-100 text-violet-700" title={permission.permission_key}>{permission.label}</span>)}</div>
                        ) : (
                          <span className="yf-badge bg-amber-100 text-amber-700">No Direct Permission</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
