"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getNativeYashFlowAppInfo,
  isNativeYashFlow,
  startNativeYashFlowUpdate,
} from "@/utils/native-app";

type BuildInfo = {
  version: string;
  versionCode: number;
  buildType: "release" | "debug";
  commit: string;
};

export default function NativeUpdateManager() {
  const [latest, setLatest] = useState<BuildInfo | null>(null);
  const [installedBuild, setInstalledBuild] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const checkForUpdate = useCallback(async () => {
    if (!isNativeYashFlow()) return;

    try {
      const [info, response] = await Promise.all([
        getNativeYashFlowAppInfo(),
        fetch("/download/version.json", {
          cache: "no-store",
        }),
      ]);

      if (!info || !response.ok) return;

      const build = Number(info.build || 0);
      const next = (await response.json()) as BuildInfo;

      setInstalledBuild(build);

      if (
        next?.buildType === "release" &&
        Number.isFinite(next.versionCode) &&
        next.versionCode > build
      ) {
        setLatest(next);
      } else {
        setLatest(null);
      }
    } catch (error) {
      console.warn("YashFlow update check failed", error);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkForUpdate();
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [checkForUpdate]);

  async function installUpdate() {
    if (!latest || busy) return;

    setBusy(true);
    setMessage("");

    const url = new URL(
      "/download/YashFlow.apk",
      window.location.origin
    ).toString();

    const result = await startNativeYashFlowUpdate(url);

    if (result.permissionRequired) {
      setMessage(
        "Androidમાં Install unknown apps માટે YashFlowને Allow કરો. Settingમાંથી પાછા આવી ફરી Update Now દબાવો."
      );
      setBusy(false);
      return;
    }

    if (!result.started) {
      setMessage(
        result.error ||
          "Update download શરૂ થઈ શક્યું નથી. થોડા સમય પછી ફરી પ્રયત્ન કરો."
      );
      setBusy(false);
      return;
    }

    setMessage(
      "Update download થઈ રહ્યું છે. Download complete થયા પછી Android installer ખુલી જશે."
    );

    window.setTimeout(() => {
      setBusy(false);
    }, 5000);
  }

  if (!latest || installedBuild == null) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[200] sm:left-auto sm:right-5 sm:w-[420px]">
      <div className="rounded-3xl border border-blue-200 bg-white shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-800 to-blue-600 px-4 py-3 text-white">
          <p className="text-[10px] font-black tracking-[0.15em] text-blue-100">
            YASHFLOW UPDATE
          </p>
          <div className="flex items-center justify-between gap-3 mt-1">
            <div>
              <h3 className="text-lg font-black">
                New Version {latest.version}
              </h3>
              <p className="text-xs font-semibold text-blue-100 mt-0.5">
                Installed #{installedBuild} → New #{latest.versionCode}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setLatest(null)}
              className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 font-black"
              aria-label="Later"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-4">
          <p className="text-sm font-semibold text-slate-600">
            નવી native APK available છે. Web data/login delete નહીં થાય.
          </p>

          {message && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              {message}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => setLatest(null)}
              className="yf-btn yf-btn-secondary justify-center"
            >
              Later
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => void installUpdate()}
              className="yf-btn yf-btn-primary justify-center disabled:opacity-60"
            >
              {busy ? "Starting..." : "Update Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
