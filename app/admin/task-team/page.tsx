"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  department: string | null;
};

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  admin_note: string | null;
  employee_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type SupportWorker = {
  id: string;
  task_id: string;
  employee_id: string;
  source: "manual" | "leave_handover";
  is_active: boolean;
};

type EditDraft = {
  assigned_to: string;
  priority: TaskPriority;
  due_date: string;
  status: TaskStatus;
  admin_note: string;
  support_employee_id: string;
};

function todayIndia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function TaskTeamCenterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [supports, setSupports] = useState<SupportWorker[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("open");
  const [drafts, setDrafts] = useState<Record<string, EditDraft>>({});

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees]
  );

  const supportByTask = useMemo(() => {
    const map = new Map<string, SupportWorker[]>();
    for (const support of supports) {
      if (!support.is_active) continue;
      const rows = map.get(support.task_id) || [];
      rows.push(support);
      map.set(support.task_id, rows);
    }
    return map;
  }, [supports]);

  async function loadData() {
    const supabase = createClient();
    const [employeeResult, taskResult, supportResult] = await Promise.all([
      supabase
        .from("employees")
        .select("id, full_name, department")
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .eq("is_hidden", false)
        .order("full_name"),
      supabase
        .from("tasks")
        .select("id, title, description, assigned_to, priority, status, due_date, admin_note, employee_note, started_at, completed_at, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("task_support_workers")
        .select("id, task_id, employee_id, source, is_active")
        .eq("is_active", true),
    ]);

    const firstError = employeeResult.error || taskResult.error || supportResult.error;
    if (firstError) {
      setMessage(`Task Team Load Error: ${firstError.message}`);
      return;
    }

    const employeeRows = (employeeResult.data || []) as Employee[];
    const taskRows = (taskResult.data || []) as Task[];
    const supportRows = (supportResult.data || []) as SupportWorker[];

    setEmployees(employeeRows);
    setTasks(taskRows);
    setSupports(supportRows);

    const nextDrafts: Record<string, EditDraft> = {};
    for (const task of taskRows) {
      nextDrafts[task.id] = {
        assigned_to: task.assigned_to,
        priority: task.priority,
        due_date: task.due_date || "",
        status: task.status,
        admin_note: task.admin_note || "",
        support_employee_id: "",
      };
    }
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        error ||
        !profile ||
        profile.role !== "admin" ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      await loadData();
      setLoading(false);
    }

    void init();
  }, [router]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayIndia();

    return tasks.filter((task) => {
      const employee = employeeMap.get(task.assigned_to);
      const matchesSearch =
        !q ||
        task.title.toLowerCase().includes(q) ||
        (task.description || "").toLowerCase().includes(q) ||
        (employee?.full_name || "").toLowerCase().includes(q) ||
        (employee?.department || "").toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (filter === "all") return true;
      if (filter === "open") return task.status === "pending" || task.status === "in_progress";
      if (filter === "overdue") {
        return Boolean(
          task.due_date &&
          task.due_date < today &&
          task.status !== "completed" &&
          task.status !== "cancelled"
        );
      }
      return task.status === filter;
    });
  }, [tasks, employeeMap, search, filter]);

  const overdueCount = useMemo(() => {
    const today = todayIndia();
    return tasks.filter(
      (task) =>
        task.due_date &&
        task.due_date < today &&
        task.status !== "completed" &&
        task.status !== "cancelled"
    ).length;
  }, [tasks]);

  function updateDraft(taskId: string, patch: Partial<EditDraft>) {
    setDrafts((current) => ({
      ...current,
      [taskId]: { ...current[taskId], ...patch },
    }));
  }

  async function saveTask(task: Task) {
    const draft = drafts[task.id];
    if (!draft) return;
    if (!draft.assigned_to) {
      setMessage("Primary Employee પસંદ કરો.");
      return;
    }

    setSavingId(task.id);
    setMessage("");
    const supabase = createClient();
    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
      assigned_to: draft.assigned_to,
      priority: draft.priority,
      due_date: draft.due_date || null,
      status: draft.status,
      admin_note: draft.admin_note.trim() || null,
      updated_at: now,
    };

    if (draft.status === "in_progress" && !task.started_at) update.started_at = now;
    if (draft.status === "completed") update.completed_at = now;
    if (draft.status !== "completed") update.completed_at = null;

    const { error } = await supabase.from("tasks").update(update).eq("id", task.id);
    if (error) {
      setMessage(`Task Save Error: ${error.message}`);
      setSavingId(null);
      return;
    }

    if (draft.assigned_to !== task.assigned_to) {
      await supabase
        .from("task_support_workers")
        .update({ is_active: false, removed_at: now })
        .eq("task_id", task.id)
        .eq("employee_id", draft.assigned_to)
        .eq("is_active", true);

      await supabase.from("notifications").insert({
        employee_id: draft.assigned_to,
        notification_type: "task_assignment",
        title: "Task Reassigned",
        message: `${task.title} હવે તમને Primary Employee તરીકે assign થયો છે.`,
        related_type: "task",
        related_id: task.id,
      });
    }

    setMessage(`${task.title} update થયો ✅`);
    await loadData();
    setSavingId(null);
  }

  async function addSupport(task: Task) {
    const draft = drafts[task.id];
    if (!draft?.support_employee_id) {
      setMessage("Support Employee પસંદ કરો.");
      return;
    }
    if (draft.support_employee_id === draft.assigned_to) {
      setMessage("Primary Employee અને Support Employee અલગ હોવા જોઈએ.");
      return;
    }

    setSavingId(`support-${task.id}`);
    setMessage("");
    const supabase = createClient();

    const { error } = await supabase.from("task_support_workers").upsert(
      {
        task_id: task.id,
        employee_id: draft.support_employee_id,
        source: "manual",
        is_active: true,
        removed_at: null,
      },
      { onConflict: "task_id,employee_id" }
    );

    if (error) {
      setMessage(`Support Add Error: ${error.message}`);
      setSavingId(null);
      return;
    }

    await supabase.from("notifications").insert({
      employee_id: draft.support_employee_id,
      notification_type: "task_assignment",
      title: "Task Support Assigned",
      message: `${task.title} માં તમને Support Employee તરીકે add કરવામાં આવ્યા છે.`,
      related_type: "task",
      related_id: task.id,
    });

    setMessage("Support Employee add થયો ✅");
    await loadData();
    setSavingId(null);
  }

  async function removeSupport(task: Task, support: SupportWorker) {
    setSavingId(`remove-${support.id}`);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase
      .from("task_support_workers")
      .update({ is_active: false, removed_at: new Date().toISOString() })
      .eq("id", support.id);

    if (error) {
      setMessage(`Support Remove Error: ${error.message}`);
      setSavingId(null);
      return;
    }

    setMessage("Support Employee remove થયો ✅");
    await loadData();
    setSavingId(null);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Task / Team Center લોડ થઈ રહ્યું છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">YASHFLOW TEAM WORK</p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">Task / Team Center</h1>
            <p className="text-sm text-blue-100 mt-1">Primary reassignment, Support Employee, priority, due date અને status એક જગ્યાએ.</p>
          </div>
          <button type="button" onClick={() => router.push("/admin")} className="yf-btn bg-white text-blue-700">← Admin</button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-5">{message}</div>}

        <section className="grid grid-cols-3 gap-3 mb-5">
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">OPEN</p><p className="text-3xl font-black text-blue-700 mt-1">{tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">OVERDUE</p><p className="text-3xl font-black text-red-700 mt-1">{overdueCount}</p></div>
          <div className="yf-card p-4"><p className="text-xs font-black text-slate-500">COMPLETED</p><p className="text-3xl font-black text-green-700 mt-1">{tasks.filter((t) => t.status === "completed").length}</p></div>
        </section>

        <section className="yf-card p-4 mb-5 grid gap-3 sm:grid-cols-[1fr_180px]">
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="yf-input" placeholder="Search Task / Employee / Department..." />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="yf-input">
            <option value="open">Open Tasks</option>
            <option value="overdue">Overdue</option>
            <option value="all">All Tasks</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </section>

        <section className="space-y-4">
          {filteredTasks.map((task) => {
            const draft = drafts[task.id];
            const activeSupports = supportByTask.get(task.id) || [];
            if (!draft) return null;

            return (
              <article key={task.id} className="yf-card p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="xl:w-[300px]">
                    <div className="flex flex-wrap gap-2">
                      <span className="yf-badge bg-blue-100 text-blue-700">{task.status.replace(/_/g, " ").toUpperCase()}</span>
                      <span className="yf-badge bg-slate-100 text-slate-700">{task.priority.toUpperCase()}</span>
                    </div>
                    <h2 className="text-lg font-black mt-2">{task.title}</h2>
                    <p className="text-sm text-slate-500 mt-1">{task.description || "No description"}</p>
                    {task.employee_note && <p className="text-xs text-slate-500 mt-2">Employee Note: {task.employee_note}</p>}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 flex-1">
                    <label className="block"><span className="text-xs font-black text-slate-500">Primary Employee</span><select value={draft.assigned_to} onChange={(e) => updateDraft(task.id, { assigned_to: e.target.value })} className="yf-input mt-1">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}{employee.department ? ` • ${employee.department}` : ""}</option>)}</select></label>
                    <label className="block"><span className="text-xs font-black text-slate-500">Priority</span><select value={draft.priority} onChange={(e) => updateDraft(task.id, { priority: e.target.value as TaskPriority })} className="yf-input mt-1"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
                    <label className="block"><span className="text-xs font-black text-slate-500">Due Date</span><input type="date" value={draft.due_date} onChange={(e) => updateDraft(task.id, { due_date: e.target.value })} className="yf-input mt-1" /></label>
                    <label className="block"><span className="text-xs font-black text-slate-500">Status</span><select value={draft.status} onChange={(e) => updateDraft(task.id, { status: e.target.value as TaskStatus })} className="yf-input mt-1"><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
                    <label className="block sm:col-span-2 xl:col-span-4"><span className="text-xs font-black text-slate-500">Admin Note</span><textarea rows={2} value={draft.admin_note} onChange={(e) => updateDraft(task.id, { admin_note: e.target.value })} className="yf-input mt-1 resize-none" /></label>
                    <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap gap-2 items-end">
                      <select value={draft.support_employee_id} onChange={(e) => updateDraft(task.id, { support_employee_id: e.target.value })} className="yf-input max-w-xs"><option value="">Add Support Employee...</option>{employees.filter((employee) => employee.id !== draft.assigned_to && !activeSupports.some((support) => support.employee_id === employee.id)).map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select>
                      <button type="button" onClick={() => void addSupport(task)} disabled={savingId === `support-${task.id}`} className="yf-btn yf-btn-secondary disabled:opacity-50">+ Support</button>
                      <button type="button" onClick={() => void saveTask(task)} disabled={savingId === task.id} className="yf-btn yf-btn-primary disabled:opacity-50 ml-auto">{savingId === task.id ? "Saving..." : "Save Task"}</button>
                    </div>
                  </div>
                </div>

                {activeSupports.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                    <span className="text-xs font-black text-slate-500 self-center">SUPPORT:</span>
                    {activeSupports.map((support) => (
                      <button key={support.id} type="button" onClick={() => void removeSupport(task, support)} disabled={savingId === `remove-${support.id}`} className="yf-badge bg-violet-100 text-violet-700 hover:bg-red-100 hover:text-red-700 disabled:opacity-50">
                        {employeeMap.get(support.employee_id)?.full_name || "Employee"} ×
                      </button>
                    ))}
                  </div>
                )}
              </article>
            );
          })}

          {filteredTasks.length === 0 && <div className="yf-card p-10 text-center font-bold text-slate-500">કોઈ matching task નથી.</div>}
        </section>
      </div>
    </main>
  );
}
