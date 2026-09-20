"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  enqueueOfflineAction,
  isLikelyNetworkError,
} from "@/utils/offline-queue";

type ChecklistItem = {
  id: string;
  label: string;
  sort_order: number;
  is_required: boolean;
};

type ChecklistCheck = {
  checklist_item_id: string;
  is_checked: boolean;
};

type Props = {
  workId: string;
  templateId: string | null;
  stageId: string;
  employeeId: string;
  canEdit: boolean;
};

export default function StageChecklist({
  workId,
  templateId,
  stageId,
  employeeId,
  canEdit,
}: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const completedCount = useMemo(
    () => items.filter((item) => checks[item.id]).length,
    [items, checks]
  );

  const requiredComplete = useMemo(
    () =>
      items
        .filter((item) => item.is_required)
        .every((item) => Boolean(checks[item.id])),
    [items, checks]
  );

  async function loadChecklist() {
    if (!templateId) {
      setItems([]);
      setChecks({});
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const { data: templateStage, error: templateError } = await supabase
      .from("workflow_template_stages")
      .select("id")
      .eq("template_id", templateId)
      .eq("stage_id", stageId)
      .order("sequence_no")
      .limit(1)
      .maybeSingle();

    if (templateError) {
      setMessage(`Checklist Load Error: ${templateError.message}`);
      setLoading(false);
      return;
    }

    if (!templateStage?.id) {
      setItems([]);
      setChecks({});
      setLoading(false);
      return;
    }

    const [itemsResult, checksResult] = await Promise.all([
      supabase
        .from("stage_checklist_items")
        .select("id, label, sort_order, is_required")
        .eq("workflow_template_stage_id", templateStage.id)
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("order_stage_checklist_checks")
        .select("checklist_item_id, is_checked")
        .eq("order_stage_work_id", workId),
    ]);

    const error = itemsResult.error || checksResult.error;
    if (error) {
      setMessage(`Checklist Load Error: ${error.message}`);
      setLoading(false);
      return;
    }

    const itemRows = (itemsResult.data || []) as ChecklistItem[];
    const checkRows = (checksResult.data || []) as ChecklistCheck[];
    const nextChecks: Record<string, boolean> = {};

    for (const item of itemRows) {
      nextChecks[item.id] = Boolean(
        checkRows.find(
          (check) => check.checklist_item_id === item.id
        )?.is_checked
      );
    }

    setItems(itemRows);
    setChecks(nextChecks);
    setLoading(false);
  }

  useEffect(() => {
    void loadChecklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workId, templateId, stageId]);

  async function toggleItem(item: ChecklistItem) {
    if (!canEdit) return;

    const nextChecked = !checks[item.id];

    setChecks((current) => ({
      ...current,
      [item.id]: nextChecked,
    }));
    setMessage("");

    const payload = {
      workId,
      itemId: item.id,
      employeeId,
      checked: nextChecked,
    };

    if (!navigator.onLine) {
      enqueueOfflineAction("checklist_toggle", payload);
      setMessage("Offline • Checklist change Pending Sync ☁️");
      return;
    }

    const supabase = createClient();
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("order_stage_checklist_checks")
      .upsert(
        {
          order_stage_work_id: workId,
          checklist_item_id: item.id,
          employee_id: employeeId,
          is_checked: nextChecked,
          checked_at: now,
          updated_at: now,
        },
        {
          onConflict: "order_stage_work_id,checklist_item_id",
        }
      );

    if (error) {
      if (isLikelyNetworkError(error.message)) {
        enqueueOfflineAction("checklist_toggle", payload);
        setMessage("Network weak • Checklist change Pending Sync ☁️");
        return;
      }

      setChecks((current) => ({
        ...current,
        [item.id]: !nextChecked,
      }));
      setMessage(`Checklist Error: ${error.message}`);
    }
  }

  if (loading || items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black tracking-[0.12em] text-amber-700">
            STAGE CHECKLIST
          </p>
          <p className="text-xs font-bold text-slate-600 mt-0.5">
            {completedCount}/{items.length} complete
          </p>
        </div>

        <span
          className={`yf-badge ${
            requiredComplete
              ? "yf-badge-green"
              : "yf-badge-orange"
          }`}
        >
          {requiredComplete ? "Ready ✓" : "Required Pending"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <label
            key={item.id}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
              checks[item.id]
                ? "border-green-200 bg-green-50"
                : "border-slate-200 bg-white"
            } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
          >
            <input
              type="checkbox"
              checked={Boolean(checks[item.id])}
              disabled={!canEdit}
              onChange={() => void toggleItem(item)}
              className="h-5 w-5"
            />

            <span className="flex-1 text-sm font-bold text-slate-800">
              {item.label}
            </span>

            {item.is_required && (
              <span className="text-[9px] font-black text-amber-700">
                REQUIRED
              </span>
            )}
          </label>
        ))}
      </div>

      {message && (
        <p className="mt-2 text-[11px] font-bold text-amber-800">
          {message}
        </p>
      )}
    </div>
  );
}
