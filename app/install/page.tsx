"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export default function InstallYashFlowPage() {
  const [message, setMessage] = useState("");

  const apkPath = "/download/YashFlow.apk";

  const apkUrl = useMemo(() => {
    if (typeof window === "undefined") return apkPath;
    return `${window.location.origin}${apkPath}`;
  }, []);

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "YashFlow App",
          text: "YashFlow Android App install કરવા માટે આ link ખોલો:",
          url: apkUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(apkUrl);
      setMessage("APK link copy થઈ ગઈ ✅");
    } catch {
      setMessage("Share cancel થયું અથવા browser share support કરતું નથી.");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(apkUrl);
      setMessage("APK link copy થઈ ગઈ ✅");
    } catch {
      setMessage(`આ link share કરો: ${apkUrl}`);
    }
  }

  return (
    <main className="yf-page min-h-screen">
      <div className="yf-container max-w-3xl py-6 sm:py-10">
        <section className="yf-card overflow-hidden">
          <div className="bg-gradient-to-br from-blue-700 to-blue-500 px-6 py-8 sm:px-10 sm:py-10 text-center text-white">
            <div className="mx-auto h-20 w-20 rounded-3xl bg-white shadow-lg flex items-center justify-center overflow-hidden">
              <img
                src="/icon-192.png"
                alt="YashFlow"
                className="h-full w-full object-cover"
              />
            </div>

            <p className="mt-5 text-[11px] font-black tracking-[0.18em] text-blue-100">
              YASH LASER
            </p>

            <h1 className="mt-1 text-3xl sm:text-4xl font-black">
              Install YashFlow
            </h1>

            <p className="mt-2 text-sm text-blue-100">
              Yash Laser Work Management
            </p>
          </div>

          <div className="p-5 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="yf-card-soft p-4">
                <p className="text-[10px] font-black tracking-wide text-slate-500">
                  PLATFORM
                </p>
                <p className="mt-1 font-black text-slate-900">Android</p>
              </div>

              <div className="yf-card-soft p-4">
                <p className="text-[10px] font-black tracking-wide text-slate-500">
                  VERSION
                </p>
                <p className="mt-1 font-black text-slate-900">1.0.0</p>
              </div>

              <div className="yf-card-soft p-4">
                <p className="text-[10px] font-black tracking-wide text-slate-500">
                  SOURCE
                </p>
                <p className="mt-1 font-black text-slate-900">Yash Laser</p>
              </div>
            </div>

            <a
              href={apkPath}
              download
              className="yf-btn yf-btn-primary mt-5 w-full justify-center py-3.5 text-base"
            >
              Download YashFlow APK
            </a>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleShare}
                className="yf-btn yf-btn-secondary justify-center"
              >
                Share Link
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="yf-btn yf-btn-secondary justify-center"
              >
                Copy Link
              </button>
            </div>

            {message && (
              <div className="yf-alert yf-alert-info mt-4">
                {message}
              </div>
            )}

            <div className="mt-6">
              <p className="text-sm font-black text-slate-900">
                Androidમાં install કરવાની રીત
              </p>

              <div className="mt-3 space-y-3">
                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">
                    1
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    ઉપરનું <b>Download YashFlow APK</b> button દબાવો.
                  </p>
                </div>

                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">
                    2
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    Download પૂર્ણ થયા પછી APK file open કરો.
                  </p>
                </div>

                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">
                    3
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    પહેલી વાર Android પૂછે તો <b>Allow from this source</b> /{" "}
                    <b>Install unknown apps</b> permission આપો.
                  </p>
                </div>

                <div className="flex gap-3">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">
                    4
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    <b>Install</b> દબાવો. ત્યારબાદ YashFlow app icon mobileમાં
                    દેખાશે.
                  </p>
                </div>
              </div>
            </div>

            <div className="yf-alert yf-alert-warning mt-6">
              <p className="font-black">Important</p>
              <p className="mt-1 text-sm">
                APK ફક્ત Android માટે છે. iPhone/iPadમાં આ APK install નહીં થાય.
              </p>
            </div>

            <div className="mt-6 text-center">
              <Link
                href="/"
                className="text-sm font-black text-blue-700 hover:underline"
              >
                Open YashFlow Web App →
              </Link>
            </div>
          </div>
        </section>

        <p className="mt-4 text-center text-[11px] font-semibold text-slate-400">
          YashFlow • A Product of Yash Laser
        </p>
      </div>
    </main>
  );
}
