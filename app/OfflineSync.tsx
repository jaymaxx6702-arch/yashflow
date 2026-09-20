"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  getOfflineActions,
  markOfflineActionError,
  offlineQueueEventName,
  removeOfflineAction,
  type OfflineAction,
} from "@/utils/offline-queue";

async function executeAction(action: OfflineAction) {
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
    const actionAt = action.queuedAt;

    const { data: current, error: loadError } = await supabase
      .from("tasks")
      .select("id, status, started_at")
      .eq("id", taskId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!current) return;

    if (current.status === nextStatus) return;

    const update: Record<string, unknown> = {
      status: nextStatus,
      updated_at: actionAt,
    };

    if (nextStatus === "in_progress" && !current.started_at) {
      update.started_at = actionAt;
    }

    if (nextStatus === "completed") {
      update.completed_at = actionAt;
    } else {
      update.completed_at = null;
    }

    const { error } = await supabase
      .from("tasks")
      .update(update)
      .eq("id", taskId);

    if (error) throw new Error(error.message);
    return;
  }

  if (action.type === "task_note") {
    const { error } = await supabase
      .from("tasks")
      .update({
        employee_note:
          String(action.payload.note || "").trim() || null,
        updated_at: action.queuedAt,
      })
      .eq("id", String(action.payload.taskId || ""));

    if (error) throw new Error(error.message);
    return;
  }

  if (action.type === "checklist_toggle") {
    const workId = String(action.payload.workId || "");
    const itemId = String(action.payload.itemId || "");
    const employeeId = String(action.payload.employeeId || "");
    const checked = Boolean(action.payload.checked);

    const { error } = await supabase
      .from("order_stage_checklist_checks")
      .upsert(
        {
          order_stage_work_id: workId,
          checklist_item_id: itemId,
          employee_id: employeeId || null,
          is_checked: checked,
          checked_at: action.queuedAt,
          updated_at: action.queuedAt,
        },
        {
          onConflict: "order_stage_work_id,checklist_item_id",
        }
      );

    if (error) throw new Error(error.message);
    return;
  }

  if (action.type === "order_start") {
    const workId = String(action.payload.workId || "");
    const orderId = String(action.payload.orderId || "");
    const stageId = String(action.payload.stageId || "");
    const employeeId = String(action.payload.employeeId || "");
    const fromStatus = String(action.payload.fromStatus || "assigned");

    const { data: current, error: loadError } = await supabase
      .from("order_stage_work")
      .select("id, status, started_at")
      .eq("id", workId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!current) return;
    if (current.status === "in_progress") return;

    const { data: updated, error } = await supabase
      .from("order_stage_work")
      .update({
        status: "in_progress",
        started_at: current.started_at || action.queuedAt,
        updated_at: action.queuedAt,
      })
      .eq("id", workId)
      .eq("status", fromStatus)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      throw new Error("Stage status બદલાઈ ગયો છે. Refresh જરૂરી છે.");
    }

    await supabase
      .from("orders")
      .update({
        workflow_status: "in_progress",
        updated_at: action.queuedAt,
      })
      .eq("id", orderId);

    await supabase.from("order_workflow_history").insert({
      order_id: orderId,
      order_stage_work_id: workId,
      action_type: "employee_started_work_offline_sync",
      from_stage_id: stageId,
      to_stage_id: stageId,
      from_status: fromStatus,
      to_status: "in_progress",
      employee_id: employeeId || null,
      note: "Offline action synced",
    });

    return;
  }

  if (action.type === "order_complete") {
    const workId = String(action.payload.workId || "");
    const waiveProof = Boolean(action.payload.waiveProof);

    if (waiveProof) {
      const { error: waiveError } = await supabase.rpc(
        "employee_waive_stage_proof",
        {
          p_work_id: workId,
          p_reason: "Offline action synced; proof UI disabled",
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
    return;
  }
}

export default function OfflineSync() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState("");

  const refreshPending = useCallback(() => {
    setPending(getOfflineActions().length);
  }, []);

  const flush = useCallback(async () => {
    if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      setOnline(false);
      refreshPending();
      return;
    }

    const actions = getOfflineActions();
    if (!actions.length || syncing) {
      refreshPending();
      return;
    }

    setSyncing(true);
    setLastError("");

    for (const action of actions) {
      try {
        await executeAction(action);
        removeOfflineAction(action.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Sync failed";
        markOfflineActionError(action.id, message);
        setLastError(message);
        break;
      }
    }

    refreshPending();
    setSyncing(false);
  }, [refreshPending, syncing]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refreshPending();

    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => {
      setOnline(false);
      refreshPending();
    };
    const onQueueChanged = () => {
      refreshPending();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(
      offlineQueueEventName(),
      onQueueChanged
    );

    if (navigator.onLine && getOfflineActions().length > 0) {
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
  }, [flush, refreshPending]);

  if (online && pending === 0 && !syncing) {
    return null;
  }

  return (
    <div className="fixed bottom-3 left-3 right-3 z-[120] mx-auto max-w-xl rounded-2xl border border-slate-200 bg-slate-950/95 px-4 py-3 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black">
            {!online
              ? "📴 Offline — actions deviceમાં safe છે"
              : syncing
              ? "🔄 Pending actions sync થઈ રહ્યા છે..."
              : `☁️ Pending Sync: ${pending}`}
          </p>
          {lastError && (
            <p className="mt-1 text-[11px] font-semibold text-amber-200 line-clamp-2">
              {lastError}
            </p>
          )}
        </div>

        {online && pending > 0 && (
          <button
            type="button"
            onClick={() => void flush()}
            disabled={syncing}
            className="yf-btn yf-btn-primary yf-btn-sm shrink-0"
          >
            {syncing ? "Syncing..." : "Retry"}
          </button>
        )}
      </div>
    </div>
  );
}
