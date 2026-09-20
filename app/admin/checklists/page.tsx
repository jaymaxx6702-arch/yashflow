"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Template = {
  id: string;
  name: string;
  product_id: string | null;
  is_active: boolean;
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

export default function AdminStageChecklistsPage() {
  const router = useRouter();
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

  const stageMap = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage.name])),
    [stages]
  );

  const templateMap = useMemo(
    () => new Map(templates.map((template) => [template.id, template.name])),
    [templates]
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
          .select("id, name, product_id, is_active")
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
      setMessage(`Checklist Load Error: ${error.message}`);
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
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: admin, error } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (
        error ||
        !admin ||
        admin.role !== "admin" ||
        admin.approval_status !== "approved" ||
        !admin.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      await loadData();
      setLoading(false);
    }

    void init();
  }, [router]);

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
      setMessage(`Checklist Add Error: ${error.message}`);
      setSaving(false);
      return;
    }

    setNewLabel("");
    setNewRequired(true);
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
      setMessage(`Checklist Update Error: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadData();
    setSaving(false);
  }

  async function removeItem(item: ChecklistItem) {
    const confirmed = window.confirm(
      `"${item.label}" checklist item delete કરવો છે?`
    );
    if (!confirmed) return;

    const supabase = createClient();
    setSaving(true);

    const { error } = await supabase
      .from("stage_checklist_items")
      .delete()
      .eq("id", item.id);

    if (error) {
      setMessage(`Checklist Delete Error: ${error.message}`);
      setSaving(false);
      return;
    }

    await loadData();
    setMessage("Checklist Item Deleted ✅");
    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Stage Checklists લોડ થઈ રહ્યા છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              SOP / QUALITY CONTROL
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Stage Checklists
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Product Workflowના દરેક Stage માટે required quality steps.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn yf-btn-secondary"
          >
            ← Admin
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="yf-card p-5">
          <label className="block text-xs font-black text-slate-500 mb-2">
            PRODUCT WORKFLOW / STAGE
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

          <div className="mt-5 grid md:grid-cols-[1fr_auto_auto] gap-3">
            <input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              className="yf-input"
              placeholder="Example: Size Check / Design Check / Print Ready"
            />

            <label className="yf-card px-4 py-3 flex items-center gap-2 cursor-pointer">
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
              className="yf-btn yf-btn-primary"
            >
              + Add Step
            </button>
          </div>
        </section>

        <section className="mt-4 space-y-3">
          {selectedItems.map((item, index) => (
            <article key={item.id} className="yf-card p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black">
                  {index + 1}
                </div>

                <div className="flex-1">
                  <p className="font-black text-slate-900">{item.label}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
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

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateItem(item, { is_required: !item.is_required })
                    }
                    className="yf-btn yf-btn-secondary yf-btn-sm"
                  >
                    {item.is_required ? "Make Optional" : "Make Required"}
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      updateItem(item, { is_active: !item.is_active })
                    }
                    className="yf-btn yf-btn-warning yf-btn-sm"
                  >
                    {item.is_active ? "Deactivate" : "Activate"}
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeItem(item)}
                    className="yf-btn yf-btn-danger yf-btn-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}

          {selectedItems.length === 0 && (
            <div className="yf-card p-10 text-center text-slate-400 font-bold">
              આ Stage માટે checklist હજી બનાવેલી નથી.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
