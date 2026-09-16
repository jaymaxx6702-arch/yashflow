"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

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
    <button
      type="button"
      onClick={() => router.push("/admin/reports")}
      className="relative flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition min-h-[92px]"
      title="Reports / Export"
    >
      <div className="w-11 h-11 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">
        📊
      </div>

      <span className="text-[11px] sm:text-xs font-black text-slate-700 text-center leading-tight">
        Reports / Export
      </span>
    </button>,
    target
  );
}
