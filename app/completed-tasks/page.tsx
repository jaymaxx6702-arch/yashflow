"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type EmployeeLite = {
  id: string;
  full_name: string;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "completed";
  due_date: string | null;
  employee_note: string | null;
  admin_note: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

function dateKey(value: string | null) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function dateLabel(key: string) {
  if (key === "unknown") return "Completion Date Not Available";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${key}T12:00:00+05:30`));
}

function timeLabel(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

export default function CompletedTasksPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentEmployeeName, setCurrentEmployeeName] = useState("Employee");
  const [employees, setEmployees] = useState<EmployeeLite[]>([]);
  const [message, setMessage] = useState("");
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadPage() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("employees")
        .select("id, full_name, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        profileError ||
        !profile ||
        profile.approval_status !== "approved" ||
        !profile.is_active
      ) {
        router.replace("/");
        return;
      }

      const admin = profile.role === "admin";
      setIsAdmin(admin);
      setCurrentEmployeeName(profile.full_name || "Employee");

      if (admin) {
        const { data: employeeRows } = await supabase
          .from("employees")
          .select("id, full_name")
          .eq("approval_status", "approved")
          .eq("is_active", true);
        setEmployees((employeeRows || []) as EmployeeLite[]);
      }

      const { data, error } = await supabase
        .from("tasks")
        .select(`
          id,
          title,
          description,
          assigned_to,
          priority,
          status,
          due_date,
          employee_note,
          admin_note,
          started_at,
          completed_at,
          created_at
        `)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        setMessage(`Completed Task Load Error: ${error.message}`);
        setLoading(false);
        return;
      }

      const rows = (data || []) as unknown as Task[];
      setTasks(rows);

      const firstKey = rows.length ? dateKey(rows[0].completed_at) : "";
      if (firstKey) setOpenDates({ [firstKey]: true });

      setLoading(false);
    }

    void loadPage();
  }, [router]);

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const key = dateKey(task.completed_at);
      const list = map.get(key) || [];
      list.push(task);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [tasks]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold text-slate-700">
          Completed Tasks લોડ થઈ રહ્યા છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              TASK HISTORY
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Completed Tasks
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Date-wise history • {tasks.length} completed task(s)
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push(isAdmin ? "/admin" : "/dashboard")}
            className="yf-btn bg-white text-blue-700"
          >
            ← Back
          </button>
        </div>
      </header>

      <div className="yf-container">
        {message && <div className="yf-alert yf-alert-info mb-4">{message}</div>}

        {grouped.length === 0 ? (
          <div className="yf-card p-10 text-center text-slate-500 font-bold">
            હજી કોઈ Completed Task નથી.
          </div>
        ) : (
          <div className="space-y-3">
            {grouped.map(([key, rows]) => {
              const open = Boolean(openDates[key]);
              return (
                <section key={key} className="yf-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDates((current) => ({
                        ...current,
                        [key]: !current[key],
                      }))
                    }
                    className="w-full flex items-center justify-between gap-3 p-4 text-left bg-white"
                  >
                    <div>
                      <p className="font-black text-slate-900">{dateLabel(key)}</p>
                      <p className="text-xs font-semibold text-slate-500 mt-1">
                        {rows.length} task(s)
                      </p>
                    </div>
                    <span className="text-xl font-black text-blue-700">
                      {open ? "−" : "+"}
                    </span>
                  </button>

                  {open && (
                    <div className="border-t border-slate-200 divide-y divide-slate-100">
                      {rows.map((task) => (
                        <article key={task.id} className="p-4">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div>
                              <h2 className="font-black text-slate-900">{task.title}</h2>
                              {task.description && (
                                <p className="text-sm text-slate-500 mt-1">
                                  {task.description}
                                </p>
                              )}
                            </div>
                            <span className="yf-badge yf-badge-green">Completed</span>
                          </div>

                          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs font-semibold text-slate-600">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <b>Completed:</b> {timeLabel(task.completed_at)}
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <b>Employee:</b> {isAdmin ? employeeMap.get(task.assigned_to) || "Employee" : currentEmployeeName}
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <b>Priority:</b> {task.priority.toUpperCase()}
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                              <b>Due:</b> {task.due_date || "-"}
                            </div>
                          </div>

                          {(task.employee_note || task.admin_note) && (
                            <div className="grid md:grid-cols-2 gap-2 mt-3">
                              {task.employee_note && (
                                <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm">
                                  <p className="text-xs font-black text-blue-700">Employee Note</p>
                                  <p className="font-semibold text-slate-800 mt-1">{task.employee_note}</p>
                                </div>
                              )}
                              {task.admin_note && (
                                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm">
                                  <p className="text-xs font-black text-amber-700">Admin Note</p>
                                  <p className="font-semibold text-slate-800 mt-1">{task.admin_note}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
