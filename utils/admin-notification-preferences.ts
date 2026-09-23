export const ADMIN_NOTIFICATION_PREFERENCES = [
  {
    key: "notify.admin.orders",
    label: "Orders",
    description: "Order, stage and assignment alerts",
  },
  {
    key: "notify.admin.tasks",
    label: "Tasks",
    description: "Task and task-assignment alerts",
  },
  {
    key: "notify.admin.attendance",
    label: "Attendance",
    description: "Check-in/out and manual punch alerts",
  },
  {
    key: "notify.admin.leave",
    label: "Leave",
    description: "Leave request/status alerts",
  },
  {
    key: "notify.admin.escalations",
    label: "Escalations",
    description: "Stuck-work and escalation alerts",
  },
  {
    key: "notify.admin.inventory",
    label: "Inventory",
    description: "Stock and inventory alerts",
  },
  {
    key: "notify.admin.accounts",
    label: "Accounts",
    description: "Payment, billing and dispatch alerts",
  },
  {
    key: "notify.admin.system",
    label: "System",
    description: "Other YashFlow system alerts",
  },
] as const;

export type AdminNotificationPreferenceKey =
  (typeof ADMIN_NOTIFICATION_PREFERENCES)[number]["key"];

export function notificationPreferenceKey(
  notificationType: string | null | undefined,
  relatedType?: string | null
): AdminNotificationPreferenceKey {
  const type = String(notificationType || "").toLowerCase();
  const related = String(relatedType || "").toLowerCase();

  if (
    type.startsWith("order") ||
    related === "order"
  ) {
    return "notify.admin.orders";
  }

  if (
    type.startsWith("task") ||
    related === "task"
  ) {
    return "notify.admin.tasks";
  }

  if (
    type === "attendance" ||
    type.includes("manual_attendance") ||
    related === "attendance" ||
    related === "manual_attendance_request"
  ) {
    return "notify.admin.attendance";
  }

  if (
    type.startsWith("leave") ||
    related === "leave"
  ) {
    return "notify.admin.leave";
  }

  if (
    type === "escalation" ||
    related === "escalation"
  ) {
    return "notify.admin.escalations";
  }

  if (
    type.includes("inventory") ||
    type.includes("stock") ||
    related === "inventory"
  ) {
    return "notify.admin.inventory";
  }

  if (
    type.includes("payment") ||
    type.includes("billing") ||
    type.includes("dispatch") ||
    type.includes("account") ||
    related === "payment" ||
    related === "billing" ||
    related === "dispatch" ||
    related === "accounts"
  ) {
    return "notify.admin.accounts";
  }

  return "notify.admin.system";
}
