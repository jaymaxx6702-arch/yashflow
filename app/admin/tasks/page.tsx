"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
};

type TaskEmployee = {
  id: string;
  full_name: string;
  department: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_date: string | null;
  employee_note: string | null;
  admin_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  employees: TaskEmployee | null;
};

type TaskSupportWorker = {
  id: string;
  task_id: string;
  employee_id: string;
  source: "manual" | "leave_handover";
  is_active: boolean;
  created_at: string;
  removed_at: string | null;
};

export default function AdminTasksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [adminId, setAdminId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [supportWorkers, setSupportWorkers] = useState<TaskSupportWorker[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [newTaskSupport, setNewTaskSupport] = useState("");
  const [priority, setPriority] =
    useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState("");

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");

  const [supportPickers, setSupportPickers] = useState<Record<string, string>>(
    {}
  );
  const [actionId, setActionId] = useState<string | null>(null);

  const [message, setMessage] = useState("");

  async function loadEmployees() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("employees")
      .select(`
        id,
        full_name,
        mobile,
        department
      `)
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .eq("is_hidden", false)
      .order("full_name", {
        ascending: true,
      });

    if (error) {
      setMessage(`Employee Load Error: ${error.message}`);
      return;
    }

    setEmployees(data || []);
  }

  async function loadTasks() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("tasks")
      .select(`
        id,
        title,
        description,
        assigned_to,
        assigned_by,
        priority,
        status,
        due_date,
        employee_note,
        admin_note,
        started_at,
        completed_at,
        created_at,
        employees!tasks_assigned_to_fkey (
          id,
          full_name,
          department
        )
      `)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      setMessage(`Task Load Error: ${error.message}`);
      return;
    }

    setTasks((data || []) as unknown as Task[]);
  }

  async function loadSupportWorkers() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("task_support_workers")
      .select(`
        id,
        task_id,
        employee_id,
        source,
        is_active,
        created_at,
        removed_at
      `)
      .eq("is_active", true)
  
      .order("created_at", {
        ascending: true,
      });

    if (error) {
      setMessage(`Support Employee Load Error: ${error.message}`);
      return;
    }

    setSupportWorkers((data || []) as TaskSupportWorker[]);
  }

  async function refreshTasks() {
    await Promise.all([loadTasks(), loadSupportWorkers()]);
  }

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: adminProfile, error: adminError } = await supabase
        .from("employees")
        .select(`
          id,
          role,
          approval_status,
          is_active
        `)
        .eq("auth_user_id", user.id)
        .single();

      if (
        adminError ||
        !adminProfile ||
        adminProfile.role !== "admin" ||
        adminProfile.approval_status !== "approved" ||
        !adminProfile.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      setAdminId(adminProfile.id);

      await Promise.all([
        loadEmployees(),
        loadTasks(),
        loadSupportWorkers(),
      ]);

      setLoading(false);
    }

    loadPage();
  }, [router]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();

    employees.forEach((employee) => {
      map.set(employee.id, employee);
    });

    return map;
  }, [employees]);

  const supportByTask = useMemo(() => {
    const map = new Map<string, TaskSupportWorker[]>();

    supportWorkers.forEach((support) => {
      if (!support.is_active) return;

      const list = map.get(support.task_id) || [];
      list.push(support);
      map.set(support.task_id, list);
    });

    return map;
  }, [supportWorkers]);

  function getTaskSupport(taskId: string) {
    return supportByTask.get(taskId) || [];
  }

  function getAvailableSupportEmployees(task: Task) {
    const existingIds = new Set(
      getTaskSupport(task.id).map((support) => support.employee_id)
    );

    return employees.filter(
      (employee) =>
        employee.id !== task.assigned_to &&
        !existingIds.has(employee.id)
    );
  }


  async function handleCreateTask() {
    if (!title.trim()) {
      setMessage("Task Title જરૂરી છે.");
      return;
    }

    if (!assignedTo) {
      setMessage("Task કોને assign કરવો છે તે Employee પસંદ કરો.");
      return;
    }

    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    if (newTaskSupport && newTaskSupport === assignedTo) {
      setMessage("Primary Employee અને Support Employee અલગ હોવા જોઈએ.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { data: newTask, error } = await supabase
      .from("tasks")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo,
        assigned_by: adminId,
        priority,
        status: "pending",
        due_date: dueDate || null,
      })
      .select("id, title")
      .single();

    if (error || !newTask) {
      setMessage(`Task Create Error: ${error?.message || "Task create failed"}`);
      setSaving(false);
      return;
    }

    if (newTaskSupport) {
      const { error: supportError } = await supabase
        .from("task_support_workers")
        .upsert(
          {
            task_id: newTask.id,
            employee_id: newTaskSupport,
            added_by: adminId,
            source: "manual",
            is_active: true,
            removed_at: null,
          },
          {
            onConflict: "task_id,employee_id",
          }
        );

      if (supportError) {
        setMessage(
          `Task create થયો, પરંતુ Support Employee add ન થયો: ${supportError.message}`
        );
      }
    }

    setTitle("");
    setDescription("");
    setAssignedTo("");
    setNewTaskSupport("");
    setPriority("medium");
    setDueDate("");

    if (!newTaskSupport) {
      setMessage("Task સફળતાપૂર્વક assign થયો ✅");
    } else {
      setMessage("Task + Support Employee સફળતાપૂર્વક assign થયા ✅");
    }

    await refreshTasks();

    setSaving(false);
  }

  async function addSupportWorker(task: Task) {
    if (!adminId) return;

    const employeeId = supportPickers[task.id];

    if (!employeeId) {
      setMessage("Support Employee પસંદ કરો.");
      return;
    }

    if (employeeId === task.assigned_to) {
      setMessage("Primary Employee ને Support Employee બનાવી શકાતો નથી.");
      return;
    }

    setActionId(`support-add-${task.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("task_support_workers")
      .upsert(
        {
          task_id: task.id,
          employee_id: employeeId,
          added_by: adminId,
          source: "manual",
          is_active: true,
          removed_at: null,
        },
        {
          onConflict: "task_id,employee_id",
        }
      );

    if (error) {
      setMessage(`Support Employee Error: ${error.message}`);
      setActionId(null);
      return;
    }

    setSupportPickers((prev) => ({
      ...prev,
      [task.id]: "",
    }));

    setMessage("Support Employee add થયો ✅");

    await loadSupportWorkers();

    setActionId(null);
  }

  async function removeSupportWorker(
    task: Task,
    support: TaskSupportWorker
  ) {
    const employee = employeeMap.get(support.employee_id);
    const name = employee?.full_name || "આ Support Employee";

    const confirmed = window.confirm(
      `${name} ને "${task.title}" માંથી Support Employee તરીકે remove કરવો છે?`
    );

    if (!confirmed) return;

    setActionId(`support-remove-${support.id}`);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("task_support_workers")
      .update({
        is_active: false,
        removed_at: new Date().toISOString(),
      })
      .eq("id", support.id);

    if (error) {
      setMessage(`Support Remove Error: ${error.message}`);
      setActionId(null);
      return;
    }

    setMessage("Support Employee remove થયો ✅");

    await loadSupportWorkers();

    setActionId(null);
  }

  async function handleStatusChange(
    task: Task,
    newStatus:
      | "pending"
      | "in_progress"
      | "completed"
      | "cancelled"
  ) {
    const supabase = createClient();

    const updateData: {
      status: string;
      started_at?: string | null;
      completed_at?: string | null;
      updated_at: string;
    } = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === "in_progress" && !task.started_at) {
      updateData.started_at = new Date().toISOString();
    }

    if (newStatus === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    if (newStatus !== "completed") {
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", task.id);

    if (error) {
      setMessage(`Task Update Error: ${error.message}`);
      return;
    }

    setMessage("Task status update થયો ✅");

    await loadTasks();
  }

  function getPriorityStyle(priority: string) {
    if (priority === "urgent") {
      return "bg-red-100 text-red-700";
    }

    if (priority === "high") {
      return "bg-orange-100 text-orange-700";
    }

    if (priority === "low") {
      return "bg-slate-100 text-slate-600";
    }

    return "bg-blue-100 text-blue-700";
  }

  function getStatusStyle(status: string) {
    if (status === "completed") {
      return "bg-green-100 text-green-700";
    }

    if (status === "in_progress") {
      return "bg-blue-100 text-blue-700";
    }

    if (status === "cancelled") {
      return "bg-red-100 text-red-700";
    }

    return "bg-amber-100 text-amber-700";
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.status === "completed") return false;

      const statusMatch =
        filterStatus === "all" || task.status === filterStatus;

      const supportMatch = getTaskSupport(task.id).some(
        (support) => support.employee_id === filterEmployee
      );

      const employeeMatch =
        filterEmployee === "all" ||
        task.assigned_to === filterEmployee ||
        supportMatch;

      return statusMatch && employeeMatch;
    });
  }, [
    tasks,
    filterStatus,
    filterEmployee,
    supportByTask,
  ]);

  const pendingCount = tasks.filter(
    (task) => task.status === "pending"
  ).length;

  const progressCount = tasks.filter(
    (task) => task.status === "in_progress"
  ).length;

  const completedCount = tasks.filter(
    (task) => task.status === "completed"
  ).length;

  const urgentCount = tasks.filter(
    (task) =>
      task.priority === "urgent" &&
      task.status !== "completed" &&
      task.status !== "cancelled"
  ).length;

  const activeSupportCount = supportWorkers.filter(
    (support) => support.is_active
  ).length;

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Task Management લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Task Management
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/completed-tasks")}
              className="yf-btn bg-green-600 text-white hover:bg-green-500"
            >
              Completed Tasks
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="yf-btn border-white/20 bg-white/10 text-white hover:bg-white/20"
            >
              ← Admin Dashboard
            </button>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {message && (
          <div className="yf-alert yf-alert-info mb-5">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-5">
          <div className="yf-metric-card">
            <p className="text-sm font-semibold text-slate-500">
              Pending
            </p>

            <p className="text-3xl font-black mt-2 text-amber-600">
              {pendingCount}
            </p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm font-semibold text-slate-500">
              In Progress
            </p>

            <p className="text-3xl font-black mt-2 text-blue-600">
              {progressCount}
            </p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm font-semibold text-slate-500">
              Completed
            </p>

            <p className="text-3xl font-black mt-2 text-green-600">
              {completedCount}
            </p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm font-semibold text-slate-500">
              Urgent Open
            </p>

            <p className="text-3xl font-black mt-2 text-red-600">
              {urgentCount}
            </p>
          </div>

          <div className="yf-metric-card">
            <p className="text-sm font-semibold text-slate-500">
              Support Links
            </p>

            <p className="text-3xl font-black mt-2 text-purple-600">
              {activeSupportCount}
            </p>
          </div>
        </section>

        <section className="yf-card p-4 sm:p-6">
          <div>
            <h2 className="text-xl font-black text-slate-900">
              Assign New Task
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Primary Employee સાથે optional Support Employee પણ assign કરી શકો છો.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mt-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Task Title
              </label>

              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Example: Acrylic orders complete કરો"
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Primary Employee
              </label>

              <select
                value={assignedTo}
                onChange={(e) => {
                  const value = e.target.value;
                  setAssignedTo(value);

                  if (newTaskSupport === value) {
                    setNewTaskSupport("");
                  }
                }}
                className="yf-input"
              >
                <option value="">
                  Employee પસંદ કરો
                </option>

                {employees.map((employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {employee.full_name}
                    {employee.department
                      ? ` — ${employee.department}`
                      : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Support Employee
                <span className="text-slate-400 font-semibold">
                  {" "}— Optional
                </span>
              </label>

              <select
                value={newTaskSupport}
                onChange={(e) => setNewTaskSupport(e.target.value)}
                className="yf-input"
              >
                <option value="">
                  No Support Employee
                </option>

                {employees
                  .filter((employee) => employee.id !== assignedTo)
                  .map((employee) => (
                    <option
                      key={employee.id}
                      value={employee.id}
                    >
                      {employee.full_name}
                      {employee.department
                        ? ` — ${employee.department}`
                        : ""}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Priority
              </label>

              <select
                value={priority}
                onChange={(e) =>
                  setPriority(
                    e.target.value as
                      | "low"
                      | "medium"
                      | "high"
                      | "urgent"
                  )
                }
                className="yf-input"
              >
                <option value="low">
                  Low
                </option>

                <option value="medium">
                  Medium
                </option>

                <option value="high">
                  High
                </option>

                <option value="urgent">
                  Urgent
                </option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Due Date
              </label>

              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="yf-input"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Description
              </label>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Taskની વિગત લખો..."
                className="w-full border border-slate-300 rounded-xl px-4 py-3 resize-none"
              />
            </div>

            <div className="lg:col-span-2">
              <button
                type="button"
                onClick={handleCreateTask}
                disabled={saving}
                className="yf-btn yf-btn-primary px-6 disabled:opacity-50"
              >
                {saving
                  ? "Assigning..."
                  : "Assign Task"}
              </button>
            </div>
          </div>
        </section>

        <section className="yf-card mt-5 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  All Tasks
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Primary + Support Employee team અહીંથી manage કરો.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="yf-input"
                >
                  <option value="all">
                    All Status
                  </option>
                  <option value="pending">
                    Pending
                  </option>
                  <option value="in_progress">
                    In Progress
                  </option>
                  <option value="cancelled">
                    Cancelled
                  </option>
                </select>

                <select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  className="yf-input"
                >
                  <option value="all">
                    All Employees
                  </option>

                  {employees.map((employee) => (
                    <option
                      key={employee.id}
                      value={employee.id}
                    >
                      {employee.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="yf-table-wrap">
            <table className="yf-table min-w-[1380px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Task
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Primary Employee
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Support Employees
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Priority
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Due Date
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Status
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Employee Note
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredTasks.map((task) => {
                  const taskSupport = getTaskSupport(task.id);
                  const availableSupport =
                    getAvailableSupportEmployees(task);

                  return (
                    <tr
                      key={task.id}
                      className="border-t border-slate-100 align-top"
                    >
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">
                          {task.title}
                        </p>

                        {task.description && (
                          <p className="text-sm text-slate-500 mt-1 max-w-xs">
                            {task.description}
                          </p>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-black">
                          PRIMARY
                        </span>

                        <p className="font-semibold mt-2">
                          {task.employees?.full_name || "-"}
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                          {task.employees?.department || "-"}
                        </p>
                      </td>

                      <td className="px-5 py-4 min-w-[300px]">
                        <div className="space-y-2">
                          {taskSupport.map((support) => {
                            const employee =
                              employeeMap.get(support.employee_id);

                            return (
                              <div
                                key={support.id}
                                className="flex items-center justify-between gap-3 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2"
                              >
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-900 text-sm">
                                      {employee?.full_name || "Employee"}
                                    </span>

                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                      SUPPORT
                                    </span>

                                    {support.source === "leave_handover" && (
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                        LEAVE HANDOVER
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-xs text-slate-500 mt-1">
                                    {employee?.department || "-"}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  disabled={
                                    actionId ===
                                    `support-remove-${support.id}`
                                  }
                                  onClick={() =>
                                    removeSupportWorker(task, support)
                                  }
                                  className="text-xs font-bold text-red-600 hover:text-red-700 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })}

                          {taskSupport.length === 0 && (
                            <p className="text-sm text-slate-400">
                              No Support Employee
                            </p>
                          )}

                          {task.status !== "completed" &&
                            task.status !== "cancelled" &&
                            availableSupport.length > 0 && (
                              <div className="flex gap-2 pt-1">
                                <select
                                  value={supportPickers[task.id] || ""}
                                  onChange={(e) =>
                                    setSupportPickers((prev) => ({
                                      ...prev,
                                      [task.id]: e.target.value,
                                    }))
                                  }
                                  className="yf-input flex-1 min-w-0 text-xs"
                                >
                                  <option value="">
                                    Add Support...
                                  </option>

                                  {availableSupport.map((employee) => (
                                    <option
                                      key={employee.id}
                                      value={employee.id}
                                    >
                                      {employee.full_name}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  disabled={
                                    actionId ===
                                    `support-add-${task.id}`
                                  }
                                  onClick={() => addSupportWorker(task)}
                                  className="yf-btn yf-btn-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                                >
                                  Add
                                </button>
                              </div>
                            )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-bold ${getPriorityStyle(
                            task.priority
                          )}`}
                        >
                          {task.priority
                            .replace("_", " ")
                            .toUpperCase()}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {task.due_date || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`px-3 py-1.5 rounded-full text-xs font-bold ${getStatusStyle(
                            task.status
                          )}`}
                        >
                          {task.status
                            .replace("_", " ")
                            .toUpperCase()}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-sm text-slate-600 max-w-xs">
                        {task.employee_note || "-"}
                      </td>

                      <td className="px-5 py-4">
                        <select
                          value={task.status}
                          onChange={(e) =>
                            handleStatusChange(
                              task,
                              e.target.value as
                                | "pending"
                                | "in_progress"
                                | "completed"
                                | "cancelled"
                            )
                          }
                          className="border border-slate-300 rounded-lg px-3 py-2 bg-white text-sm font-semibold"
                        >
                          <option value="pending">
                            Pending
                          </option>

                          <option value="in_progress">
                            In Progress
                          </option>

                          <option value="completed">
                            Completed
                          </option>

                          <option value="cancelled">
                            Cancelled
                          </option>
                        </select>
                      </td>
                    </tr>
                  );
                })}

                {filteredTasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-5 py-12 text-center text-slate-400"
                    >
                      કોઈ Task મળ્યો નથી.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
