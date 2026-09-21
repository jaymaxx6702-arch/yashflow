import fs from "node:fs";

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  if (!fs.existsSync(path)) {
    fail(`Missing critical file: ${path}`);
    return "";
  }
  return fs.readFileSync(path, "utf8");
}

function blockBetween(source, start, end, label) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    fail(`Could not locate ${label} source block`);
    return "";
  }
  return source.slice(startIndex, endIndex);
}

const criticalFiles = [
  "app/dashboard/page.tsx",
  "app/api/attendance/check-in/route.ts",
  "app/api/attendance/check-out/route.ts",
  "app/api/attendance/manual-request/route.ts",
  "app/admin/page.tsx",
  "app/admin/attendance/page.tsx",
  "app/admin/attendance-approval/page.tsx",
  "app/admin/readiness/page.tsx",
  "app/admin/system-audit/page.tsx",
  "utils/offline-queue.ts",
  "public/manifest.webmanifest",
  "public/sw.js",
];

for (const path of criticalFiles) {
  read(path);
}

const dashboard = read("app/dashboard/page.tsx");
const checkIn = blockBetween(
  dashboard,
  "  async function handleCheckIn() {",
  "  async function handleCheckOut() {",
  "Check In"
);
const checkOut = blockBetween(
  dashboard,
  "  async function handleCheckOut() {",
  "  async function handleLogout() {",
  "Check Out"
);

for (const [label, source, setting] of [
  ["Check In", checkIn, "require_check_in"],
  ["Check Out", checkOut, "require_check_out"],
]) {
  if (!source.includes("!gpsSettingsLoaded ||")) {
    fail(`${label}: missing conservative GPS fallback while settings load`);
  }
  if (!source.includes(setting)) {
    fail(`${label}: missing GPS master-setting check (${setting})`);
  }

  const capture = source.indexOf("const location = gpsRequired");
  const gps = source.indexOf("await getGpsLocation()");

  if (capture < 0 || gps < 0) {
    fail(`${label}: GPS capture flow is incomplete`);
  }
}

const checkInRpc = checkIn.indexOf('"employee_gps_check_in"');
const checkInApiFallback = checkIn.indexOf('fetch("/api/attendance/check-in"');
const checkInGpsCapture = checkIn.indexOf("await getGpsLocation()");

if (checkInRpc < 0) {
  fail("Check In: stable employee_gps_check_in RPC primary path is missing");
}
if (checkInApiFallback < 0) {
  fail("Check In: API fallback path is missing");
}
if (
  checkInRpc >= 0 &&
  checkInApiFallback >= 0 &&
  checkInRpc > checkInApiFallback
) {
  fail("Check In: API path appears before the stable RPC primary path");
}
if (
  checkInGpsCapture >= 0 &&
  checkInRpc >= 0 &&
  checkInGpsCapture > checkInRpc
) {
  fail("Check In: RPC can run before GPS capture");
}
if (!checkIn.includes("rpcUnavailable")) {
  fail("Check In: RPC-unavailable fallback guard is missing");
}
if (!checkIn.includes('result.code === "GPS_REQUIRED"')) {
  fail("Check In: API fallback lost server-authoritative GPS retry");
}

const checkOutRequest = checkOut.indexOf('fetch("/api/attendance/check-out"');
const checkOutGpsCapture = checkOut.indexOf("await getGpsLocation()");
if (checkOutRequest < 0 || checkOutGpsCapture < 0) {
  fail("Check Out: GPS/API flow is incomplete");
} else if (checkOutGpsCapture > checkOutRequest) {
  fail("Check Out: attendance request can run before GPS capture");
}
if (!checkOut.includes('result.code === "GPS_REQUIRED"')) {
  fail("Check Out: missing server-authoritative GPS fallback retry");
}

for (const path of [
  "app/api/attendance/check-in/route.ts",
  "app/api/attendance/check-out/route.ts",
]) {
  const source = read(path);
  const tokenGuard = source.indexOf("if (!token)");
  const dbClient = source.indexOf("integrationSupabase()");

  if (tokenGuard < 0 || dbClient < 0 || tokenGuard > dbClient) {
    fail(`${path}: authentication must be rejected before DB work`);
  }
  if (!source.includes('code: "GPS_REQUIRED"') || !source.includes("status: 428")) {
    fail(`${path}: GPS_REQUIRED/428 contract missing`);
  }
  if (!source.includes('.from("attendance")')) {
    fail(`${path}: attendance persistence contract missing`);
  }
}

const offlineQueue = read("utils/offline-queue.ts");
if (
  !offlineQueue.includes('"attendance_check_in"') ||
  !offlineQueue.includes('"attendance_check_out"')
) {
  fail("Offline queue no longer covers both attendance punch actions");
}

const readiness = read("app/admin/readiness/page.tsx");
for (const required of [
  '"attendance"',
  '"attendance_geofence_settings"',
  '"app_permissions"',
]) {
  if (!readiness.includes(required)) {
    fail(`Production Readiness is missing critical check: ${required}`);
  }
}

if (failures.length) {
  console.error("\nCritical-flow regression checks FAILED:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Critical-flow regression checks PASS");
console.log("- Check In uses the stable employee-session RPC first, with API fallback");\nconsole.log("- Attendance captures GPS before normal Punch requests when required/unknown");
console.log("- Server GPS fallback contract remains available");
console.log("- Attendance API auth guards remain before DB work");
console.log("- Offline attendance, readiness, manifest and service-worker files are present");
