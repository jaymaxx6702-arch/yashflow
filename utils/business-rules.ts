export type AttendanceCanonicalRow = {
  employee_id: string;
  attendance_date: string;
  check_in?: string | null;
  check_out?: string | null;
};

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Select one stable attendance row for an employee/date.
 * Priority:
 * 1. Checked-out row (final attendance)
 * 2. Latest check-in
 * 3. First available row
 */
export function pickCanonicalAttendance<T extends AttendanceCanonicalRow>(
  rows: T[]
): T | null {
  if (!rows.length) return null;

  return [...rows].sort((a, b) => {
    const checkoutDiff = Number(Boolean(b.check_out)) - Number(Boolean(a.check_out));
    if (checkoutDiff !== 0) return checkoutDiff;

    const checkinDiff = timestamp(b.check_in) - timestamp(a.check_in);
    if (checkinDiff !== 0) return checkinDiff;

    return 0;
  })[0] || null;
}

export function canonicalAttendanceMap<T extends AttendanceCanonicalRow>(
  rows: T[]
) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = `${row.employee_id}|${row.attendance_date}`;
    const current = grouped.get(key) || [];
    current.push(row);
    grouped.set(key, current);
  }

  const result = new Map<string, T>();

  for (const [key, group] of grouped) {
    const canonical = pickCanonicalAttendance(group);
    if (canonical) result.set(key, canonical);
  }

  return result;
}

export function indiaDateKey(value: string | Date | null | undefined) {
  if (!value) return "";

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return typeof value === "string" ? value.slice(0, 10) : "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
