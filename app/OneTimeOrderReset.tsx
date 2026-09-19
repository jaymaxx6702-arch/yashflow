"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

const RESET_KEY = "yf-order-reset-2026-09-19-v1";

export default function OneTimeOrderReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith("/admin")) return;
    if (window.localStorage.getItem(RESET_KEY) === "done") return;

    let cancelled = false;

    async function runReset() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || cancelled) return;

      const response = await fetch("/api/admin/clear-existing-orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      if (!response.ok || cancelled) return;

      window.localStorage.setItem(RESET_KEY, "done");
      window.location.reload();
    }

    void runReset();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
