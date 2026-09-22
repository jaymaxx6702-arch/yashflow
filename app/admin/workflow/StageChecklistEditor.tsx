"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

function checklistError(prefix: string, value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
      ? value
      : "Unknown checklist error.";

  if (
    /workflow_template_stage_id|stage_checklist_items|snapshot_item_id|order_stage_checklist|PGRST204|42703/i.test(
      message
    )
  ) {
    return `${prefix}: Stage Checklist database repair required. Admin SQL repair run કર્યા પછી ફરી try કરો. (${message})`;
  }

  return `${prefix}: ${message}`;
}

type ChecklistItem = {
  id: string;
  workflow_template_stage_id: string;
  label: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
};

export default function StageChecklistEditor({
  templateStageId,
  stageName,
}: {
  templateStageId: string;
  stageName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newRequired, setNewRequired] = useState(true);

  async function loadItems() {
    setLoading(true);
    setMessage("");

    const supabase = createClient();
    const { data, error } = await supabase
      .from("stage_checklist_items")
      .select(
        "id, workflow_template_stage_id, label, sort_order, is_required, is_active"
      )
      .eq("workflow_template_stage_id", templateStageId)
      .order("sort_order");

    if (error) {
      setMessage(checklistError("Checklist Load Error", error.message));
      setLoading(false);
      return;
    }

    setItems((data || []) as ChecklistItem[]);
    setLoaded(true);
    setLoading(false);
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);

    if (next && !loaded && !loading) {
      await loadItems();
    }
  }

  async function addItem() {
    const label = newLabel.trim();
    if (!label) {
      setMessage("Checklist Step લખો.");
      return;
    }

    setSaving(true);
    setMessage("");

    const nextSort =
      items.length > 0
        ? Math.max(...items.map((item) => item.sort_order)) + 10
        : 10;

    const supabase = createClient();
    const { error } = await supabase.from("stage_checklist_items").insert({
      workflow_template_stage_id: templateStageId,
      label,
      sort_order: nextSort,
      is_required: newRequired,
      is_active: true,
    });

    if (error) {
      setMessage(checklistError("Checklist Add Error", error.message));
      setSaving(false);
      return;
    }

    setNewLabel("");
    setNewRequired(true);
    await loadItems();
    setMessage("Checklist Step Added ✅");
    setSaving(false);
  }

  async function updateItem(
    item: ChecklistItem,
    patch: Partial<ChecklistItem>
  ) {
    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("stage_checklist_items")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      setMessage(checklistError("Checklist Update Error", error.message));
      setSaving(false);
      return;
    }

    await loadItems();
    setSaving(false);
  }

  async function editLabel(item: ChecklistItem) {
    const value = window.prompt("Checklist Step બદલો:", item.label);
    if (value === null) return;

    const label = value.trim();
    if (!label) {
      setMessage("Checklist Step ખાલી ન હોઈ શકે.");
      return;
    }

    await updateItem(item, { label });
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 overflow-hidden">
      <button
        type="button"
        onClick={() => void toggleOpen()}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-xs font-black text-amber-800">
            STAGE CHECKLIST / SOP
          </p>
          <p className="text-xs text-amber-700 mt-1">
            {stageName} માટે quality steps અહીં જ manage કરો.
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-black text-amber-800">
          {open ? "Close ▲" : "Manage ▼"}
        </span>
      </button>

      {open && (
        <div className="border-t border-amber-200 bg-white p-4">
          {message && (
            <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
              {message}
            </div>
          )}

          {loading ? (
            <p className="text-sm font-bold text-slate-500">
              Checklist લોડ થઈ રહી છે...
            </p>
          ) : (
            <>
              <div className="grid md:grid-cols-[1fr_auto_auto] gap-2">
                <input
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  className="yf-input"
                  placeholder="Example: Size Check / Print Check"
                />

                <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2 cursor-pointer text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={newRequired}
                    onChange={(event) =>
                      setNewRequired(event.target.checked)
                    }
                  />
                  Required
                </label>

                <button
                  type="button"
                  onClick={() => void addItem()}
                  disabled={saving}
                  className="yf-btn yf-btn-primary disabled:opacity-50"
                >
                  + Add Step
                </button>
              </div>

              <div className="space-y-2 mt-4">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col lg:flex-row lg:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900">
                        {index + 1}. {item.label}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <span className="text-[10px] font-black rounded-full bg-white border border-slate-200 px-2 py-1">
                          {item.is_required ? "Required" : "Optional"}
                        </span>
                        <span className="text-[10px] font-black rounded-full bg-white border border-slate-200 px-2 py-1">
                          {item.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void editLabel(item)}
                        className="yf-btn yf-btn-secondary yf-btn-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void updateItem(item, {
                            is_required: !item.is_required,
                          })
                        }
                        className="yf-btn yf-btn-secondary yf-btn-sm"
                      >
                        {item.is_required
                          ? "Make Optional"
                          : "Make Required"}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void updateItem(item, {
                            is_active: !item.is_active,
                          })
                        }
                        className="yf-btn yf-btn-warning yf-btn-sm"
                      >
                        {item.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm font-bold text-slate-400">
                    આ Stage માટે checklist હજી બનાવેલી નથી.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
