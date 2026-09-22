"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminStageChecklistsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/workflow?tab=checklists");
  }, [router]);

  return (
    <main className="yf-page flex items-center justify-center">
      <div className="yf-card p-6 font-bold text-slate-700">
        Stage Checklist હવે Work Order Settingsમાં છે...
      </div>
    </main>
  );
}
