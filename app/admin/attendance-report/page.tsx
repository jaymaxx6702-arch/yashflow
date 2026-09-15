"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
  joining_date: string | null;
};

type Attendance = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  attendance_type: string | null;
  working_minutes: number | null;
  approval_required: boolean;
  approval_status: string;
};

type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
};

type CompanyHoliday = {
  id: string;
  holiday_date: string;
  holiday_name: string;
  is_active: boolean;
};

type ReportRow = {
  employee: Employee;
  present: number;
  late: number;
  halfDay: number;
  weeklyOff: number;
 holiday: number;
  leave: number;
  absent: number;
  rejected: number;
  checkOutDone: number;
  workingMinutes: number;
};

export default function AttendanceReportPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] =
    useState(false);

  const [message, setMessage] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(
    getCurrentMonth()
  );

  const [employees, setEmployees] = useState<
    Employee[]
  >([]);

  const [attendance, setAttendance] = useState<
    Attendance[]
  >([]);

  const [leaveRequests, setLeaveRequests] = useState<
    LeaveRequest[]
  >([]);

  const [companyHolidays, setCompanyHolidays] = useState<
  CompanyHoliday[]
>([]);

  const [weeklyOffDay, setWeeklyOffDay] = useState(0);

  function getCurrentMonth() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find(
      (part) => part.type === "year"
    )?.value;

    const month = parts.find(
      (part) => part.type === "month"
    )?.value;

    return `${year}-${month}`;
  }

  function getIndiaDate() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find(
      (part) => part.type === "year"
    )?.value;

    const month = parts.find(
      (part) => part.type === "month"
    )?.value;

    const day = parts.find(
      (part) => part.type === "day"
    )?.value;

    return `${year}-${month}-${day}`;
  }

  function getMonthRange(monthValue: string) {
    const [year, month] = monthValue
      .split("-")
      .map(Number);

    const firstDay = `${year}-${String(
      month
    ).padStart(2, "0")}-01`;

    const lastDayNumber = new Date(
      year,
      month,
      0
    ).getDate();

    const lastDay = `${year}-${String(
      month
    ).padStart(2, "0")}-${String(
      lastDayNumber
    ).padStart(2, "0")}`;

    return {
      firstDay,
      lastDay,
      lastDayNumber,
    };
  }

  function formatWorkingMinutes(minutes: number) {
    if (minutes <= 0) return "-";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${hours}h ${mins}m`;
  }

  useEffect(() => {
    async function verifyAdmin() {
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

      setLoading(false);
    }

    verifyAdmin();
  }, [router]);

  useEffect(() => {
    if (loading) return;

    async function loadMonthlyData() {
      setReportLoading(true);
      setMessage("");

      const supabase = createClient();

      const { firstDay, lastDay } =
        getMonthRange(selectedMonth);

      const {
        data: employeeData,
        error: employeeError,
      } = await supabase
        .from("employees")
        .select(`
          id,
          full_name,
          mobile,
          department,
          joining_date
        `)
        .eq("approval_status", "approved")
        .eq("is_active", true)
        .order("full_name", {
          ascending: true,
        });

      if (employeeError) {
        setMessage(
          `Employee Load Error: ${employeeError.message}`
        );
        setReportLoading(false);
        return;
      }

      const {
        data: attendanceData,
        error: attendanceError,
      } = await supabase
        .from("attendance")
        .select(`
          id,
          employee_id,
          attendance_date,
          check_in,
          check_out,
          attendance_type,
          working_minutes,
          approval_required,
          approval_status
        `)
        .gte("attendance_date", firstDay)
        .lte("attendance_date", lastDay);

      if (attendanceError) {
        setMessage(
          `Attendance Load Error: ${attendanceError.message}`
        );
        setReportLoading(false);
        return;
      }

      const {
        data: leaveData,
        error: leaveError,
      } = await supabase
        .from("leave_requests")
        .select(`
          id,
          employee_id,
          leave_type,
          start_date,
          end_date,
          status
        `)
        .eq("status", "approved")
        .lte("start_date", lastDay)
        .gte("end_date", firstDay);

      if (leaveError) {
        setMessage(
          `Leave Load Error: ${leaveError.message}`
        );
        setReportLoading(false);
        return;
      }

      const {
  data: holidayData,
  error: holidayError,
} = await supabase
  .from("company_holidays")
  .select(`
    id,
    holiday_date,
    holiday_name,
    is_active
  `)
  .eq("is_active", true)
  .gte("holiday_date", firstDay)
  .lte("holiday_date", lastDay);

if (holidayError) {
  setMessage(
    `Holiday Load Error: ${holidayError.message}`
  );

  setReportLoading(false);
  return;
}
  const {
  data: officeSettingsData,
  error: officeSettingsError,
} = await supabase
  .from("office_settings")
  .select("weekly_off_day")
  .eq("is_active", true)
  .maybeSingle();

if (officeSettingsError) {
  setMessage(
    `Office Settings Load Error: ${officeSettingsError.message}`
  );

  setReportLoading(false);
  return;
}
      setEmployees(employeeData || []);
      setAttendance(attendanceData || []);
      setLeaveRequests(leaveData || []);
      setCompanyHolidays(holidayData || []);
      setWeeklyOffDay(
  officeSettingsData?.weekly_off_day ?? 0
);
      setReportLoading(false);
    }

    loadMonthlyData();
  }, [selectedMonth, loading]);

  const reportRows = useMemo<ReportRow[]>(() => {
    const today = getIndiaDate();

    const { firstDay, lastDayNumber } =
      getMonthRange(selectedMonth);

    const [year, month] = selectedMonth
      .split("-")
      .map(Number);

    return employees.map((employee) => {
      let present = 0;
      let late = 0;
      let weeklyOff = 0;
      let holiday = 0;
      let halfDay = 0;
      let leave = 0;
      let absent = 0;
      let rejected = 0;
      let checkOutDone = 0;
      let workingMinutes = 0;

      for (
        let day = 1;
        day <= lastDayNumber;
        day++
      ) {
        const date = `${year}-${String(
          month
        ).padStart(2, "0")}-${String(day).padStart(
          2,
          "0"
        )}`;

        if (date > today) {
          continue;
        }

        if (
          employee.joining_date &&
          date < employee.joining_date
        ) {
          continue;
        }

        const attendanceRecord = attendance.find(
          (item) =>
            item.employee_id === employee.id &&
            item.attendance_date === date
        );

        if (attendanceRecord) {
          if (
            attendanceRecord.approval_required &&
            attendanceRecord.approval_status ===
              "rejected"
          ) {
            rejected++;
            continue;
          }

          if (
            attendanceRecord.attendance_type ===
            "late"
          ) {
            late++;
          } else if (
            attendanceRecord.attendance_type ===
            "half_day"
          ) {
            halfDay++;
          } else {
            present++;
          }

          if (attendanceRecord.check_out) {
            checkOutDone++;
          }

          workingMinutes +=
            attendanceRecord.working_minutes || 0;

          continue;
        }

        const approvedLeave = leaveRequests.find(
          (item) =>
            item.employee_id === employee.id &&
            item.status === "approved" &&
            date >= item.start_date &&
            date <= item.end_date
        );

        if (approvedLeave) {
          if (
            approvedLeave.leave_type ===
            "full_day"
          ) {
            leave++;
          } else {
            halfDay++;
          }

          continue;
        }

       const currentDate = new Date(`${date}T00:00:00`);

const dayOfWeek = currentDate.getDay();

if (dayOfWeek === weeklyOffDay) {
  weeklyOff++;
  continue;
}

const isCompanyHoliday = companyHolidays.some(
  (holiday) => holiday.holiday_date === date
);

if (isCompanyHoliday) {
  holiday++;
  continue;
}

if (date >= firstDay && date < today) {
  absent++;
}
      }

      return {
        employee,
        present,
        late,
        halfDay,
        leave,
        absent,
        rejected,
        checkOutDone,
        workingMinutes,
        weeklyOff,
        holiday,
      };
    });
  }, [
     employees,
     attendance,
     leaveRequests,
     companyHolidays,
     weeklyOffDay,
     selectedMonth,
  ]);

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <p className="font-semibold text-slate-500">
          Monthly Report લોડ થઈ રહ્યું છે...
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
              Monthly Attendance Report
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

      <div className="yf-container">
        <section className="yf-card p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900">
                Monthly Attendance
              </h2>

              <p className="text-slate-500 mt-1">
                Employee-wise monthly attendance summary
              </p>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">
                મહિનો પસંદ કરો
              </label>

              <input
                type="month"
                value={selectedMonth}
                onChange={(e) =>
                  setSelectedMonth(e.target.value)
                }
                className="yf-input"
              />
            </div>
          </div>
        </section>

        {message && (
          <div className="yf-alert yf-alert-danger mt-5">
            {message}
          </div>
        )}

        <section className="yf-card mt-5 overflow-hidden">
          <div className="yf-table-wrap">
            <table className="yf-table min-w-[1150px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left px-4 py-4 text-sm">
                    Employee
                  </th>

                  <th className="text-left px-4 py-4 text-sm">
                    Department
                  </th>

                  <th className="text-center px-4 py-4 text-sm">
                    Present
                  </th>

                  <th className="text-center px-4 py-4 text-sm">
                    Late
                  </th>

                  <th className="text-center px-4 py-4 text-sm">
                    Half Day
                  </th>

                  <th className="text-center px-4 py-4 text-sm">
                    Leave
                  </th>
<th className="px-4 py-3 text-left text-sm font-bold">
  Weekly Off
</th>

<th className="px-4 py-3 text-left text-sm font-bold">
  Holiday
</th>
                  <th className="text-center px-4 py-4 text-sm">
                    Absent
                  </th>

                  <th className="text-center px-4 py-4 text-sm">
                    Rejected
                  </th>

                  <th className="text-center px-4 py-4 text-sm">
                    Check Out
                  </th>

                  <th className="text-left px-4 py-4 text-sm">
                    Working Hours
                  </th>
                </tr>
              </thead>

              <tbody>
                {reportLoading ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-5 py-10 text-center text-slate-400"
                    >
                      Monthly data લોડ થઈ રહ્યું છે...
                    </td>
                  </tr>
                ) : (
                  reportRows.map((row) => (
                    <tr
                      key={row.employee.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-900">
                          {row.employee.full_name}
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                          +91 {row.employee.mobile}
                        </p>
                      </td>

                      <td className="px-4 py-4">
                        {row.employee.department || "-"}
                      </td>

                      <td className="px-4 py-4 text-center font-bold text-green-600">
                        {row.present}
                      </td>

                      <td className="px-4 py-4 text-center font-bold text-orange-600">
                        {row.late}
                      </td>

                      <td className="px-4 py-4 text-center font-bold text-red-600">
                        {row.halfDay}
                      </td>

                      <td className="px-4 py-4 text-center font-bold text-purple-600">
                        {row.leave}
                      </td>
<td className="px-4 py-3">
  {row.weeklyOff}
</td>

<td className="px-4 py-3">
  {row.holiday}
</td>
                      <td className="px-4 py-4 text-center font-bold text-rose-600">
                        {row.absent}
                      </td>

                      <td className="px-4 py-4 text-center font-bold text-red-700">
                        {row.rejected}
                      </td>

                      <td className="px-4 py-4 text-center font-bold text-blue-600">
                        {row.checkOutDone}
                      </td>

                      <td className="px-4 py-4 font-bold">
                        {formatWorkingMinutes(
                          row.workingMinutes
                        )}
                      </td>
                    </tr>
                  ))
                )}

                {!reportLoading &&
                  reportRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={12}
                        className="px-5 py-10 text-center text-slate-400"
                      >
                        કોઈ employee મળ્યો નથી.
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