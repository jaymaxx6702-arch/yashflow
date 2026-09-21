"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type GeofenceSettings = {
  id: number;
  office_name: string;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
  max_accuracy_m: number;
  require_check_in: boolean;
  require_check_out: boolean;
  is_active: boolean;
  updated_at: string;
};

type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

function getBestBrowserLocation(): Promise<BrowserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("આ device/browser GPS Location support કરતું નથી."));
      return;
    }

    let best: BrowserLocation | null = null;
    let finished = false;
    let watchId: number | null = null;

    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }

      if (error) {
        reject(error);
        return;
      }

      if (!best) {
        reject(
          new Error(
            "GPS Location મળ્યું નથી. Phone Location/GPS ચાલુ કરો અને ફરી Try કરો."
          )
        );
        return;
      }

      // Do not let a Wi‑Fi/IP estimate become the office geofence.
      if (best.accuracy > 250) {
        reject(
          new Error(
            `Office Location set કરી શકાતું નથી. GPS Accuracy ±${Math.round(
              best.accuracy
            )}m છે. Mobileમાં Precise Location ON કરીને office પર ફરી Try કરો.`
          )
        );
        return;
      }

      resolve(best);
    };

    const timeoutId = window.setTimeout(() => {
      finish();
    }, 12000);

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const candidate: BrowserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        if (!best || candidate.accuracy < best.accuracy) {
          best = candidate;
        }

        // Good mobile GPS: stop early.
        if (candidate.accuracy <= 50) {
          window.clearTimeout(timeoutId);
          finish();
        }
      },
      (error) => {
        window.clearTimeout(timeoutId);

        if (error.code === error.PERMISSION_DENIED) {
          finish(
            new Error(
              "Location Permission denied છે. Browser Settingsમાં Precise Location Allow કરો."
            )
          );
        } else if (error.code === error.TIMEOUT) {
          finish(
            new Error(
              "GPS Location timeout થયું. બહાર/બારી પાસે જઈ ફરી Try કરો."
            )
          );
        } else {
          finish(
            new Error(
              "GPS Location મળ્યું નથી. Mobile Location/GPS ચાલુ છે કે નહીં ચેક કરો."
            )
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function AdminGpsSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");

  const [officeName, setOfficeName] = useState("Yash Laser Office");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusM, setRadiusM] = useState("200");
  const [maxAccuracyM, setMaxAccuracyM] = useState("150");
  const [requireCheckIn, setRequireCheckIn] = useState(true);
  const [requireCheckOut, setRequireCheckOut] = useState(true);
  const [isActive, setIsActive] = useState(false);

  const [currentLocation, setCurrentLocation] =
    useState<BrowserLocation | null>(null);

  const distanceFromSaved = useMemo(() => {
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
      !currentLocation ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return null;
    }

    return Math.round(
      distanceMeters(
        lat,
        lon,
        currentLocation.latitude,
        currentLocation.longitude
      )
    );
  }, [currentLocation, latitude, longitude]);

  async function loadSettings() {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("attendance_geofence_settings")
      .select(
        "id, office_name, latitude, longitude, radius_m, max_accuracy_m, require_check_in, require_check_out, is_active, updated_at"
      )
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      setMessage(`GPS Settings Load Error: ${error.message}`);
      return;
    }

    const settings = data as GeofenceSettings | null;

    if (!settings) return;

    setOfficeName(settings.office_name || "Yash Laser Office");
    setLatitude(
      settings.latitude === null ? "" : String(settings.latitude)
    );
    setLongitude(
      settings.longitude === null ? "" : String(settings.longitude)
    );
    setRadiusM(String(settings.radius_m || 200));
    setMaxAccuracyM(String(settings.max_accuracy_m || 150));
    setRequireCheckIn(settings.require_check_in);
    setRequireCheckOut(settings.require_check_out);
    setIsActive(settings.is_active);
  }

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("employees")
        .select("id, role, approval_status, is_active")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (
        adminError ||
        !admin ||
        admin.role !== "admin" ||
        admin.approval_status !== "approved" ||
        !admin.is_active
      ) {
        router.replace("/dashboard");
        return;
      }

      await loadSettings();
      setLoading(false);
    }

    void init();
  }, [router]);

  async function captureLocation(useAsOffice: boolean) {
    setLocating(true);
    setMessage("");

    try {
      const location = await getBestBrowserLocation();

      setCurrentLocation(location);

      if (useAsOffice) {
        const nextLatitude = location.latitude.toFixed(8);
        const nextLongitude = location.longitude.toFixed(8);

        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        setMessage(
          `Office GPS capture થયું ✅ Accuracy ±${Math.round(
            location.accuracy
          )}m • Databaseમાં save કરી રહ્યા છીએ...`
        );

        const saved = await persistGpsSettings({
          latitude: Number(nextLatitude),
          longitude: Number(nextLongitude),
          active: true,
        });

        if (!saved) return;

        setIsActive(true);
        setMessage(
          `Office GPS Saved & Verified ✅ Accuracy ±${Math.round(
            location.accuracy
          )}m • Check In હવે આ location સામે verify થશે.`
        );
      } else {
        setMessage(
          `Current GPS મળ્યું ✅ Accuracy ±${Math.round(
            location.accuracy
          )}m`
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "GPS Location મેળવવામાં problem આવી."
      );
    } finally {
      setLocating(false);
    }
  }

  async function persistGpsSettings(input: {
    latitude: number;
    longitude: number;
    active: boolean;
  }) {
    const radius = Number(radiusM);
    const maxAccuracy = Number(maxAccuracyM);

    if (
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90
    ) {
      setMessage("Valid Office Latitude જરૂરી છે.");
      return false;
    }

    if (
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      setMessage("Valid Office Longitude જરૂરી છે.");
      return false;
    }

    if (
      input.active &&
      Math.abs(input.latitude) < 0.000001 &&
      Math.abs(input.longitude) < 0.000001
    ) {
      setMessage("Office GPS 0,0 valid નથી. Office પર ફરી GPS capture કરો.");
      return false;
    }

    if (!Number.isInteger(radius) || radius < 25 || radius > 5000) {
      setMessage("Allowed Radius 25 થી 5000 meter વચ્ચે રાખો.");
      return false;
    }

    if (
      !Number.isInteger(maxAccuracy) ||
      maxAccuracy < 10 ||
      maxAccuracy > 2000
    ) {
      setMessage("Max GPS Accuracy 10 થી 2000 meter વચ્ચે રાખો.");
      return false;
    }

    const supabase = createClient();

    const rpcResult = await supabase.rpc("admin_save_attendance_geofence", {
      p_office_name: officeName.trim() || "Yash Laser Office",
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_radius_m: radius,
      p_max_accuracy_m: maxAccuracy,
      p_require_check_in: requireCheckIn,
      p_require_check_out: requireCheckOut,
      p_is_active: input.active,
    });

    // Never trust an RPC "success" blindly. Read the actual row back.
    let verifyResult = await supabase
      .from("attendance_geofence_settings")
      .select(
        "id, latitude, longitude, radius_m, max_accuracy_m, require_check_in, require_check_out, is_active"
      )
      .eq("id", 1)
      .maybeSingle();

    const rowMatches = () => {
      const row = verifyResult.data;
      if (!row) return false;

      const savedLat = Number(row.latitude);
      const savedLon = Number(row.longitude);

      return (
        Number.isFinite(savedLat) &&
        Number.isFinite(savedLon) &&
        Math.abs(savedLat - input.latitude) < 0.000001 &&
        Math.abs(savedLon - input.longitude) < 0.000001 &&
        Boolean(row.is_active) === input.active
      );
    };

    if (!rowMatches()) {
      // Production has had an older admin_save_attendance_geofence RPC that
      // can return without updating id=1. Use the authenticated Admin RLS path
      // as a repair fallback, then verify again.
      const directResult = await supabase
        .from("attendance_geofence_settings")
        .update({
          office_name: officeName.trim() || "Yash Laser Office",
          latitude: input.latitude,
          longitude: input.longitude,
          radius_m: radius,
          max_accuracy_m: maxAccuracy,
          require_check_in: requireCheckIn,
          require_check_out: requireCheckOut,
          is_active: input.active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (directResult.error) {
        setMessage(
          `GPS DB Save Error: RPC: ${rpcResult.error?.message || "row update mismatch"} • Direct Update: ${directResult.error.message}`
        );
        return false;
      }

      verifyResult = await supabase
        .from("attendance_geofence_settings")
        .select(
          "id, latitude, longitude, radius_m, max_accuracy_m, require_check_in, require_check_out, is_active"
        )
        .eq("id", 1)
        .maybeSingle();
    }

    if (verifyResult.error || !rowMatches()) {
      const row = verifyResult.data;
      setMessage(
        `GPS Save Verify Failed: requested ${input.latitude.toFixed(
          6
        )}, ${input.longitude.toFixed(6)} • DB has ${String(
          row?.latitude ?? "null"
        )}, ${String(row?.longitude ?? "null")}`
      );
      return false;
    }

    await loadSettings();
    return true;
  }

  async function saveSettings(activeOverride?: boolean) {
    const nextActive =
      typeof activeOverride === "boolean" ? activeOverride : isActive;

    if (
      currentLocation &&
      currentLocation.accuracy > 250 &&
      Math.abs(Number(latitude) - currentLocation.latitude) < 0.0000001 &&
      Math.abs(Number(longitude) - currentLocation.longitude) < 0.0000001
    ) {
      setMessage(
        `Save blocked: captured GPS accuracy ±${Math.round(
          currentLocation.accuracy
        )}m છે. Mobile Precise GPSથી office location ફરી capture કરો.`
      );
      return;
    }

    const lat = latitude.trim() ? Number(latitude) : 0;
    const lon = longitude.trim() ? Number(longitude) : 0;

    setSaving(true);
    setMessage("");

    const saved = await persistGpsSettings({
      latitude: lat,
      longitude: lon,
      active: nextActive,
    });

    if (saved) {
      setIsActive(nextActive);
      setMessage(
        nextActive
          ? `GPS Requirement ON & DB Verified ✅ Office: ${lat.toFixed(
              6
            )}, ${lon.toFixed(6)}`
          : "GPS Requirement OFF & DB Verified ✅"
      );
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card p-5 font-bold text-slate-700">
          GPS Settings લોડ થઈ રહ્યું છે...
        </div>
      </main>
    );
  }

  return (
    <main className="yf-page pb-8">
      <header className="yf-header">
        <div className="yf-container py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.16em] text-blue-100">
              YASHFLOW ADMIN
            </p>

            <h1 className="text-xl sm:text-2xl font-black text-white mt-0.5">
              GPS Attendance
            </h1>

            <p className="text-xs text-blue-100 font-semibold mt-1">
              Office Geofence • Check In / Check Out
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <div className="yf-container max-w-3xl">
        {message && (
          <div className="mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            {message}
          </div>
        )}

        <section className="yf-card p-4 sm:p-5 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
                MASTER GPS CONTROL
              </p>
              <h2 className="text-lg font-black text-slate-900 mt-1">
                Employee GPS Requirement
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                ON હોય ત્યારે Employee Login સમયે GPS/Location જરૂરી છે. OFF હોય ત્યારે બધા Employee GPS વગર Login અને Attendance કરી શકે.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void saveSettings(!isActive)}
              disabled={saving}
              className={`yf-btn min-w-[180px] justify-center disabled:opacity-50 ${
                isActive
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-slate-700 text-white hover:bg-slate-800"
              }`}
            >
              {saving
                ? "Saving..."
                : isActive
                ? "🟢 GPS ON — Turn OFF"
                : "⚪ GPS OFF — Turn ON"}
            </button>
          </div>
        </section>

        <section className="yf-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
                OFFICE LOCATION
              </p>
              <h2 className="text-lg font-black text-slate-900 mt-1">
                Attendance Geofence
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">
                Officeમાં Mobile + Precise GPS સાથે “Use Current Location” કરો. Desktop/IP location use કરશો નહીં.
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-[10px] font-black ${
                isActive
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {isActive ? "ACTIVE" : "OFF"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void captureLocation(true)}
            disabled={locating}
            className="yf-btn yf-btn-primary w-full justify-center mt-4 disabled:opacity-50"
          >
            {locating
              ? "Getting GPS & Saving..."
              : "📍 Capture & Save Current Office Location"}
          </button>

          {currentLocation && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="rounded-xl bg-green-50 p-3">
                <p className="text-[9px] font-black text-green-700">
                  CURRENT GPS
                </p>
                <p className="text-xs font-black mt-1">
                  Captured
                </p>
              </div>

              <div className="rounded-xl bg-blue-50 p-3">
                <p className="text-[9px] font-black text-blue-700">
                  ACCURACY
                </p>
                <p className="text-xs font-black mt-1">
                  ±{Math.round(currentLocation.accuracy)}m
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[9px] font-black text-slate-500">
                  DISTANCE
                </p>
                <p className="text-xs font-black mt-1">
                  {distanceFromSaved === null
                    ? "-"
                    : `${distanceFromSaved}m`}
                </p>
              </div>
            </div>
          )}

          {currentLocation && currentLocation.accuracy > 250 && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm font-black text-red-700">
                ⚠ GPS Accuracy Too Weak
              </p>
              <p className="text-xs font-semibold text-red-600 mt-1">
                ±{Math.round(currentLocation.accuracy)}m accuracy office geofence માટે reliable નથી.
                Mobileમાં Precise Location ON કરીને office પર ફરી capture કરો.
              </p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3 mt-5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-black text-slate-500 mb-1">
                Office Name
              </label>

              <input
                value={officeName}
                onChange={(event) => setOfficeName(event.target.value)}
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-1">
                Latitude
              </label>

              <input
                inputMode="decimal"
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                placeholder="23.xxxxxxxx"
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-1">
                Longitude
              </label>

              <input
                inputMode="decimal"
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                placeholder="72.xxxxxxxx"
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-1">
                Allowed Radius (Meter)
              </label>

              <input
                type="number"
                min="25"
                max="5000"
                value={radiusM}
                onChange={(event) => setRadiusM(event.target.value)}
                className="yf-input"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-500 mb-1">
                Max GPS Accuracy (Meter)
              </label>

              <input
                type="number"
                min="10"
                max="2000"
                value={maxAccuracyM}
                onChange={(event) =>
                  setMaxAccuracyM(event.target.value)
                }
                className="yf-input"
              />
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
              <div>
                <p className="text-sm font-black text-slate-900">
                  Check In Geofence
                </p>
                <p className="text-[10px] font-semibold text-slate-500">
                  Office radius બહાર Check In block કરો
                </p>
              </div>

              <input
                type="checkbox"
                checked={requireCheckIn}
                onChange={(event) =>
                  setRequireCheckIn(event.target.checked)
                }
                className="w-5 h-5"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 cursor-pointer">
              <div>
                <p className="text-sm font-black text-slate-900">
                  Check Out Geofence
                </p>
                <p className="text-[10px] font-semibold text-slate-500">
                  Office radius બહાર Check Out block કરો
                </p>
              </div>

              <input
                type="checkbox"
                checked={requireCheckOut}
                onChange={(event) =>
                  setRequireCheckOut(event.target.checked)
                }
                className="w-5 h-5"
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-3 cursor-pointer">
              <div>
                <p className="text-sm font-black text-green-900">
                  GPS Login + Attendance Active
                </p>
                <p className="text-[10px] font-semibold text-green-700">
                  Master GPS requirement ચાલુ/બંધ કરો
                </p>
              </div>

              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) =>
                  setIsActive(event.target.checked)
                }
                className="w-5 h-5"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="yf-btn yf-btn-success w-full justify-center mt-5 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save GPS Settings"}
          </button>
        </section>

        <section className="yf-card p-4 mt-3">
          <p className="text-xs font-black text-slate-700">
            Recommended Start
          </p>

          <p className="text-xs font-semibold text-slate-500 mt-1 leading-relaxed">
            શરૂઆતમાં Radius 200m અને Max Accuracy 150m રાખો. Office Location capture માટે ±250mથી ખરાબ GPS હવે block થશે; Mobile Precise GPS વધુ યોગ્ય છે.
          </p>
        </section>
      </div>
    </main>
  );
}
