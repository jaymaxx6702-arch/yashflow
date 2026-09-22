"use client";

import { useEffect } from "react";
import { initialiseNativePermissions } from "@/utils/native-app";

export default function NativeAppBootstrap() {
  useEffect(() => {
    const key = "yashflow-native-permissions-v1";
    if (window.localStorage.getItem(key) === "done") return;

    const timer = window.setTimeout(() => {
      void initialiseNativePermissions().then((result) => {
        if (result.native) {
          window.localStorage.setItem(key, "done");
        }
      });
    }, 700);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
