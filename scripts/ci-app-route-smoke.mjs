const base = process.env.YASHFLOW_SMOKE_BASE_URL || "http://127.0.0.1:3000";

const pageRoutes = [
  "/",
  "/register",
  "/install",
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/orders/00000000-0000-0000-0000-000000000000",
  "/dashboard/tasks",
  "/dashboard/leave",
  "/dashboard/work-calendar",
  "/dashboard/order-create",
  "/dashboard/packing",
  "/dashboard/dispatch",
  "/dashboard/purchase",
  "/dashboard/accounts",
  "/dashboard/manage",
  "/dashboard/manage/orders",
  "/dashboard/manage/attendance",
  "/dashboard/manage/order-details",
  "/completed-tasks",
  "/admin",
  "/admin/accounts",
  "/admin/activity",
  "/admin/attendance",
  "/admin/attendance-approval",
  "/admin/attendance-report",
  "/admin/checklists",
  "/admin/completed-orders",
  "/admin/employees",
  "/admin/escalations",
  "/admin/files",
  "/admin/gps-settings",
  "/admin/holidays",
  "/admin/id-cards",
  "/admin/inventory",
  "/admin/leave",
  "/admin/orders",
  "/admin/orders/00000000-0000-0000-0000-000000000000",
  "/admin/performance",
  "/admin/products",
  "/admin/readiness",
  "/admin/recovery",
  "/admin/reorder",
  "/admin/reports",
  "/admin/system-audit",
  "/admin/task-team",
  "/admin/tasks",
  "/admin/work-calendar",
  "/admin/workflow",
];

const staticRoutes = [
  "/manifest.webmanifest",
  "/sw.js",
  "/offline.html",
  "/icon-192.png",
  "/icon-512.png",
];

const authApiChecks = [
  ["POST", "/api/attendance/check-in", {}],
  ["POST", "/api/attendance/check-out", {}],
  ["POST", "/api/attendance/manual-request", {}],
  ["POST", "/api/admin/attendance/manual-review", {}],
  ["POST", "/api/admin/ensure-permissions", {}],
  ["POST", "/api/admin/stuck-work-scan", {}],
  ["GET", "/api/orders/create", null],
  ["POST", "/api/orders/create", {}],
  ["GET", "/api/push/config", null],
  ["POST", "/api/push/subscribe", {}],
  ["POST", "/api/push/unsubscribe", {}],
  ["POST", "/api/integrations/shop/orders", {}],
];

const failures = [];

async function request(path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    return await fetch(base + path, {
      redirect: "manual",
      signal: controller.signal,
      ...init,
    });
  } finally {
    clearTimeout(timeout);
  }
}

for (const path of [...pageRoutes, ...staticRoutes]) {
  try {
    const response = await request(path);
    if (response.status === 404 || response.status >= 500) {
      failures.push(`${path}: HTTP ${response.status}`);
    }
  } catch (error) {
    failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const [method, path, body] of authApiChecks) {
  try {
    const response = await request(path, {
      method,
      headers: body === null ? undefined : { "Content-Type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
    });

    if (response.status !== 401) {
      const text = await response.text().catch(() => "");
      failures.push(
        `${method} ${path}: expected unauthenticated HTTP 401, got ${response.status}${text ? ` • ${text.slice(0, 180)}` : ""}`
      );
    }
  } catch (error) {
    failures.push(
      `${method} ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

if (failures.length) {
  console.error("Full app route smoke FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Full app route smoke PASS: ${pageRoutes.length} pages + ${staticRoutes.length} static assets + ${authApiChecks.length} auth API checks`);
