import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-black text-slate-900">
          YashFlow Admin
        </h1>

        <p className="mt-2 text-slate-500">
          Admin Login સફળ થયું ✅
        </p>

        <div className="mt-8 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold">
            મેનેજમેન્ટ ડેશબોર્ડ
          </h2>

          <p className="mt-2 text-slate-500">
            હવે અહીં Employee Approval, Orders, Tasks અને Attendance બનાવશું.
          </p>

          <Link
            href="/admin/employees"
            className="inline-block mt-5 bg-blue-600 text-white font-bold px-5 py-3 rounded-xl hover:bg-blue-700 transition"
          >
            કર્મચારી મંજૂરી જુઓ
          </Link>
        </div>
      </div>
    </main>
  );
}