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

export default function AdminTasksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [adminId, setAdminId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [priority, setPriority] =
    useState<"low" | "medium" | "high" | "urgent">("medium");
  const [dueDate, setDueDate] = useState("");

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");

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
      .order("full_name", {
        ascending: true,
      });

    if (error) {
      setMessage(
        `Employee Load Error: ${error.message}`
      );
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
      setMessage(
        `Task Load Error: ${error.message}`
      );
      return;
    }

    setTasks((data || []) as unknown as Task[]);
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

      const {
        data: adminProfile,
        error: adminError,
      } = await supabase
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
      ]);

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleCreateTask() {
    if (!title.trim()) {
      setMessage("Task Title જરૂરી છે.");
      return;
    }

    if (!assignedTo) {
      setMessage(
        "Task કોને assign કરવો છે તે Employee પસંદ કરો."
      );
      return;
    }

    if (!adminId) {
      setMessage("Admin profile મળ્યો નથી.");
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("tasks")
      .insert({
        title: title.trim(),
        description:
          description.trim() || null,
        assigned_to: assignedTo,
        assigned_by: adminId,
        priority,
        status: "pending",
        due_date: dueDate || null,
      });

    if (error) {
      setMessage(
        `Task Create Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    setTitle("");
    setDescription("");
    setAssignedTo("");
    setPriority("medium");
    setDueDate("");

    setMessage(
      "Task સફળતાપૂર્વક assign થયો ✅"
    );

    await loadTasks();

    setSaving(false);
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

    if (
      newStatus === "in_progress" &&
      !task.started_at
    ) {
      updateData.started_at =
        new Date().toISOString();
    }

    if (newStatus === "completed") {
      updateData.completed_at =
        new Date().toISOString();
    }

    if (newStatus !== "completed") {
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", task.id);

    if (error) {
      setMessage(
        `Task Update Error: ${error.message}`
      );
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
      const statusMatch =
        filterStatus === "all" ||
        task.status === filterStatus;

      const employeeMatch =
        filterEmployee === "all" ||
        task.assigned_to === filterEmployee;

      return statusMatch && employeeMatch;
    });
  }, [
    tasks,
    filterStatus,
    filterEmployee,
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

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Task Management લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-5 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Task Management
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/admin")
            }
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-5">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4 font-semibold text-blue-800">
            {message}
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Pending
            </p>

            <p className="text-3xl font-black mt-2 text-amber-600">
              {pendingCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              In Progress
            </p>

            <p className="text-3xl font-black mt-2 text-blue-600">
              {progressCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Completed
            </p>

            <p className="text-3xl font-black mt-2 text-green-600">
              {completedCount}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-slate-500">
              Urgent Open
            </p>

            <p className="text-3xl font-black mt-2 text-red-600">
              {urgentCount}
            </p>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-xl font-black text-slate-900">
            Assign New Task
          </h2>

          <div className="grid lg:grid-cols-2 gap-4 mt-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Task Title
              </label>

              <input
                type="text"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value)
                }
                placeholder="Example: Acrylic orders complete કરો"
                className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Assign Employee
              </label>

              <select
                value={assignedTo}
                onChange={(e) =>
                  setAssignedTo(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-blue-500"
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
                className="w-full border border-slate-300 rounded-xl px-4 py-3 bg-white"
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
                onChange={(e) =>
                  setDueDate(e.target.value)
                }
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Description
              </label>

              <textarea
                value={description}
                onChange={(e) =>
                  setDescription(e.target.value)
                }
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-50"
              >
                {saving
                  ? "Assigning..."
                  : "Assign Task"}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl mt-5 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <h2 className="text-xl font-black text-slate-900">
                All Tasks
              </h2>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(e.target.value)
                  }
                  className="border border-slate-300 rounded-xl px-4 py-2 bg-white"
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
                  <option value="completed">
                    Completed
                  </option>
                  <option value="cancelled">
                    Cancelled
                  </option>
                </select>

                <select
                  value={filterEmployee}
                  onChange={(e) =>
                    setFilterEmployee(
                      e.target.value
                    )
                  }
                  className="border border-slate-300 rounded-xl px-4 py-2 bg-white"
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

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Task
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Employee
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
                {filteredTasks.map((task) => (
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
                      <p className="font-semibold">
                        {task.employees
                          ?.full_name || "-"}
                      </p>

                      <p className="text-xs text-slate-400 mt-1">
                        {task.employees
                          ?.department || "-"}
                      </p>
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
                ))}

                {filteredTasks.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
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