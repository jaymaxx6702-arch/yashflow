"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Template = {
  id: string;
  name: string;
};

type TemplateStage = {
  id: string;
  template_id: string;
  stage_id: string;
  sequence_no: number;
};

type Stage = {
  id: string;
  name: string;
};

type ChecklistItem = {
  id: string;
  workflow_template_stage_id: string;
  label: string;
  sort_order: number;
  is_required: boolean;
  is_active: boolean;
};

function checklistError(prefix: string, value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
      ? value
      : "Unknown checklist error.";

  return `${prefix}: ${message}`;
}

export default function StageChecklistManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateStages, setTemplateStages] = useState<TemplateStage[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [selectedTemplateStageId, setSelectedTemplateStageId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRequired, setNewRequired] = useState(true);

  const templateMap = useMemo(
    () => new Map(templates.map((item) => [item.id, item.name])),
    [templates]
  );

  const stageMap = useMemo(
    () => new Map(stages.map((item) => [item.id, item.name])),
    [stages]
  );

  const selectedItems = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.workflow_template_stage_id === selectedTemplateStageId
        )
        .sort((a, b) => a.sort_order - b.sort_order),
    [items, selectedTemplateStageId]
  );

  async function loadData() {
    const supabase = createClient();

    const [templatesResult, templateStagesResult, stagesResult, itemsResult] =
      await Promise.all([
        supabase
          .from("workflow_templates")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("workflow_template_stages")
          .select("id, template_id, stage_id, sequence_no")
          .order("sequence_no"),
        supabase
          .from("workflow_stages")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("stage_checklist_items")
          .select(
            "id, workflow_template_stage_id, label, sort_order, is_required, is_active"
          )
          .order("sort_order"),
      ]);

    const error =
      templatesResult.error ||
      templateStagesResult.error ||
      stagesResult.error ||
      itemsResult.error;

    if (error) {
      setMessage(checklistError("Checklist Load Error", error.message));
      setLoading(false);
      return;
    }

    const templateData = (templatesResult.data || []) as Template[];
    const templateStageData =
      (templateStagesResult.data || []) as TemplateStage[];

    setTemplates(templateData);
    setTemplateStages(templateStageData);
    setStages((stagesResult.data || []) as Stage[]);
    setItems((itemsResult.data || []) as ChecklistItem[]);

    setSelectedTemplateStageId((current) => {
      if (
        current &&
        templateStageData.some((item) => item.id === current)
      ) {
        return current;
      }

      return templateStageData[0]?.id || "";
    });

    setLoading(false);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function addItem() {
    const label = newLabel.trim();
    if (!selectedTemplateStageId || !label) {
      setMessage("Stage અને Checklist Item બંને જરૂરી છે.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const nextSort =
      selectedItems.length > 0
        ? Math.max(...selectedItems.map((item) => item.sort_order)) + 10
        : 10;

    const { error } = await supabase.from("stage_checklist_items").insert({
      workflow_template_stage_id: selectedTemplateStageId,
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
    await loadData();
    setMessage("Checklist Item Added ✅");
    setSaving(false);
  }

  async function updateItem(
    item: ChecklistItem,
    patch: Partial<ChecklistItem>
  ) {
    const supabase = createClient();
    setSaving(true);
    setMessage("");

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

    await loadData();
    setSaving(false);
  }

  async function deleteItem(item: ChecklistItem) {
    if (
      !window.confirm(
        `Delete checklist item "${item.label}" permanently? Existing Order snapshots unchanged રહેશે.`
      )
    ) {
      return;
    }

    const supabase = createClient();
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("stage_checklist_items")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(checklistError("Checklist Delete Error", error.message));
      setSaving(false);
      return;
    }

    await loadData();
    setMessage("Checklist Item Deleted ✅");
    setSaving(false);
  }

  if (loading) {
    return (
      <section className="yf-card p-5 font-bold text-slate-600">
        Stage Checklist લોડ થઈ રહ્યું છે...
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {message && (
        <div className="yf-alert yf-alert-info">{message}</div>
      )}

      <div className="yf-card p-5">
        <p className="text-xs font-black tracking-[0.15em] text-emerald-700">
          STAGE CHECKLIST
        </p>
        <h2 className="yf-section-title mt-1">
          Work Order Quality Steps
        </h2>
        <p className="yf-section-subtitle mt-1">
          દરેક Workflow Stage માટે required/optional checklist અહીં manage કરો.
        </p>

        <label className="block text-xs font-black text-slate-500 mt-5 mb-2">
          WORKFLOW / STAGE
        </label>
        <select
          value={selectedTemplateStageId}
          onChange={(event) => setSelectedTemplateStageId(event.target.value)}
          className="yf-input"
        >
          {templateStages.map((item) => (
            <option key={item.id} value={item.id}>
              {templateMap.get(item.template_id) || "Workflow"} →{" "}
              {stageMap.get(item.stage_id) || "Stage"}
            </option>
          ))}
        </select>

        <div className="mt-4 grid sm:grid-cols-[1fr_auto_auto] gap-3">
          <input
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            className="yf-input"
            placeholder="Example: Design approved / Size checked"
          />

          <label className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newRequired}
              onChange={(event) => setNewRequired(event.target.checked)}
            />
            <span className="text-sm font-black">Required</span>
          </label>

          <button
            type="button"
            onClick={addItem}
            disabled={saving || !selectedTemplateStageId}
            className="yf-btn yf-btn-primary justify-center"
          >
            + Add Step
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {selectedItems.length === 0 ? (
          <div className="yf-card p-5 text-center text-sm font-bold text-slate-500">
            આ Stage માટે checklist item નથી.
          </div>
        ) : (
          selectedItems.map((item, index) => (
            <article key={item.id} className="yf-card p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center font-black shrink-0">
                  {index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-black text-sm text-slate-900">
                    {item.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span
                      className={`yf-badge ${
                        item.is_required
                          ? "yf-badge-orange"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.is_required ? "Required" : "Optional"}
                    </span>
                    <span
                      className={`yf-badge ${
                        item.is_active
                          ? "yf-badge-green"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-1.5">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateItem(item, { is_required: !item.is_required })
                    }
                    className="yf-btn yf-btn-secondary yf-btn-sm"
                  >
                    {item.is_required ? "Optional" : "Required"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateItem(item, { is_active: !item.is_active })
                    }
                    className="yf-btn yf-btn-warning yf-btn-sm"
                  >
                    {item.is_active ? "Off" : "On"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => deleteItem(item)}
                    className="yf-btn yf-btn-danger yf-btn-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
