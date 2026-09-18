"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Check = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  required?: boolean;
};

type ModuleLink = {
  label: string;
  route: string;
  note: string;
};

const modules: ModuleLink[] = [
  { label: "Orders", route: "/admin/orders", note: "Order creation, workflow and stage control" },
  { label: "Task / Team", route: "/admin/task-team", note: "Task assignment, reassign and support employees" },
  { label: "Attendance", route: "/admin/attendance", note: "Daily attendance and corrections" },
  { label: "Leave", route: "/admin/leave", note: "Leave approval and work handover" },
  { label: "Inventory", route: "/admin/inventory", note: "Stock, BOM and consumption" },
  { label: "Purchase", route: "/dashboard/purchase", note: "Purchase orders and receiving" },
  { label: "Reorder Center", route: "/admin/reorder", note: "Low stock purchase planning" },
  { label: "Packing", route: "/dashboard/packing", note: "Completed-order packing queue" },
  { label: "Dispatch", route: "/dashboard/dispatch", note: "Courier, transport and delivery" },
  { label: "Accounts", route: "/admin/accounts", note: "Payments, billing summary and export" },
  { label: "Reports", route: "/admin/reports", note: "Operational reports and CSV export" },
  { label: "Escalations", route: "/admin/escalations", note: "Overdue, hold/rework and low-stock attention" },
  { label: "Files", route: "/admin/files", note: "Workflow proof documents" },
  { label: "System Audit", route: "/admin/system-audit", note: "Permissions, RLS health and JSON backup" },
  { label: "Recovery", route: "/admin/recovery", note: "Backup validation and safe recovery checklist" },
];

export default function ProductionReadinessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState<Check[]>([]);
  const [dbChecks, setDbChecks] = useState<Check[]>([]);

  const requiredChecks = useMemo(
    () => [...checks, ...dbChecks].filter((check) => check.required !== false),
    [checks, dbChecks]
  );

  const passed = useMemo(
    () => requiredChecks.filter((check) => check.ok).length,
    [requiredChecks]
  );

  const total = requiredChecks.length;

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

      const browserChecks: Check[] = [
        {
          key: "online",
          label: "Internet Connection",
          ok: navigator.onLine,
          detail: navigator.onLine ? "Online" : "Offline",
          required: true,
        },
        {
          key: "service-worker",
          label: "PWA Service Worker Support",
          ok: "serviceWorker" in navigator,
          detail: "serviceWorker" in navigator ? "Supported" : "Not supported",
          required: true,
        },
        {
          key: "geolocation",
          label: "GPS / Geolocation API",
          ok: "geolocation" in navigator,
          detail: "geolocation" in navigator
            ? "Supported — employee GPS login can run"
            : "Not supported on this browser/device",
          required: true,
        },
        {
          key: "service-worker-controller",
          label: "PWA Service Worker Active",
          ok: !("serviceWorker" in navigator) || Boolean(navigator.serviceWorker.controller),
          detail: !("serviceWorker" in navigator)
            ? "Service Worker unsupported"
            : navigator.serviceWorker.controller
            ? "Active and controlling this page"
            : "Supported; reload once after first install",
          required: false,
        },
        {
          key: "storage",
          label: "Browser Storage",
          ok: Boolean(navigator.storage),
          detail: navigator.storage ? "Available" : "Unavailable",
          required: true,
        },
        {
          key: "notifications",
          label: "Browser Notifications",
          ok: true,
          detail: "Notification" in window ? Notification.permission : "Not supported on this browser",
          required: false,
        },
        {
          key: "vibration",
          label: "Vibration API",
          ok: true,
          detail: typeof navigator.vibrate === "function" ? "Supported" : "Optional — not supported on this device/browser",
          required: false,
        },
        {
          key: "standalone",
          label: "Installed App / Standalone",
          ok: true,
          detail:
            window.matchMedia("(display-mode: standalone)").matches ||
            Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
              ? "Running as installed app"
              : "Running in browser — install is optional",
          required: false,
        },
      ];
      try {
        const manifestResponse = await fetch("/manifest.webmanifest", { cache: "no-store" });
        browserChecks.push({
          key: "manifest",
          label: "PWA Manifest",
          ok: manifestResponse.ok,
          detail: manifestResponse.ok ? "manifest.webmanifest reachable" : "Manifest could not be loaded",
          required: true,
        });
      } catch {
        browserChecks.push({
          key: "manifest",
          label: "PWA Manifest",
          ok: false,
          detail: "Manifest request failed",
          required: true,
        });
      }

      setChecks(browserChecks);

      const tables = [
        ["orders", "Orders Database"],
        ["tasks", "Tasks Database"],
        ["attendance", "Attendance Database"],
        ["leave_requests", "Leave Database"],
        ["inventory_items", "Inventory Database"],
        ["order_dispatch_records", "Dispatch Database"],
        ["order_payments", "Accounts Database"],
        ["order_billing", "Billing Database"],
        ["employee_departments", "Employee Department Mapping"],
        ["attendance_geofence_settings", "GPS Requirement Settings"],
        ["app_permissions", "Permission Master"],
      ] as const;

      const results = await Promise.all(
        tables.map(async ([table, label]) => {
          const result = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });

          return {
            key: table,
            label,
            ok: !result.error,
            detail: result.error
              ? result.error.message
              : `Readable • ${result.count ?? 0} row(s)`,
            required: true,
          } satisfies Check;
        })
      );

      const requiredPermissionKeys = [
        "orders.view",
        "orders.manage",
        "attendance.manage",
        "inventory.view",
        "inventory.manage",
        "purchase.view",
        "purchase.manage",
        "dispatch.view",
        "dispatch.manage",
        "payments.view_sensitive",
        "payments.manage",
        "billing.manage",
      ];

      const permissionResult = await supabase
        .from("app_permissions")
        .select("permission_key")
        .eq("is_active", true)
        .in("permission_key", requiredPermissionKeys);

      const activePermissionKeys = new Set(
        (permissionResult.data || []).map((row) => row.permission_key)
      );

      const permissionChecks: Check[] = requiredPermissionKeys.map((key) => ({
        key: `permission-${key}`,
        label: `Permission: ${key}`,
        ok: !permissionResult.error && activePermissionKeys.has(key),
        detail: permissionResult.error
          ? permissionResult.error.message
          : activePermissionKeys.has(key)
          ? "Active ✅"
          : "Missing / inactive",
        required: true,
      }));

      const gpsSettingResult = await supabase
        .from("attendance_geofence_settings")
        .select("is_active, require_check_in, require_check_out, latitude, longitude")
        .eq("id", 1)
        .maybeSingle();

      const gpsSettingCheck: Check = {
        key: "gps-setting-row",
        label: "GPS Master Control",
        ok: !gpsSettingResult.error && Boolean(gpsSettingResult.data),
        detail: gpsSettingResult.error
          ? gpsSettingResult.error.message
          : !gpsSettingResult.data
          ? "GPS setting row id=1 missing"
          : gpsSettingResult.data.is_active
          ? "GPS ON • Employee Login + Attendance GPS required"
          : "GPS OFF • Login + Attendance allowed without device GPS",
        required: true,
      };

      setDbChecks([...results, ...permissionChecks, gpsSettingCheck]);
      setLoading(false);
    }

    void load();
  }, [router]);

  function runAgain() {
    window.location.reload();
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Production Readiness check ચાલી રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW FINAL CHECK</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Production Readiness Center</h1>
            <p className="text-sm text-blue-100 mt-1">Core modules, browser/PWA capability અને database readability એક જગ્યાએ.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={runAgain} className="yf-btn bg-white/10 text-white border border-white/20">↻ Recheck</button>
            <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">← Admin</button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-black text-slate-500">CURRENT V1 SCOPE</p>
          <p className="text-sm font-bold text-slate-700 mt-1">
            Bulk ID Card end-to-end testing અને Order Production Details integration હાલ user scope મુજબ intentionally skipped છે; readiness scoreમાં ગણાતા નથી.
          </p>
        </div>

        <section className="yf-card p-5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs font-black text-slate-500">AUTOMATED CHECK SCORE</p>
              <p className={`text-4xl font-black mt-1 ${passed === total ? "text-green-700" : "text-amber-700"}`}>
                {passed}/{total}
              </p>
            </div>
            <div className={`yf-badge text-sm ${passed === total ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
              {passed === total ? "Automated checks passed ✅" : "Some checks need attention"}
            </div>
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-5 mb-5">
          <div className="yf-card p-5">
            <h2 className="yf-section-title">Browser / PWA Checks</h2>
            <div className="space-y-3 mt-4">
              {checks.map((check) => (
                <div key={check.key} className={`rounded-2xl border p-4 ${check.ok ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-800">{check.label}</p>
                    <span>{check.required === false ? "ℹ️" : check.ok ? "✅" : "⚠️"}</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-600 mt-1">{check.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="yf-card p-5">
            <h2 className="yf-section-title">Database Checks</h2>
            <div className="space-y-3 mt-4">
              {dbChecks.map((check) => (
                <div key={check.key} className={`rounded-2xl border p-4 ${check.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-slate-800">{check.label}</p>
                    <span>{check.ok ? "✅" : "❌"}</span>
                  </div>
                  <p className={`text-xs font-semibold mt-1 ${check.ok ? "text-slate-600" : "text-red-700"}`}>{check.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="yf-card p-5">
          <h2 className="yf-section-title">Core Module Launch Test</h2>
          <p className="yf-section-subtitle mt-1">દરેક button ખોલીને mobile/desktopમાં final visual test કરી શકાય.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-4">
            {modules.map((module) => (
              <button
                key={module.route}
                type="button"
                onClick={() => router.push(module.route)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:shadow-md transition"
              >
                <p className="font-black text-blue-700">{module.label}</p>
                <p className="text-xs font-semibold text-slate-500 mt-1">{module.note}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
