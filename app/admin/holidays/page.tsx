"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Holiday = {
  id: string;
  holiday_date: string;
  holiday_name: string;
  is_active: boolean;
  created_at: string;
};

export default function HolidayManagementPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
 
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editName, setEditName] = useState("");
  
  async function loadHolidays() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("company_holidays")
      .select(`
        id,
        holiday_date,
        holiday_name,
        is_active,
        created_at
      `)
      .order("holiday_date", {
        ascending: true,
      });

    if (error) {
      setMessage(
        `Holiday Load Error: ${error.message}`
      );
      return;
    }

    setHolidays(data || []);
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

      const { data: adminProfile, error: adminError } =
        await supabase
          .from("employees")
          .select(
            "id, role, approval_status, is_active"
          )
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

      await loadHolidays();

      setLoading(false);
    }

    loadPage();
  }, [router]);

  async function handleAddHoliday() {
    if (!holidayDate || !holidayName.trim()) {
      setMessage(
        "Holiday Date અને Holiday Name બંને જરૂરી છે."
      );
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("company_holidays")
      .insert({
        holiday_date: holidayDate,
        holiday_name: holidayName.trim(),
        is_active: true,
      });

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ તારીખ માટે Holiday પહેલેથી છે."
          : `Holiday Add Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    setHolidayDate("");
    setHolidayName("");

    setMessage("Holiday સફળતાપૂર્વક add થઈ ✅");

    await loadHolidays();

    setSaving(false);
  }
    async function handleToggleHoliday(holiday: Holiday) {
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("company_holidays")
      .update({
        is_active: !holiday.is_active,
      })
      .eq("id", holiday.id);

    if (error) {
      setMessage(
        `Holiday Update Error: ${error.message}`
      );
      return;
    }

    setMessage(
      holiday.is_active
        ? "Holiday Deactivate થઈ ✅"
        : "Holiday Activate થઈ ✅"
    );

    await loadHolidays();
  }
   function handleStartEdit(holiday: Holiday) {
    setEditingId(holiday.id);
    setEditDate(holiday.holiday_date);
    setEditName(holiday.holiday_name);
    setMessage("");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditDate("");
    setEditName("");
  }

  async function handleSaveEdit(holidayId: string) {
    if (!editDate || !editName.trim()) {
      setMessage(
        "Holiday Date અને Holiday Name બંને જરૂરી છે."
      );
      return;
    }

    setSaving(true);
    setMessage("");

    const supabase = createClient();

    const { error } = await supabase
      .from("company_holidays")
      .update({
        holiday_date: editDate,
        holiday_name: editName.trim(),
      })
      .eq("id", holidayId);

    if (error) {
      setMessage(
        error.code === "23505"
          ? "આ તારીખ માટે Holiday પહેલેથી છે."
          : `Holiday Edit Error: ${error.message}`
      );

      setSaving(false);
      return;
    }

    setMessage("Holiday સફળતાપૂર્વક update થઈ ✅");

    setEditingId(null);
    setEditDate("");
    setEditName("");

    await loadHolidays();

    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Holiday Management લોડ થઈ રહ્યું છે...
        </p>
      </main>
    );
  }

  return (
    <main className="yf-page">
      <header className="yf-header">
        <div className="yf-container max-w-6xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black">
              YashFlow Admin
            </h1>

            <p className="text-slate-300 text-sm mt-1">
              Holiday Management
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="yf-btn border-white/20 bg-white/10 text-white hover:bg-white/20"
          >
            ← Admin Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container max-w-6xl">
        {message && (
          <div className="yf-alert yf-alert-info mb-5">
            {message}
          </div>
        )}

        <section className="yf-card p-4 sm:p-6">
          <h2 className="text-xl font-black text-slate-900">
            Add Company Holiday
          </h2>

          <div className="grid md:grid-cols-3 gap-4 mt-5">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Holiday Date
              </label>

              <input
                type="date"
                value={holidayDate}
                onChange={(e) =>
                  setHolidayDate(e.target.value)
                }
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                Holiday Name
              </label>

              <input
                type="text"
                value={holidayName}
                onChange={(e) =>
                  setHolidayName(e.target.value)
                }
                placeholder="Example: Diwali"
                className="yf-input"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleAddHoliday}
                disabled={saving}
                className="yf-btn yf-btn-primary w-full disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Holiday"}
              </button>
            </div>
          </div>
        </section>

        <section className="yf-card mt-5 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100">
            <h2 className="text-xl font-black text-slate-900">
              Holiday List
            </h2>
          </div>

          <div className="yf-table-wrap">
            <table className="yf-table min-w-[700px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-5 py-4 text-sm">
                    Date
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Holiday
                  </th>

                  <th className="text-left px-5 py-4 text-sm">
                    Status
                  </th>
                  <th className="text-left px-5 py-4 text-sm">
                   Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {holidays.map((holiday) => (
                  <tr
                    key={holiday.id}
                    className="border-t border-slate-100"
                  >
                    <td className="px-5 py-4 font-semibold">
  {editingId === holiday.id ? (
    <input
      type="date"
      value={editDate}
      onChange={(e) => setEditDate(e.target.value)}
      className="yf-input"
    />
  ) : (
    holiday.holiday_date
  )}
</td>

<td className="px-5 py-4 font-bold">
  {editingId === holiday.id ? (
    <input
      type="text"
      value={editName}
      onChange={(e) => setEditName(e.target.value)}
      className="yf-input"
    />
  ) : (
    holiday.holiday_name
  )}
</td>

                    <td className="px-5 py-4">
                      {holiday.is_active ? (
                        <span className="yf-badge yf-badge-green">
                          Active
                        </span>
                      ) : (
                        <span className="yf-badge yf-badge-slate">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
  {editingId === holiday.id ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleSaveEdit(holiday.id)}
        disabled={saving}
        className="yf-btn yf-btn-primary yf-btn-sm disabled:opacity-50"
      >
        Save
      </button>

      <button
        type="button"
        onClick={handleCancelEdit}
        className="yf-btn yf-btn-secondary yf-btn-sm"
      >
        Cancel
      </button>
    </div>
  ) : (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleStartEdit(holiday)}
        className="yf-btn yf-btn-sm bg-blue-50 text-blue-700 hover:bg-blue-100"
      >
        Edit
      </button>

      <button
        type="button"
        onClick={() => handleToggleHoliday(holiday)}
        className={`yf-btn yf-btn-sm ${
          holiday.is_active
            ? "bg-red-50 text-red-700 hover:bg-red-100"
            : "bg-green-50 text-green-700 hover:bg-green-100"
        }`}
      >
        {holiday.is_active ? "Deactivate" : "Activate"}
      </button>
    </div>
  )}
</td>
                  </tr>
                ))}

                {holidays.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      કોઈ Holiday add કરેલી નથી.
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