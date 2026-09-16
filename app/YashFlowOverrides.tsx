"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const ACTIVE_WORK_STATUSES = [
  "waiting",
  "assigned",
  "in_progress",
  "ready_for_approval",
  "hold",
  "rework",
];

function getOrderNumber(article: HTMLElement | null) {
  if (!article) return "";

  const orderButton = article.querySelector(
    "button.text-blue-700"
  ) as HTMLButtonElement | null;

  return orderButton?.textContent?.trim() || "";
}

export default function YashFlowOverrides() {
  const pathname = usePathname();
  const router = useRouter();
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (pathname !== "/dashboard/orders") return;

    let busy = false;

    function applyEmployeeOrderOverrides() {
      document.querySelectorAll("details").forEach((details) => {
        if (
          details.querySelector(
            'input[type="file"][accept*="image"]'
          )
        ) {
          (details as HTMLElement).style.display = "none";
        }
      });

      document.querySelectorAll("button").forEach((button) => {
        const text = button.textContent?.trim() || "";
        const element = button as HTMLButtonElement;

        if (
          text.includes("Upload Proof") ||
          text.includes("Complete Without Proof")
        ) {
          element.style.display = "none";
          return;
        }

        if (
          text.includes("Photo Proof Required") ||
          text.includes("Ready for Approval") ||
          text.includes("Complete Stage")
        ) {
          element.disabled = false;
          element.removeAttribute("disabled");
          element.removeAttribute("title");
          element.dataset.yfCompleteStage = "true";
          element.textContent = "✓ Complete Stage";
        }
      });

      document
        .querySelectorAll("p, span, div")
        .forEach((node) => {
          const element = node as HTMLElement;
          const text = element.textContent?.trim() || "";

          if (
            text === "Admin Approval Pending" ||
            text === "Approval Required" ||
            text.includes("item Admin Approval માટે pending છે")
          ) {
            element.style.display = "none";
          } else if (text === "Ready for Approval") {
            element.textContent = "Submitted";
          }
        });
    }

    async function findOrderId(orderNumber: string) {
      if (!orderNumber) return null;

      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select("id")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (error) {
        setToast(`Order Open Error: ${error.message}`);
        return null;
      }

      return data?.id || null;
    }

    async function openFullOrder(article: HTMLElement | null) {
      const orderNumber = getOrderNumber(article);
      const orderId = await findOrderId(orderNumber);

      if (!orderId) {
        setToast("Order મળ્યો નથી.");
        return;
      }

      router.push(`/dashboard/orders/${orderId}`);
    }

    async function completeWithoutVisibleProof(
      article: HTMLElement | null
    ) {
      if (busy) return;
      busy = true;

      const orderNumber = getOrderNumber(article);

      if (!orderNumber) {
        setToast("Order Number મળ્યો નથી.");
        busy = false;
        return;
      }

      if (!window.confirm("આ Stageનું કામ પૂર્ણ છે?")) {
        busy = false;
        return;
      }

      setToast("Stage complete કરી રહ્યા છીએ...");

      const supabase = createClient();

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("id, order_number")
        .eq("order_number", orderNumber)
        .maybeSingle();

      if (orderError || !order) {
        setToast(
          `Order Load Error: ${orderError?.message || "Order મળ્યો નથી."}`
        );
        busy = false;
        return;
      }

      const { data: work, error: workError } = await supabase
        .from("order_stage_work")
        .select("id, status")
        .eq("order_id", order.id)
        .in("status", ACTIVE_WORK_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (workError || !work) {
        setToast(
          `Stage Load Error: ${workError?.message || "Active Stage મળ્યો નથી."}`
        );
        busy = false;
        return;
      }

      if (work.status !== "in_progress") {
        setToast("પહેલા Start Work કરો.");
        busy = false;
        return;
      }

      const { error: waiveError } = await supabase.rpc(
        "employee_waive_stage_proof",
        {
          p_work_id: work.id,
          p_reason:
            "Photo/Video proof hidden by current YashFlow workflow",
        }
      );

      if (waiveError) {
        console.warn("Proof waiver skipped:", waiveError.message);
      }

      const { data, error } = await supabase.rpc(
        "employee_complete_stage_v4",
        {
          p_work_id: work.id,
        }
      );

      if (error) {
        setToast(`Complete Stage Error: ${error.message}`);
        busy = false;
        return;
      }

      const result = (data || {}) as {
        action?: string;
        next_stage_name?: string;
      };

      if (result.action === "order_completed") {
        setToast(`${order.order_number} Completed ✅`);
      } else if (result.action === "next_stage_created") {
        setToast(
          result.next_stage_name
            ? `${order.order_number} → ${result.next_stage_name} ✅`
            : "Next Stage શરૂ થયો ✅"
        );
      } else {
        setToast("Stage Submitted ✅");
      }

      window.setTimeout(() => {
        window.location.reload();
      }, 700);
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button") as HTMLButtonElement | null;
      const article = target?.closest("article") as HTMLElement | null;

      if (!button || !article) return;

      if (button.dataset.yfCompleteStage === "true") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void completeWithoutVisibleProof(article);
        return;
      }

      const text = button.textContent?.trim() || "";
      const isOrderNumberButton = button.classList.contains("text-blue-700");
      const isViewButton =
        text === "View Details" ||
        text.includes("Full Order Page") ||
        text.includes("Full View");

      if (isOrderNumberButton || isViewButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        void openFullOrder(article);
      }
    }

    applyEmployeeOrderOverrides();

    const observer = new MutationObserver(() => {
      applyEmployeeOrderOverrides();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    document.addEventListener("click", handleClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleClick, true);
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!pathname?.startsWith("/dashboard/orders/")) return;

    function hideOldTimeline() {
      document.querySelectorAll("h2").forEach((heading) => {
        if (heading.textContent?.trim() === "Stage Timeline") {
          const section = heading.closest("section") as HTMLElement | null;
          if (section) section.style.display = "none";
        }
      });

      document.querySelectorAll("span").forEach((node) => {
        if (node.textContent?.trim() === "Ready For Approval") {
          node.textContent = "Submitted";
        }
      });
    }

    hideOldTimeline();

    const observer = new MutationObserver(hideOldTimeline);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  if (!toast) return null;

  return (
    <div className="fixed left-1/2 top-4 z-[100] -translate-x-1/2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-900 shadow-xl">
      {toast}
    </div>
  );
}
