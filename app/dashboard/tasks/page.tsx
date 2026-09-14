"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Task = {
  id: string;
  assigned_to: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  due_date: string | null;
  employee_note: string | null;
  admin_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export default function EmployeeTasksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  async function loadTasks() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("tasks")
      .select(`
        id,
        assigned_to,
        title,
        description,
        priority,
        status,
        due_date,
        employee_note,
        admin_note,
        started_at,
        completed_at,
        created_at
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Task Load Error: ${error.message}`);
      return;
    }

    setTasks((data || []) as Task[]);

    const drafts: Record<string, string> = {};

    (data || []).forEach((task: Task) => {
      drafts[task.id] = task.employee_note || "";
    });

    setNoteDrafts(drafts);
  }

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error } = await supabase
        .from("employees")
        .select("id, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        error ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/");
        return;
      }

      setEmployeeId(profile.id);

      await loadTasks();

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function updateTaskStatus(
    task: Task,
    newStatus: "pending" | "in_progress" | "completed"
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

  async function saveNote(taskId: string) {
    const supabase = createClient();

    const { error } = await supabase
      .from("tasks")
      .update({
        employee_note: noteDrafts[taskId]?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);

    if (error) {
      setMessage(`Note Save Error: ${error.message}`);
      return;
    }

    setMessage("Employee Note save થઈ ✅");

    await loadTasks();
  }

  function getPriorityStyle(priority: string) {
    if (priority === "urgent") return "bg-red-100 text-red-700";
    if (priority === "high") return "bg-orange-100 text-orange-700";
    if (priority === "low") return "bg-slate-100 text-slate-600";
    return "bg-blue-100 text-blue-700";
  }

  function getStatusStyle(status: string) {
    if (status === "completed") return "bg-green-100 text-green-700";
    if (status === "in_progress") return "bg-blue-100 text-blue-700";
    if (status === "cancelled") return "bg-red-100 text-red-700";
    return "bg-amber-100 text-amber-700";
  }

  const filteredTasks = useMemo(() => {
    if (filterStatus === "all") return tasks;

    return tasks.filter((task) => task.status === filterStatus);
  }, [tasks, filterStatus]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          My Tasks લોડ થઈ રહ્યા છે...
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-5 py-5 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black">YashFlow</h1>
            <p className="text-slate-300 text-sm mt-1">My Tasks</p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl font-semibold"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-5">
        {message && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl p-4 font-semibold text-blue-800">
            {message}
          </div>
        )}

        <div className="flex justify-end mb-5">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-300 rounded-xl px-4 py-2 bg-white"
          >
            <option value="all">All Tasks</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <div className="grid gap-5">
          {filteredTasks.map((task) => (
            <section
              key={task.id}
              className="bg-white border border-slate-200 rounded-2xl p-6"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    {task.title}
                  </h2>

                  {task.description && (
                    <p className="text-slate-500 mt-2">
                      {task.description}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${getPriorityStyle(
                      task.priority
                    )}`}
                  >
                    {task.priority.toUpperCase()}
                  </span>

                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-bold ${getStatusStyle(
                      task.status
                    )}`}
                  >
                    {task.status.replace("_", " ").toUpperCase()}
                  </span>

                  {employeeId && task.assigned_to !== employeeId && (
                    <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                      SUPPORT TASK
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 text-sm text-slate-600">
                <strong>Due Date:</strong> {task.due_date || "Not Set"}
              </div>

              {task.admin_note && (
                <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-700">
                    Admin Note
                  </p>

                  <p className="mt-1 font-semibold text-slate-800">
                    {task.admin_note}
                  </p>
                </div>
              )}

              <div className="mt-5">
                <label className="block text-sm font-bold text-slate-600 mb-2">
                  My Note
                </label>

                <textarea
                  rows={2}
                  value={noteDrafts[task.id] || ""}
                  onChange={(e) =>
                    setNoteDrafts((prev) => ({
                      ...prev,
                      [task.id]: e.target.value,
                    }))
                  }
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 resize-none"
                  placeholder="Task વિશે note લખો..."
                />

                <button
                  type="button"
                  onClick={() => saveNote(task.id)}
                  className="mt-2 bg-slate-800 text-white px-4 py-2 rounded-xl font-bold"
                >
                  Save Note
                </button>
              </div>

              {task.status !== "cancelled" && (
                <div className="mt-5 flex gap-3 flex-wrap">
                  {task.status === "pending" && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatus(task, "in_progress")
                      }
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold"
                    >
                      Start Task
                    </button>
                  )}

                  {task.status === "in_progress" && (
                    <button
                      type="button"
                      onClick={() =>
                        updateTaskStatus(task, "completed")
                      }
                      className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold"
                    >
                      Mark Completed
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}

          {filteredTasks.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400">
              કોઈ Task મળ્યો નથી.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}