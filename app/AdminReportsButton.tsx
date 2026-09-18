"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

function QuickAppButton({
  icon,
  label,
  title,
  onClick,
}: {
  icon: string;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition min-h-[92px]"
      title={title}
    >
      <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">
        {icon}
      </div>

      <span className="text-[11px] sm:text-xs font-black text-slate-700 text-center leading-tight">
        {label}
      </span>
    </button>
  );
}

export default function AdminReportsButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (pathname !== "/admin") {
      setTarget(null);
      return;
    }

    function findQuickAppsGrid() {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "Quick Apps"
      );

      const section = heading?.closest("section");
      const grid = section?.querySelector(".grid") as HTMLElement | null;

      if (grid) setTarget(grid);
    }

    findQuickAppsGrid();

    const observer = new MutationObserver(findQuickAppsGrid);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  if (pathname !== "/admin" || !target) return null;

  return createPortal(
    <>
      <QuickAppButton
        icon="📊"
        label="Reports / Export"
        title="Reports / Export"
        onClick={() => router.push("/admin/reports")}
      />

      <QuickAppButton
        icon="💰"
        label="Accounts / Billing"
        title="Accounts / Billing Summary"
        onClick={() => router.push("/admin/accounts")}
      />

      <QuickAppButton
        icon="👥"
        label="Task / Team"
        title="Task & Team Management"
        onClick={() => router.push("/admin/task-team")}
      />

      <QuickAppButton
        icon="📦"
        label="Packing"
        title="Packing Workflow"
        onClick={() => router.push("/dashboard/packing")}
      />

      <QuickAppButton
        icon="🚚"
        label="Dispatch / Transport"
        title="Dispatch & Transportation Management"
        onClick={() => router.push("/dashboard/dispatch")}
      />

      <QuickAppButton
        icon="🪪"
        label="Bulk ID Cards"
        title="Bulk ID Card Management"
        onClick={() => router.push("/admin/id-cards")}
      />

      <QuickAppButton
        icon="🧩"
        label="Order Details"
        title="Production Order Details"
        onClick={() => router.push("/dashboard/manage/order-details")}
      />

      <QuickAppButton
        icon="📁"
        label="Files / Documents"
        title="Files / Documents Center"
        onClick={() => router.push("/admin/files")}
      />

      <QuickAppButton
        icon="🧾"
        label="Reorder Center"
        title="Low Stock Reorder Center"
        onClick={() => router.push("/admin/reorder")}
      />

      <QuickAppButton
        icon="🚨"
        label="Escalations"
        title="Overdue Work & Escalation Center"
        onClick={() => router.push("/admin/escalations")}
      />

      <QuickAppButton
        icon="🛡️"
        label="System Audit"
        title="Permissions Audit & Backup"
        onClick={() => router.push("/admin/system-audit")}
      />

      <QuickAppButton
        icon="♻️"
        label="Recovery"
        title="Backup Validation & Recovery Guide"
        onClick={() => router.push("/admin/recovery")}
      />

      <QuickAppButton
        icon="✅"
        label="Readiness"
        title="Production Readiness Center"
        onClick={() => router.push("/admin/readiness")}
      />
    </>,
    target
  );
}
