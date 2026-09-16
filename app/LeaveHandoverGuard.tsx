"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function parseActiveWork(text: string) {
  const taskMatch = text.match(/(\d+)\s+Task\(s\)/i);
  const orderMatch = text.match(/(\d+)\s+Order Stage\(s\)/i);

  return {
    tasks: taskMatch ? Number(taskMatch[1]) : 0,
    orders: orderMatch ? Number(orderMatch[1]) : 0,
  };
}

export default function LeaveHandoverGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/leave") return;

    function applyGuard() {
      const rows = Array.from(
        document.querySelectorAll<HTMLTableRowElement>("tbody tr")
      );

      for (const row of rows) {
        const rowText = row.textContent || "";
        if (!rowText.includes("ACTIVE WORK")) continue;

        const { tasks, orders } = parseActiveWork(rowText);
        const workCount = tasks + orders;

        const selects = Array.from(
          row.querySelectorAll<HTMLSelectElement>("select")
        );

        const primarySelect = selects.find((select) =>
          Array.from(select.options).some((option) =>
            option.textContent?.includes("Approve Only — No Handover")
          )
        );

        const approveButton = Array.from(
          row.querySelectorAll<HTMLButtonElement>("button")
        ).find((button) => button.textContent?.trim() === "Approve");

        if (!primarySelect || !approveButton) continue;

        const emptyOption = Array.from(primarySelect.options).find(
          (option) => option.value === ""
        );

        const existingWarning = row.querySelector<HTMLElement>(
          '[data-yf-leave-handover-warning="true"]'
        );

        if (workCount > 0) {
          if (emptyOption) {
            emptyOption.textContent = "Primary Handover Required";
            emptyOption.disabled = true;
          }

          const handoverMissing = !primarySelect.value;
          approveButton.disabled = handoverMissing;
          approveButton.title = handoverMissing
            ? "Active work હોય ત્યારે Primary Handover Employee ફરજિયાત છે."
            : "";

          if (handoverMissing) {
            approveButton.classList.add("opacity-50", "cursor-not-allowed");
          } else {
            approveButton.classList.remove("opacity-50", "cursor-not-allowed");
          }

          if (!existingWarning) {
            const warning = document.createElement("p");
            warning.dataset.yfLeaveHandoverWarning = "true";
            warning.className =
              "mt-2 text-[11px] font-black text-amber-700";
            warning.textContent =
              "⚠ Active work છે — Leave approve કરવા Primary Handover Employee ફરજિયાત છે.";

            primarySelect.parentElement?.appendChild(warning);
          }
        } else {
          if (emptyOption) {
            emptyOption.textContent = "Approve Only — No Handover";
            emptyOption.disabled = false;
          }

          approveButton.disabled = false;
          approveButton.removeAttribute("title");
          approveButton.classList.remove("opacity-50", "cursor-not-allowed");
          existingWarning?.remove();
        }
      }
    }

    applyGuard();

    const observer = new MutationObserver(() => {
      applyGuard();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["value", "disabled"],
    });

    document.addEventListener("change", applyGuard, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", applyGuard, true);
    };
  }, [pathname]);

  return null;
}
