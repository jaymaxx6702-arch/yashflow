"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  initialiseNativePermissions,
  registerNativeBackHandler,
  registerNativeFcmToken,
} from "@/utils/native-app";

async function uploadFcmToken(token: string) {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return false;

  const response = await fetch("/api/push/native/subscribe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      token,
      platform: "android",
    }),
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || "Native push token save failed.");
  }

  return true;
}

export default function NativeAppBootstrap() {
  useEffect(() => {
    let cancelled = false;
    let removeRegistrationListener: (() => Promise<void>) | undefined;
    let removeBackListener: (() => Promise<void>) | undefined;
    const supabase = createClient();

    async function setupNative() {
      const result = await initialiseNativePermissions();
      if (!result.native || cancelled) return;

      window.localStorage.setItem(
        "yashflow-native-permissions-v1",
        "done"
      );

      const backRegistration = await registerNativeBackHandler();
      removeBackListener =
        "remove" in backRegistration ? backRegistration.remove : undefined;

      const registration = await registerNativeFcmToken(async (token) => {
        window.localStorage.setItem("yashflow-native-fcm-token", token);
        try {
          const saved = await uploadFcmToken(token);
          if (saved) {
            window.localStorage.setItem(
              "yashflow-native-fcm-token-synced",
              token
            );
          }
        } catch (error) {
          console.warn("Native FCM token upload failed", error);
        }
      });

      removeRegistrationListener =
        "remove" in registration ? registration.remove : undefined;
    }

    void setupNative();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session || cancelled) return;

        const token = window.localStorage.getItem(
          "yashflow-native-fcm-token"
        );
        const synced = window.localStorage.getItem(
          "yashflow-native-fcm-token-synced"
        );

        if (token && token !== synced) {
          void uploadFcmToken(token)
            .then((saved) => {
              if (saved) {
                window.localStorage.setItem(
                  "yashflow-native-fcm-token-synced",
                  token
                );
              }
            })
            .catch((error) => {
              console.warn("Native FCM token resync failed", error);
            });
        }
      }
    );

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      void removeRegistrationListener?.();
      void removeBackListener?.();
    };
  }, []);

  return null;
}
