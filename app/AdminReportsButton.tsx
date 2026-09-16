"use client";

import { usePathname, useRouter } from "next/navigation";

export default function AdminReportsButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname !== "/admin") return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/admin/reports")}
      className="fixed bottom-4 left-4 z-[80] rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white shadow-xl hover:bg-blue-800"
    >
      📊 Reports / Export
    </button>
  );
}
