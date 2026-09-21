"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  getOfflineActionsForEmployee,
  getOfflineQueueSummary,
  isLikelyNetworkError,
  markOfflineActionError,
  markOfflineActionNeedsReview,
  offlineQueueEventName,
  removeOfflineAction,
  retryNeedsReviewActions,
  type OfflineAction,
} from "@/utils/offline-queue";

function normalizedNullable(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

async function executeAction(
  action: OfflineAction,
  currentEmployeeId: string
) {
  if (action.ownerEmployeeId !== currentEmployeeId) {
    throw new Error(
      "Offline action belongs to another employee. Review required."
    );
  }

  const supabase = createClient();

  if (
    action.type === "attendance_check_in" ||
    action.type === "attendance_check_out"
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Session મળ્યો નથી. ફરી login કરો.");
    }

    const endpoint =
      action.type === "attendance_check_in"
        ? "/api/attendance/check-in"
        : "/api/attendance/check-out";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        ...action.payload,
        client_action_at: action.queuedAt,
        offline_action_id: action.id,
        business_date: action.businessDate,
      }),
    });

    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok && response.status !== 409) {
      throw new Error(result.error || "Attendance sync failed.");
    }

    return;
  }

  if (action.type === "task_status") {
    const taskId = String(action.payload.taskId || "");
    const nextStatus = String(action.payload.status || "");
    const expectedStatus = String(
      action.payload.expectedStatus || ""
    );
    const expectedUpdatedAt = String(
      action.payload.expectedUpdatedAt || ""
    );

    const { data: current, error: loadError } = await supabase
      .from("tasks")
      .select("id, status, started_at, updated_at")
      .eq("id", taskId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!current) {
      throw new Error("Task હવે મળતો નથી. Manual review જરૂરી છે.");
    }

    if (current.status === nextStatus) return;

    if (expectedStatus && current.status !== expectedStatus) {
      throw new Error(
        `Task status ${expectedStatus}થી ${current.status} થઈ ગયો છે. Offline change auto-overwrite નહીં થાય.`
      );
    }

    if (
      expectedUpdatedAt &&
      current.updated_at &&
      current.updated_at !== expectedUpdatedAt
    ) {
      throw new Error(
        "Task offline થયા પછી બદલાયો છે. Latest data review કર્યા વગર overwrite નહીં થાય."
      );
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
      updated_at: action.queuedAt,
    };

    if (nextStatus === "in_progress" && !current.started_at) {
      update.started_at = action.queuedAt;
    }

    if (nextStatus === "completed") {
      update.completed_at = action.queuedAt;
    } else {
      update.completed_at = null;
    }

    let query = supabase
      .from("tasks")
      .update(update)
      .eq("id", taskId);

    if (expectedStatus) {
      query = query.eq("status", expectedStatus);
    }

    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }

    const { data: updated, error } = await query
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);

    if (!updated) {
      throw new Error(
        "Task sync સમયે newer change મળ્યો. Offline action Needs Reviewમાં ખસેડાયો."
      );
    }

    return;
  }

  if (action.type === "task_note") {
    const taskId = String(action.payload.taskId || "");
    const nextNote =
      String(action.payload.note || "").trim() || null;
    const expectedEmployeeNote = normalizedNullable(
      action.payload.expectedEmployeeNote
    );

    const { data: current, error: loadError } = await supabase
      .from("tasks")
      .select("id, employee_note")
      .eq("id", taskId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!current) {
      throw new Error("Task હવે મળતો નથી. Manual review જરૂરી છે.");
    }

    const currentNote = normalizedNullable(current.employee_note);

    if (currentNote === nextNote) return;

    if (currentNote !== expectedEmployeeNote) {
      throw new Error(
        "Employee Note offline થયા પછી બદલાઈ ગઈ છે. Newer note overwrite નહીં થાય."
      );
    }

    const { data: updated, error } = await supabase
      .from("tasks")
      .update({
        employee_note: nextNote,
        updated_at: action.queuedAt,
      })
      .eq("id", taskId)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      throw new Error("Task Note sync થઈ નથી. Manual review જરૂરી છે.");
    }

    return;
  }

  if (action.type === "checklist_toggle") {
    const workId = String(action.payload.workId || "");
    const snapshotItemId = String(
      action.payload.snapshotItemId || action.payload.itemId || ""
    );
    const employeeId = String(action.payload.employeeId || "");
    const checked = Boolean(action.payload.checked);

    if (employeeId && employeeId !== currentEmployeeId) {
      throw new Error(
        "Checklist action બીજા employeeની છે. Review required."
      );
    }

    const { error } = await supabase
      .from("order_stage_checklist_checks")
      .upsert(
        {
          order_stage_work_id: workId,
          snapshot_item_id: snapshotItemId,
          employee_id: currentEmployeeId,
          is_checked: checked,
          checked_at: action.queuedAt,
          updated_at: action.queuedAt,
        },
        {
          onConflict: "order_stage_work_id,snapshot_item_id",
        }
      );

    if (error) throw new Error(error.message);
    return;
  }

  if (action.type === "order_start") {
    const workId = String(action.payload.workId || "");
    const employeeId = String(action.payload.employeeId || "");
    const fromStatus = String(action.payload.fromStatus || "assigned");

    if (employeeId && employeeId !== currentEmployeeId) {
      throw new Error(
        "Order action બીજા employeeની છે. Review required."
      );
    }

    const { error } = await supabase.rpc(
      "employee_start_stage_v1",
      {
        p_work_id: workId,
        p_expected_status: fromStatus,
        p_action_at: action.queuedAt,
        p_action_id: action.id,
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  if (action.type === "order_complete") {
    const workId = String(action.payload.workId || "");
    const employeeId = String(action.payload.employeeId || "");
    const waiveProof = Boolean(action.payload.waiveProof);

    if (employeeId && employeeId !== currentEmployeeId) {
      throw new Error(
        "Order completion બીજા employeeની છે. Review required."
      );
    }

    const { data: current, error: loadError } = await supabase
      .from("order_stage_work")
      .select("id, status, proof_waived")
      .eq("id", workId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!current) {
      throw new Error("Order Stage હવે મળતો નથી. Manual review જરૂરી છે.");
    }

    if (
      current.status === "completed" ||
      current.status === "ready_for_approval"
    ) {
      return;
    }

    if (current.status !== "in_progress") {
      throw new Error(
        `Stage હવે ${current.status} statusમાં છે. Manual review જરૂરી છે.`
      );
    }

    if (waiveProof && !current.proof_waived) {
      const { error: waiveError } = await supabase.rpc(
        "employee_waive_stage_proof",
        {
          p_work_id: workId,
          p_reason: `Offline action synced • ${action.id}`,
        }
      );

      if (waiveError) throw new Error(waiveError.message);
    }

    const { error } = await supabase.rpc(
      "employee_complete_stage_v4",
      {
        p_work_id: workId,
      }
    );

    if (error) throw new Error(error.message);
  }
}

export default function OfflineSync() {
  const [online, setOnline] = useState(true);
  const [employeeId, setEmployeeId] = useState("");
  const [pending, setPending] = useState(0);
  const [needsReview, setNeedsReview] = useState(0);
  const [lastError, setLastError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshSummary = useCallback((ownerId: string) => {
    if (!ownerId) {
      setPending(0);
      setNeedsReview(0);
      setLastError("");
      return;
    }

    const summary = getOfflineQueueSummary(ownerId);
    setPending(summary.pending);
    setNeedsReview(summary.needsReview);
    setLastError(summary.latestReviewError);
  }, []);

  const resolveEmployee = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setEmployeeId("");
      refreshSummary("");
      return "";
    }

    const { data: profile } = await supabase
      .from("employees")
      .select("id, approval_status, is_active")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    const nextId =
      profile?.approval_status === "approved" && profile?.is_active
        ? String(profile.id)
        : "";

    setEmployeeId(nextId);
    refreshSummary(nextId);
    return nextId;
  }, [refreshSummary]);

  const flush = useCallback(async () => {
    if (!employeeId) return;

    if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      setOnline(false);
      refreshSummary(employeeId);
      return;
    }

    const actions = getOfflineActionsForEmployee(employeeId).filter(
      (action) => action.state === "pending"
    );

    if (!actions.length || syncingRef.current) {
      refreshSummary(employeeId);
      return;
    }

    syncingRef.current = true;
    setSyncing(true);
    setLastError("");

    for (const action of actions) {
      try {
        await executeAction(action, employeeId);
        removeOfflineAction(action.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Sync failed";

        if (isLikelyNetworkError(error)) {
          markOfflineActionError(action.id, message);
          setLastError(message);
          break;
        }

        markOfflineActionNeedsReview(action.id, message);
        setLastError(message);
        continue;
      }
    }

    refreshSummary(employeeId);
    syncingRef.current = false;
    setSyncing(false);
  }, [employeeId, refreshSummary]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void resolveEmployee();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void resolveEmployee();
      }, 0);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resolveEmployee]);

  useEffect(() => {
    if (!employeeId) return;

    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => {
      setOnline(false);
      refreshSummary(employeeId);
    };
    const onQueueChanged = () => {
      refreshSummary(employeeId);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(
      offlineQueueEventName(),
      onQueueChanged
    );

    refreshSummary(employeeId);

    if (
      navigator.onLine &&
      getOfflineQueueSummary(employeeId).pending > 0
    ) {
      void flush();
    }

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(
        offlineQueueEventName(),
        onQueueChanged
      );
    };
  }, [employeeId, flush, refreshSummary]);

  function retryReview() {
    if (!employeeId) return;
    retryNeedsReviewActions(employeeId);
    refreshSummary(employeeId);
    void flush();
  }

  if (
    !employeeId ||
    (online && pending === 0 && needsReview === 0 && !syncing)
  ) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[120] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-slate-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black">
            {!online
              ? `📴 Offline • Pending Sync: ${pending}`
              : syncing
              ? "🔄 Pending actions sync થઈ રહ્યા છે..."
              : needsReview > 0
              ? `⚠️ Needs Review: ${needsReview} • Pending: ${pending}`
              : `☁️ Pending Sync: ${pending}`}
          </p>

          {lastError && (
            <p className="mt-1 text-[11px] font-semibold text-amber-200 line-clamp-2">
              {lastError}
            </p>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          {online && pending > 0 && (
            <button
              type="button"
              onClick={() => void flush()}
              disabled={syncing}
              className="yf-btn yf-btn-primary yf-btn-sm"
            >
              {syncing ? "Syncing..." : "Sync"}
            </button>
          )}

          {online && needsReview > 0 && (
            <button
              type="button"
              onClick={retryReview}
              disabled={syncing}
              className="yf-btn yf-btn-warning yf-btn-sm"
            >
              Retry Review
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
