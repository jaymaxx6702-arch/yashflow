export type OfflineActionType =
  | "attendance_check_in"
  | "attendance_check_out"
  | "task_status"
  | "task_note"
  | "order_start"
  | "order_complete"
  | "checklist_toggle";

export type OfflineAction = {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
};

const STORAGE_KEY = "yashflow-offline-actions-v1";
const EVENT_NAME = "yashflow-offline-queue-changed";

function safeParse(raw: string | null): OfflineAction[] {
  if (!raw) return [];

  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as OfflineAction[]) : [];
  } catch {
    return [];
  }
}

export function getOfflineActions(): OfflineAction[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

function saveOfflineActions(actions: OfflineAction[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function createActionId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `yf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function enqueueOfflineAction(
  type: OfflineActionType,
  payload: Record<string, unknown>
) {
  const current = getOfflineActions();

  if (
    (type === "attendance_check_in" ||
      type === "attendance_check_out") &&
    current.some((action) => action.type === type)
  ) {
    return current.find((action) => action.type === type)!;
  }

  const action: OfflineAction = {
    id: createActionId(),
    type,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

  saveOfflineActions([...current, action]);
  return action;
}

export function removeOfflineAction(actionId: string) {
  saveOfflineActions(
    getOfflineActions().filter((action) => action.id !== actionId)
  );
}

export function markOfflineActionError(
  actionId: string,
  error: string
) {
  saveOfflineActions(
    getOfflineActions().map((action) =>
      action.id === actionId
        ? {
            ...action,
            attempts: action.attempts + 1,
            lastError: error,
          }
        : action
    )
  );
}

export function offlineQueueEventName() {
  return EVENT_NAME;
}

export function isLikelyNetworkError(value: unknown) {
  if (
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  ) {
    return true;
  }

  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
      ? value
      : "";

  return /failed to fetch|network|load failed|fetch failed|offline/i.test(
    message
  );
}
