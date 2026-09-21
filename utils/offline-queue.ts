export type OfflineActionType =
  | "attendance_check_in"
  | "attendance_check_out"
  | "task_status"
  | "task_note"
  | "order_start"
  | "order_complete"
  | "checklist_toggle";

export type OfflineActionState = "pending" | "needs_review";

export type OfflineAction = {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  ownerEmployeeId: string;
  businessDate: string;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
  lastTriedAt: string | null;
  state: OfflineActionState;
};

export type OfflineQueueContext = {
  ownerEmployeeId: string;
  businessDate?: string;
};

const STORAGE_KEY = "yashflow-offline-actions-v2";
const LEGACY_STORAGE_KEY = "yashflow-offline-actions-v1";
const EVENT_NAME = "yashflow-offline-queue-changed";

export function indiaBusinessDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function normalizeAction(value: unknown): OfflineAction | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Partial<OfflineAction>;
  if (!row.id || !row.type || !row.queuedAt) return null;

  const ownerEmployeeId =
    typeof row.ownerEmployeeId === "string"
      ? row.ownerEmployeeId
      : "";

  const queuedAt = String(row.queuedAt);
  const queuedDate = new Date(queuedAt);

  return {
    id: String(row.id),
    type: row.type as OfflineActionType,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    ownerEmployeeId,
    businessDate:
      typeof row.businessDate === "string" && row.businessDate
        ? row.businessDate
        : indiaBusinessDate(
            Number.isNaN(queuedDate.getTime()) ? new Date() : queuedDate
          ),
    queuedAt,
    attempts: Number(row.attempts || 0),
    lastError:
      typeof row.lastError === "string" ? row.lastError : null,
    lastTriedAt:
      typeof row.lastTriedAt === "string" ? row.lastTriedAt : null,
    state:
      ownerEmployeeId && row.state !== "needs_review"
        ? "pending"
        : "needs_review",
  };
}

function safeParse(raw: string | null): OfflineAction[] {
  if (!raw) return [];

  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    return value
      .map(normalizeAction)
      .filter((action): action is OfflineAction => Boolean(action));
  } catch {
    return [];
  }
}

function saveOfflineActions(actions: OfflineAction[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

function migrateLegacyActions() {
  if (typeof window === "undefined") return;

  const current = safeParse(window.localStorage.getItem(STORAGE_KEY));
  if (current.length > 0) return;

  const legacy = safeParse(
    window.localStorage.getItem(LEGACY_STORAGE_KEY)
  );

  if (legacy.length > 0) {
    saveOfflineActions(
      legacy.map((action) => ({
        ...action,
        ownerEmployeeId: "",
        state: "needs_review",
        lastError:
          action.lastError ||
          "Legacy offline action has no employee owner. Review required.",
      }))
    );
  }

  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function getOfflineActions(): OfflineAction[] {
  if (typeof window === "undefined") return [];

  migrateLegacyActions();
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function getOfflineActionsForEmployee(employeeId: string) {
  if (!employeeId) return [];

  return getOfflineActions().filter(
    (action) => action.ownerEmployeeId === employeeId
  );
}

export function getOfflineQueueSummary(employeeId: string) {
  const actions = getOfflineActionsForEmployee(employeeId);

  return {
    pending: actions.filter((action) => action.state === "pending")
      .length,
    needsReview: actions.filter(
      (action) => action.state === "needs_review"
    ).length,
    latestReviewError:
      actions
        .filter((action) => action.state === "needs_review")
        .sort(
          (a, b) =>
            new Date(b.queuedAt).getTime() -
            new Date(a.queuedAt).getTime()
        )[0]?.lastError || "",
  };
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
  payload: Record<string, unknown>,
  context: OfflineQueueContext
) {
  if (!context.ownerEmployeeId) {
    throw new Error("Offline action owner employee is required.");
  }

  const current = getOfflineActions();
  const businessDate =
    context.businessDate || indiaBusinessDate(new Date());

  if (
    (type === "attendance_check_in" ||
      type === "attendance_check_out")
  ) {
    const existing = current.find(
      (action) =>
        action.ownerEmployeeId === context.ownerEmployeeId &&
        action.businessDate === businessDate &&
        action.type === type &&
        action.state === "pending"
    );

    if (existing) return existing;
  }

  const action: OfflineAction = {
    id: createActionId(),
    type,
    payload,
    ownerEmployeeId: context.ownerEmployeeId,
    businessDate,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
    lastTriedAt: null,
    state: "pending",
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
            lastTriedAt: new Date().toISOString(),
          }
        : action
    )
  );
}

export function markOfflineActionNeedsReview(
  actionId: string,
  error: string
) {
  saveOfflineActions(
    getOfflineActions().map((action) =>
      action.id === actionId
        ? {
            ...action,
            state: "needs_review",
            attempts: action.attempts + 1,
            lastError: error,
            lastTriedAt: new Date().toISOString(),
          }
        : action
    )
  );
}

export function retryNeedsReviewActions(employeeId: string) {
  saveOfflineActions(
    getOfflineActions().map((action) =>
      action.ownerEmployeeId === employeeId &&
      action.state === "needs_review"
        ? {
            ...action,
            state: "pending",
            lastError: null,
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

  return /failed to fetch|network|load failed|fetch failed|offline|timeout|timed out/i.test(
    message
  );
}
