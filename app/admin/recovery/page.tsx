"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type BackupSnapshot = {
  schema_version?: number;
  generated_at?: string;
  timezone?: string;
  app?: string;
  backup_type?: string;
  tables?: Record<string, unknown[]>;
  row_counts?: Record<string, number>;
  errors?: Record<string, string>;
};

const requiredTables = [
  "departments",
  "employees",
  "employee_departments",
  "app_permissions",
  "employee_app_permissions",
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
  "inventory_items",
  "inventory_transactions",
  "product_inventory_bom",
  "order_inventory_consumptions",
  "order_payments",
  "order_billing",
  "order_dispatch_records",
  "id_card_batches",
  "id_card_entries",
] as const;

export default function RecoveryCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState("");
  const [snapshot, setSnapshot] = useState<BackupSnapshot | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function verifyAdmin() {
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
        profile.role !== "admin" ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      setLoading(false);
    }

    void verifyAdmin();
  }, [router]);

  const tableMap = useMemo(
    () => snapshot?.tables || {},
    [snapshot]
  );

  const validation = useMemo(() => {
    if (!snapshot) {
      return {
        validApp: false,
        missing: [] as string[],
        present: 0,
        totalRows: 0,
      };
    }

    const missing = requiredTables.filter(
      (table) => !Array.isArray(tableMap[table])
    );

    const totalRows = Object.values(tableMap).reduce(
      (sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0),
      0
    );

    return {
      validApp: snapshot.app === "YashFlow",
      missing: [...missing],
      present: requiredTables.length - missing.length,
      totalRows,
    };
  }, [snapshot, tableMap]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setMessage("");
    setSnapshot(null);

    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupSnapshot;

      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid JSON structure");
      }

      if (!parsed.tables || typeof parsed.tables !== "object") {
        throw new Error("Backupમાં tables section મળ્યો નથી.");
      }

      setSnapshot(parsed);
      setMessage(
        "Backup file local browserમાં validate થયું ✅ કોઈ file server પર upload કરવામાં આવી નથી."
      );
    } catch (error) {
      setMessage(
        "Backup Validate Error: " +
          (error instanceof Error ? error.message : "Invalid JSON")
      );
    }
  }

  function rowCount(table: string) {
    const rows = tableMap[table];
    return Array.isArray(rows) ? rows.length : null;
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">
          Recovery Center લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              YASHFLOW RECOVERY
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Backup Validation & Recovery Center
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Backup JSON validate કરો અને safe recovery order follow કરો.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/admin/system-audit")}
              className="yf-btn bg-white/10 text-white border border-white/20"
            >
              🛡 System Audit
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="yf-btn bg-white text-blue-700"
            >
              ← Admin
            </button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-5">{message}</div>
        )}

        <section className="yf-card p-5 mb-5">
          <h2 className="yf-section-title">1. Validate YashFlow Backup</h2>
          <p className="yf-section-subtitle mt-1">
            આ validation તમારા browserમાં જ થાય છે. Selected JSON server પર
            upload થતું નથી.
          </p>

          <label className="block mt-4">
            <span className="text-sm font-black text-slate-700">
              Backup JSON File
            </span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={(event) => void handleFile(event)}
              className="yf-input mt-2"
            />
          </label>

          {fileName && (
            <p className="text-xs font-bold text-slate-500 mt-2">
              Selected: {fileName}
            </p>
          )}
        </section>

        {snapshot && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="yf-card p-4">
                <p className="text-xs font-black text-slate-500">APP</p>
                <p
                  className={
                    validation.validApp
                      ? "font-black text-green-700 mt-1"
                      : "font-black text-red-700 mt-1"
                  }
                >
                  {snapshot.app || "Unknown"}
                </p>
              </div>
              <div className="yf-card p-4">
                <p className="text-xs font-black text-slate-500">SCHEMA</p>
                <p className="text-2xl font-black text-blue-700 mt-1">
                  v{snapshot.schema_version || 1}
                </p>
              </div>
              <div className="yf-card p-4">
                <p className="text-xs font-black text-slate-500">
                  CORE TABLES
                </p>
                <p className="text-2xl font-black text-violet-700 mt-1">
                  {validation.present}/{requiredTables.length}
                </p>
              </div>
              <div className="yf-card p-4">
                <p className="text-xs font-black text-slate-500">
                  ROWS IN FILE
                </p>
                <p className="text-2xl font-black text-emerald-700 mt-1">
                  {validation.totalRows}
                </p>
              </div>
            </section>

            <section className="yf-card p-5 mb-5">
              <h2 className="yf-section-title">Core Table Integrity</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                {requiredTables.map((table) => {
                  const count = rowCount(table);

                  return (
                    <div
                      key={table}
                      className={
                        "rounded-xl border p-3 " +
                        (count === null
                          ? "border-red-200 bg-red-50"
                          : "border-green-200 bg-green-50")
                      }
                    >
                      <p className="text-sm font-black text-slate-800">
                        {table}
                      </p>
                      <p
                        className={
                          count === null
                            ? "text-xs font-bold text-red-700 mt-1"
                            : "text-xs font-bold text-green-700 mt-1"
                        }
                      >
                        {count === null
                          ? "Missing"
                          : String(count) + " row(s) ✅"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

          </>
        )}

        <section className="yf-card p-5 mb-5">
          <h2 className="yf-section-title">2. Safe Recovery Order</h2>
          <div className="mt-4 space-y-3 text-sm font-semibold text-slate-700">
            <div className="rounded-xl bg-slate-50 p-4">
              <b>1.</b> Data entry, attendance અને order updates થોડા સમય માટે
              બંધ કરો.
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <b>2.</b> Supabase Dashboardમાંથી current platform/database
              backup રાખો. આ primary rollback point છે.
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <b>3.</b> Master data → employee mappings/permissions →
              orders/workflow/order details → tasks/attendance/leave → inventory →
              accounts/dispatch → bulk ID cards ક્રમમાં controlled restore કરો.
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <b>4.</b> Auth users અને Storage files separately verify કરો.
              JSON snapshot Auth passwords/users અથવા actual photo/video/file
              binaries restore કરતું નથી.
            </div>
            <div className="rounded-xl bg-slate-50 p-4">
              <b>5.</b> Restore પછી Production Readiness અને System Audit બંને
              ચલાવો; row counts અને permissions match થાય પછી જ team માટે app
              reopen કરો.
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-black text-red-800">
            Automatic destructive restore intentionally disabled
          </p>
          <p className="text-sm font-semibold text-red-700 mt-1 leading-6">
            Browserમાંથી one-click restore accidental overwrite અથવા duplicate
            records કરી શકે છે. Actual disaster restore Supabase
            backup/controlled importથી કરવો સુરક્ષિત છે.
          </p>
        </div>
      </div>
    </main>
  );
}
