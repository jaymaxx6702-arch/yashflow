import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-900">
            YashFlow Admin
          </h1>

          <p className="mt-2 text-slate-500">
            Admin Login સફળ થયું ✅
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold text-slate-900">
            મેનેજમેન્ટ ડેશબોર્ડ
          </h2>

          <p className="mt-2 text-slate-500">
            અહીંથી Staff, Attendance, Leave અને બીજા management modules ખોલી શકશો.
          </p>

          <div className="grid md:grid-cols-2 gap-5 mt-7">
            <Link
              href="/admin/employees"
              className="block rounded-2xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-md transition bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-blue-600">
                    STAFF
                  </p>

                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Employee Approval
                  </h3>

                  <p className="text-slate-500 mt-2 text-sm">
                    Pending employeesને approve અથવા reject કરો.
                  </p>
                </div>

                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl">
                  👥
                </div>
              </div>

              <div className="mt-5 text-blue-600 font-bold">
                કર્મચારી મંજૂરી જુઓ →
              </div>
            </Link>

            <Link
              href="/admin/attendance"
              className="block rounded-2xl border border-slate-200 p-6 hover:border-green-300 hover:shadow-md transition bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-green-600">
                    ATTENDANCE
                  </p>

                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Attendance Management
                  </h3>

                  <p className="text-slate-500 mt-2 text-sm">
                    Staff Check In, Late, Check Out, Leave અને Working Hours જુઓ.
                  </p>
                </div>

                <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-2xl">
                  🕘
                </div>
              </div>

              <div className="mt-5 text-green-600 font-bold">
                હાજરી જુઓ →
              </div>
            </Link>

            <Link
              href="/admin/attendance-approval"
              className="block rounded-2xl border border-slate-200 p-6 hover:border-orange-300 hover:shadow-md transition bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-orange-600">
                    APPROVAL
                  </p>

                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Attendance Approval
                  </h3>

                  <p className="text-slate-500 mt-2 text-sm">
                    Late અને Half Day attendance Approve અથવા Reject કરો.
                  </p>
                </div>

                <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-2xl">
                  ✅
                </div>
              </div>

              <div className="mt-5 text-orange-600 font-bold">
                Pending Attendance જુઓ →
              </div>
            </Link>
            <Link
  href="/admin/holidays"
  className="block rounded-2xl border border-slate-200 p-6 hover:border-emerald-300 hover:shadow-md transition bg-white"
>
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-emerald-600">
        HOLIDAYS
      </p>

      <h3 className="text-xl font-black text-slate-900 mt-1">
        Holiday Management
      </h3>

      <p className="text-slate-500 mt-2 text-sm">
        Company Holiday Add, Edit, Activate અને Deactivate કરો.
      </p>
    </div>

    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-2xl">
      📅
    </div>
  </div>

  <div className="mt-5 text-emerald-600 font-bold">
    Holiday Manage કરો →
  </div>
</Link>
<Link
  href="/admin/attendance-report"
  className="block rounded-2xl border border-slate-200 p-6 hover:border-indigo-300 hover:shadow-md transition bg-white"
>
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-indigo-600">
        REPORTS
      </p>

      <h3 className="text-xl font-black text-slate-900 mt-1">
        Monthly Attendance Report
      </h3>

      <p className="text-slate-500 mt-2 text-sm">
        Employee Monthly Attendance, Leave, Late, Half Day અને Working Hours જુઓ.
      </p>
    </div>

    <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-2xl">
      📊
    </div>
  </div>

  <div className="mt-5 text-indigo-600 font-bold">
    Monthly Report જુઓ →
  </div>
</Link>
<Link
  href="/admin/tasks"
  className="block rounded-2xl border border-slate-200 p-6 hover:border-violet-300 hover:shadow-md transition bg-white"
>
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-violet-600">
        TASKS
      </p>

      <h3 className="text-xl font-black text-slate-900 mt-1">
        Task Management
      </h3>

      <p className="text-slate-500 mt-2 text-sm">
        Employeeને Task Assign કરો અને Progress Track કરો.
      </p>
    </div>

    <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center text-2xl">
      📋
    </div>
  </div>

  <div className="mt-5 text-violet-600 font-bold">
    Tasks Manage કરો →
  </div>
</Link>
<Link
  href="/admin/orders"
  className="block rounded-2xl border border-slate-200 p-6 hover:border-cyan-300 hover:shadow-md transition bg-white"
>
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-cyan-600">
        ORDERS
      </p>

      <h3 className="text-xl font-black text-slate-900 mt-1">
        Order Management
      </h3>

      <p className="text-slate-500 mt-2 text-sm">
        Orders Create કરો અને Production Workflow Track કરો.
      </p>
    </div>

    <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center text-2xl">
      📦
    </div>
  </div>

  <div className="mt-5 text-cyan-600 font-bold">
    Orders Manage કરો →
  </div>
</Link>
            <Link
              href="/admin/leave"
              className="block rounded-2xl border border-slate-200 p-6 hover:border-purple-300 hover:shadow-md transition bg-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-purple-600">
                    LEAVE
                  </p>

                  <h3 className="text-xl font-black text-slate-900 mt-1">
                    Leave Management
                  </h3>

                  <p className="text-slate-500 mt-2 text-sm">
                    Employee Leave Requests Approve અથવા Reject કરો.
                  </p>
                </div>

                <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-2xl">
                  🗓️
                </div>
              </div>

              <div className="mt-5 text-purple-600 font-bold">
                Leave Requests જુઓ →
              </div>
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mt-5">
            <div className="rounded-2xl border border-dashed border-slate-300 p-5 bg-slate-50">
              <p className="font-bold text-slate-700">
                Tasks
              </p>

              <p className="text-sm text-slate-400 mt-1">
                Coming Next
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 p-5 bg-slate-50">
              <p className="font-bold text-slate-700">
                Orders
              </p>

              <p className="text-sm text-slate-400 mt-1">
                Coming Soon
              </p>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-300 p-5 bg-slate-50">
              <p className="font-bold text-slate-700">
                Inventory
              </p>

              <p className="text-sm text-slate-400 mt-1">
                Coming Soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}