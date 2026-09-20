"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Activity = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_employee_id: string | null;
  changed_fields: string[];
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
};

type Employee = {
  id: string;
  full_name: string;
};

const entityOptions = [
  "all",
  "order",
  "order_stage",
  "task",
  "attendance",
  "order_worker",
  "task_support",
];

export default function AdminActivityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState("all");

  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee.full_name])),
    [employees]
  );

  const filtered = useMemo(
    () =>
      filter === "all"
        ? activities
        : activities.filter((item) => item.entity_type === filter),
    [activities, filter]
  );

  async function loadActivity() {
    const supabase = createClient();

    const [activityResult, employeeResult] = await Promise.all([
      supabase
        .from("audit_activity")
        .select(
          "id, entity_type, entity_id, action, actor_employee_id, changed_fields, old_data, new_data, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("employees")
        .select("id, full_name")
        .order("full_name"),
    ]);

    const error = activityResult.error || employeeResult.error;
    if (error) {
      setMessage(`Activity Load Error: ${error.message}`);
      return;
    }

    setActivities((activityResult.data || []) as Activity[]);
    setEmployees((employeeResult.data || []) as Employee[]);
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

      await loadActivity();
      setLoading(false);
    }

    void init();
  }, [router]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-6 font-bold">Activity History લોડ થઈ રહી છે...</div>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container py-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.15em] text-blue-100">
              AUDIT TRAIL
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Activity History
            </h1>
            <p className="text-sm text-blue-100 mt-1">
              Order • Task • Attendance • Assignment changesની traceable timeline.
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

        <section className="yf-card p-4 mb-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <p className="font-black text-slate-900">Latest {filtered.length} events</p>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              timestamp-only writes historyમાં ઉમેરાતા નથી.
            </p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="yf-input sm:max-w-xs"
          >
            {entityOptions.map((option) => (
              <option key={option} value={option}>
                {option === "all"
                  ? "All Activity"
                  : option.replaceAll("_", " ").toUpperCase()}
              </option>
            ))}
          </select>
        </section>

        <section className="space-y-3">
          {filtered.map((item) => (
            <article key={item.id} className="yf-card p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="yf-badge bg-blue-100 text-blue-700">
                      {item.entity_type.replaceAll("_", " ").toUpperCase()}
                    </span>
                    <span className="yf-badge bg-slate-100 text-slate-700">
                      {item.action.toUpperCase()}
                    </span>
                  </div>

                  <p className="mt-2 font-black text-slate-900 break-all">
                    {item.entity_id}
                  </p>

                  <p className="mt-2 text-sm font-semibold text-slate-600">
                    Changed:{" "}
                    {item.changed_fields?.length
                      ? item.changed_fields.join(", ")
                      : "-"}
                  </p>

                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    By:{" "}
                    {item.actor_employee_id
                      ? employeeMap.get(item.actor_employee_id) || "Employee"
                      : "System / Server"}
                  </p>
                </div>

                <time className="text-xs font-bold text-slate-500 whitespace-nowrap">
                  {new Date(item.created_at).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </article>
          ))}

          {filtered.length === 0 && (
            <div className="yf-card p-10 text-center text-slate-400 font-bold">
              Activity history હજી ઉપલબ્ધ નથી.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
