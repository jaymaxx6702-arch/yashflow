"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  enqueueOfflineAction,
  getOfflineActionsForEmployee,
  isLikelyNetworkError,
  offlineQueueEventName,
} from "@/utils/offline-queue";
import TodaysWork from "./TodaysWork";
import NotificationBell from "./NotificationBell";
import ManualPunchRequest from "./ManualPunchRequest";

type Employee = {
  id: string;
  full_name: string;
  mobile: string;
  department: string | null;
  role: string | null;
  approval_status: string;
  is_active: boolean;
};

type Department = {
  id: number;
  name: string;
};

type EmployeeDepartment = {
  department_id: number;
  is_primary: boolean;
  departments: Department | Department[] | null;
};

type Attendance = {
  id: string;
  attendance_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  attendance_type: string;
  late_minutes: number;
  working_minutes: number;
  approval_required: boolean;
  approval_status: string;
  approved_at: string | null;
  admin_note: string | null;
};

type OfficeSettings = {
  office_start_time: string;
  grace_minutes: number;
  office_end_time: string;
  recess_start_time: string;
  recess_end_time: string;
  half_day_checkin_time: string;
  standard_work_minutes: number;
  timezone: string;
};

type AttendanceGpsSettings = {
  latitude: number | null;
  longitude: number | null;
  require_check_in: boolean;
  require_check_out: boolean;
  is_active: boolean;
};

type SummaryDrawerKey =
  | "attendance"
  | "department_orders"
  | "pending_leave"
  | "working_today"
  | "attendance_policy"
  | null;

function CompactTile({
  label,
  value,
  icon,
  className = "",
  onClick,
}: {
  label: string;
  value: string | number;
  icon: string;
  className?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black tracking-wide text-slate-500">
          {label}
        </p>
        <span className="text-base">{icon}</span>
      </div>
      <p className="text-base sm:text-lg font-black text-slate-900 mt-1 truncate">
        {value}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:shadow-md transition ${className}`}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm ${className}`}
    >
      {body}
    </div>
  );
}

function QuickApp({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 min-h-[84px] shadow-sm hover:shadow-md active:scale-[0.98] transition"
    >
      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lg">
        {icon}
      </div>
      <span className="text-[11px] font-black text-slate-700 text-center leading-tight">
        {label}
      </span>
    </button>
  );
}

export default function EmployeeDashboard() {
  const router = useRouter();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [employeeDepartments, setEmployeeDepartments] = useState<
    EmployeeDepartment[]
  >([]);
  const [officeSettings, setOfficeSettings] =
    useState<OfficeSettings | null>(null);
  const [gpsSettings, setGpsSettings] =
    useState<AttendanceGpsSettings | null>(null);
  const [gpsSettingsLoaded, setGpsSettingsLoaded] = useState(false);

  const [departmentOrderCount, setDepartmentOrderCount] = useState(0);
  const [pendingLeaveCount, setPendingLeaveCount] = useState(0);
  const [canViewPurchase, setCanViewPurchase] = useState(false);
  const [canViewDispatch, setCanViewDispatch] = useState(false);
  const [canCreateOrders, setCanCreateOrders] = useState(false);
  const [canUseManagementAccess, setCanUseManagementAccess] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [summaryDrawer, setSummaryDrawer] =
    useState<SummaryDrawerKey>(null);

  function setOfflineAttendanceState(
    kind: "check_in" | "check_out",
    capturedAt = new Date()
  ) {
    if (!officeSettings) return;

    const capturedIso = capturedAt.toISOString();

    setAttendance((current) => {
      if (kind === "check_in") {
        return (
          current || {
            id: "offline-pending-check-in",
            attendance_date: getDateInTimeZone(officeSettings.timezone),
            check_in: capturedIso,
            check_out: null,
            status: "present",
            attendance_type: "offline_pending",
            late_minutes: 0,
            working_minutes: 0,
            approval_required: true,
            approval_status: "pending",
            approved_at: null,
            admin_note: "Offline Punch In • Pending Sync",
          }
        );
      }

      if (!current?.check_in) return current;

      return {
        ...current,
        check_out: capturedIso,
        approval_required: true,
        approval_status: "pending",
        admin_note: [
          current.admin_note,
          "Offline Punch Out • Pending Sync",
        ]
          .filter(Boolean)
          .join(" | "),
      };
    });
  }

  // Stable refs for Android/browser Back handling.
  const summaryDrawerRef = useRef<SummaryDrawerKey>(null);
  const allowDashboardExitRef = useRef(false);
  const dashboardGuardInstalledRef = useRef(false);

  function getDateInTimeZone(timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    return `${year}-${month}-${day}`;
  }

  function getMinutesFromDate(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const hour = Number(
      parts.find((p) => p.type === "hour")?.value || 0
    );

    const minute = Number(
      parts.find((p) => p.type === "minute")?.value || 0
    );

    return hour * 60 + minute;
  }

  function timeStringToMinutes(value: string) {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }

  function minutesToTimeString(totalMinutes: number) {
    const safeMinutes = ((totalMinutes % 1440) + 1440) % 1440;
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:00`;
  }

  function getGpsLocation(): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
  }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(
          new Error(
            "આ device/browser GPS Location support કરતું નથી."
          )
        );
        return;
      }

      let best:
        | {
            latitude: number;
            longitude: number;
            accuracy: number;
          }
        | null = null;
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

        resolve(best);
      };

      const timeoutId = window.setTimeout(() => {
        finish();
      }, 12000);

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const candidate = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };

          if (!best || candidate.accuracy < best.accuracy) {
            best = candidate;
          }

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
            finish();
          } else {
            finish(
              new Error(
                "GPS Location મળ્યું નથી. Phone Location/GPS ચાલુ કરો."
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

  function formatTime(value: string | null) {
    if (!value) return "-";

    return new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
    });
  }

  function formatOfficeTime(value: string) {
    const [hourString, minuteString] = value.split(":");

    const hour = Number(hourString);
    const minute = Number(minuteString);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;

    return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function formatWorkingMinutes(minutes: number) {
    if (minutes <= 0) return "-";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return `${mins} મિનિટ`;
    }

    return `${hours} કલાક ${mins} મિનિટ`;
  }

  function formatLateMinutes(minutes: number) {
    if (!minutes) return "00:00";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(
      2,
      "0"
    )}`;
  }

  function formatTodayDate(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function formatTodayDay(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
      weekday: "short",
    }).format(date);
  }

  function formatCurrentTime(date: Date) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: officeSettings?.timezone || "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }

  function getAttendanceLabel(type: string) {
    switch (type) {
      case "late":
        return "Late";
      case "half_day":
        return "Half Day";
      case "leave":
        return "Leave";
      case "absent":
        return "Absent";
      default:
        return "Present";
    }
  }

  function getDepartmentFromAssignment(item: EmployeeDepartment) {
    if (Array.isArray(item.departments)) {
      return item.departments[0] || null;
    }

    return item.departments;
  }

  function assignedDepartmentNames() {
    const names = employeeDepartments
      .map((item) => getDepartmentFromAssignment(item)?.name)
      .filter(Boolean) as string[];

    if (names.length > 0) return names;

    return employee?.department ? [employee.department] : [];
  }

  function openDrawer(key: Exclude<SummaryDrawerKey, null>) {
    if (typeof window !== "undefined") {
      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};

      // Drawer માટે માત્ર એક history entry રાખવી.
      if (!summaryDrawerRef.current) {
        window.history.pushState(
          { ...currentState, yfEmployeeDrawer: true },
          "",
          window.location.href
        );
      }
    }

    summaryDrawerRef.current = key;
    setSummaryDrawer(key);
  }

  function closeDrawer() {
    if (
      typeof window !== "undefined" &&
      window.history.state?.yfEmployeeDrawer
    ) {
      window.history.back();
      return;
    }

    summaryDrawerRef.current = null;
    setSummaryDrawer(null);
  }

  function navigateFromDrawer(path: string) {
    if (typeof window !== "undefined") {
      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};

      if (currentState.yfEmployeeDrawer) {
        const { yfEmployeeDrawer: _remove, ...rest } = currentState;
        window.history.replaceState(rest, "", window.location.href);
      }
    }

    summaryDrawerRef.current = null;
    setSummaryDrawer(null);
    router.push(path);
  }

  async function loadEmployeeDepartments(employeeId: string) {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("employee_departments")
      .select(`
        department_id,
        is_primary,
        departments (
          id,
          name
        )
      `)
      .eq("employee_id", employeeId)
      .order("is_primary", { ascending: false });

    if (error) {
      setMessage(`Department Load Error: ${error.message}`);
      return [] as string[];
    }

    const assignments =
      (data || []) as unknown as EmployeeDepartment[];

    setEmployeeDepartments(assignments);

    return assignments
      .map((item) => {
        const departmentData = Array.isArray(item.departments)
          ? item.departments[0] || null
          : item.departments;

        return departmentData?.name || null;
      })
      .filter(Boolean) as string[];
  }

  async function loadModulePermissions() {
    const supabase = createClient();

    const [
      purchaseView,
      purchaseManage,
      dispatchView,
      dispatchManage,
      orderCreate,
      ordersManage,
      attendanceManage,
    ] = await Promise.all([
      supabase.rpc("has_app_permission", {
        p_permission_key: "purchase.view",
      }),
      supabase.rpc("has_app_permission", {
        p_permission_key: "purchase.manage",
      }),
      supabase.rpc("has_app_permission", {
        p_permission_key: "dispatch.view",
      }),
      supabase.rpc("has_app_permission", {
        p_permission_key: "dispatch.manage",
      }),
      supabase.rpc("has_app_permission", {
        p_permission_key: "orders.create",
      }),
      supabase.rpc("has_app_permission", {
        p_permission_key: "orders.manage",
      }),
      supabase.rpc("has_app_permission", {
        p_permission_key: "attendance.manage",
      }),
    ]);

    const firstError =
      purchaseView.error ||
      purchaseManage.error ||
      dispatchView.error ||
      dispatchManage.error ||
      orderCreate.error ||
      ordersManage.error ||
      attendanceManage.error;

    if (firstError) {
      console.warn("Permission Load Error:", firstError.message);
      return;
    }

    setCanViewPurchase(
      Boolean(purchaseView.data) || Boolean(purchaseManage.data)
    );

    setCanViewDispatch(
      Boolean(dispatchView.data) || Boolean(dispatchManage.data)
    );

    setCanCreateOrders(Boolean(orderCreate.data));
    setCanUseManagementAccess(
      Boolean(ordersManage.data) || Boolean(attendanceManage.data)
    );
  }

  async function loadLiveSummary(
    employeeId: string,
    departmentNames: string[]
  ) {
    const supabase = createClient();

    const stageMap: Record<string, string | null> = {
      Design: "design",
      Cutting: "cutting",
      Production: "production",
      Packing: "packing",
      "Transportation/Dispatch": "transportation_dispatch",
      Dispatch: "transportation_dispatch",
      Transportation: "transportation_dispatch",
    };

    const departmentStages = Array.from(
      new Set(
        departmentNames
          .map((name) => stageMap[name] || null)
          .filter(Boolean) as string[]
      )
    );

    const leaveResult = await supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "pending");

    if (!leaveResult.error) {
      setPendingLeaveCount(leaveResult.count || 0);
    }

    if (departmentStages.length === 0) {
      setDepartmentOrderCount(0);
      return;
    }

    const orderResult = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("current_stage", departmentStages);

    if (!orderResult.error) {
      setDepartmentOrderCount(orderResult.count || 0);
    }
  }

  async function loadAttendance(
    employeeId: string,
    settings: OfficeSettings
  ) {
    const supabase = createClient();

    const today = getDateInTimeZone(settings.timezone);

    const { data, error } = await supabase
      .from("attendance")
      .select(
        `
        id,
        attendance_date,
        check_in,
        check_out,
        status,
        attendance_type,
        late_minutes,
        working_minutes,
        approval_required,
        approval_status,
        approved_at,
        admin_note
        `
      )
      .eq("employee_id", employeeId)
      .eq("attendance_date", today)
      .order("check_in", { ascending: false, nullsFirst: false })
      .limit(1);

    if (error) {
      setMessage(`Attendance Load Error: ${error.message}`);
      return;
    }

    setAttendance(((data || [])[0] as Attendance | undefined) || null);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    summaryDrawerRef.current = summaryDrawer;
  }, [summaryDrawer]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    /*
      Dashboard base guard:
      Login પછી Android/browser Back દબાવતા app Login screen તરફ જતું હતું.
      Dashboard mount થાય ત્યારે એક same-page guard entry બનાવીએ.
      Back:
      1) Drawer open હોય → drawer close.
      2) Base dashboard હોય → history.forward() કરીને Dashboard પર જ રાખે.
      Logout button જ dashboardમાંથી session exit કરવાની મંજૂરી આપે.
    */
    if (!dashboardGuardInstalledRef.current) {
      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? window.history.state
          : {};

      if (!currentState.yfEmployeeDashboardGuard) {
        window.history.pushState(
          { ...currentState, yfEmployeeDashboardGuard: true },
          "",
          window.location.href
        );
      }

      dashboardGuardInstalledRef.current = true;
    }

    function handleBrowserBack() {
      if (summaryDrawerRef.current) {
        summaryDrawerRef.current = null;
        setSummaryDrawer(null);
        return;
      }

      if (!allowDashboardExitRef.current) {
        // Guard entry હજુ forward historyમાં છે; ત્યાં પાછા જઈ Dashboard જ રાખો.
        window.setTimeout(() => {
          window.history.forward();
        }, 0);
      }
    }

    window.addEventListener("popstate", handleBrowserBack);

    return () => {
      window.removeEventListener("popstate", handleBrowserBack);
    };
  }, []);

  useEffect(() => {
    async function loadDashboard() {
      const supabase = createClient();

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/");
        return;
      }

      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select(
          "id, full_name, mobile, department, role, approval_status, is_active"
        )
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (empError) {
        // Important: never sign out an authenticated Employee because of
        // a temporary profile/RLS/network read error. This fixes the
        // "Back from Quick Details logs me out" behaviour.
        setMessage(`Employee Profile Load Error: ${empError.message}`);
        setLoading(false);
        return;
      }

      if (
        !empData ||
        empData.approval_status !== "approved" ||
        !empData.is_active
      ) {
        router.replace("/");
        return;
      }

      const [
        { data: settingsData, error: settingsError },
        { data: gpsData, error: gpsError },
      ] = await Promise.all([
        supabase
          .from("office_settings")
          .select(
            `
            office_start_time,
            grace_minutes,
            office_end_time,
            recess_start_time,
            recess_end_time,
            half_day_checkin_time,
            standard_work_minutes,
            timezone
            `
          )
          .eq("is_active", true)
          .single(),
        supabase
          .from("attendance_geofence_settings")
          .select(
            "latitude, longitude, require_check_in, require_check_out, is_active"
          )
          .eq("id", 1)
          .maybeSingle(),
      ]);

      if (settingsError || !settingsData) {
        setMessage("Office timing settings મળી નથી.");
        setLoading(false);
        return;
      }

      setEmployee(empData);
      setOfficeSettings(settingsData);

      if (gpsError) {
        console.warn("GPS Settings Load Error:", gpsError.message);
        setGpsSettings(null);
        setGpsSettingsLoaded(false);
      } else {
        setGpsSettings((gpsData || null) as AttendanceGpsSettings | null);
        setGpsSettingsLoaded(true);
      }

      await loadAttendance(empData.id, settingsData);

      const departmentNames =
        await loadEmployeeDepartments(empData.id);

      const summaryDepartments =
        departmentNames.length > 0
          ? departmentNames
          : empData.department
          ? [empData.department]
          : [];

      await loadLiveSummary(empData.id, summaryDepartments);
      await loadModulePermissions();

      setLoading(false);
    }

    loadDashboard();
  }, [router]);

  useEffect(() => {
    if (!employee || !officeSettings) return;

    const syncAttendanceAfterQueue = () => {
      if (!navigator.onLine) return;

      const hasPendingAttendance =
        getOfflineActionsForEmployee(employee.id).some(
          (action) =>
            action.state === "pending" &&
            (action.type === "attendance_check_in" ||
              action.type === "attendance_check_out")
        );

      if (!hasPendingAttendance) {
        void loadAttendance(employee.id, officeSettings);
      }
    };

    window.addEventListener(
      offlineQueueEventName(),
      syncAttendanceAfterQueue
    );

    return () => {
      window.removeEventListener(
        offlineQueueEventName(),
        syncAttendanceAfterQueue
      );
    };
    // loadAttendance is intentionally read from current component scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee, officeSettings]);

  async function handleCheckIn() {
    if (!employee || !officeSettings) return;

    const gpsRequired =
      !gpsSettingsLoaded ||
      Boolean(gpsSettings?.is_active && gpsSettings.require_check_in);

    setAttendanceLoading(true);
    setMessage(
      gpsRequired
        ? "📍 GPS Location મેળવી રહ્યા છીએ..."
        : "GPS Requirement OFF • Check In કરી રહ્યા છીએ..."
    );

    let capturedLocation: {
      latitude: number;
      longitude: number;
      accuracy: number;
    } | null = null;

    try {
      const location = gpsRequired
        ? await getGpsLocation()
        : {
            latitude: gpsSettings?.latitude ?? 0,
            longitude: gpsSettings?.longitude ?? 0,
            accuracy: 0,
          };

      capturedLocation = location;

      if (!navigator.onLine) {
        enqueueOfflineAction(
          "attendance_check_in",
          {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
          },
          { ownerEmployeeId: employee.id }
        );
        setOfflineAttendanceState("check_in");
        setMessage(
          "Offline • Punch In deviceમાં save થયું ☁️ Internet આવ્યા પછી auto-sync + Admin Review થશે."
        );
        setAttendanceLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Check In Error: Session મળ્યો નથી. ફરી login કરો.");
        setAttendanceLoading(false);
        return;
      }

      const response = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        check_in?: string;
        attendance_type?: string;
        late_minutes?: number;
        distance_m?: number | null;
        accuracy_m?: number | null;
        approval_required?: boolean;
        gps_required?: boolean;
      };

      if (!response.ok || !result.check_in) {
        if (response.status === 409) {
          await loadAttendance(employee.id, officeSettings);
        }

        setMessage(
          `Check In Error: ${result.error || "Check In save થયું નથી."}`
        );
        setAttendanceLoading(false);
        return;
      }

      await loadAttendance(employee.id, officeSettings);

      const distanceText =
        result.distance_m === null || result.distance_m === undefined
          ? ""
          : ` • Officeથી ${result.distance_m}m`;

      if (result.attendance_type === "half_day") {
        setMessage(
          `Check In સફળ ✅ Half Day • Admin Approval Pending${distanceText}`
        );
      } else if (result.attendance_type === "late") {
        setMessage(
          `Check In સફળ ✅ ${result.late_minutes || 0} min Late • Admin Approval Pending${distanceText}`
        );
      } else {
        setMessage(
          result.gps_required
            ? `Check In સફળ ✅ GPS Verified${distanceText}`
            : "Check In સફળ ✅ GPS Requirement OFF"
        );
      }
    } catch (error) {
      if (capturedLocation && isLikelyNetworkError(error)) {
        enqueueOfflineAction(
          "attendance_check_in",
          {
            latitude: capturedLocation.latitude,
            longitude: capturedLocation.longitude,
            accuracy: capturedLocation.accuracy,
          },
          { ownerEmployeeId: employee.id }
        );
        setOfflineAttendanceState("check_in");
        setMessage(
          "Network weak • Punch In Pending Sync ☁️ Internet આવ્યા પછી Admin Review થશે."
        );
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "GPS Location મેળવવામાં problem આવી."
        );
      }
    }

    setAttendanceLoading(false);
  }

  async function handleCheckOut() {
    if (
      !employee ||
      !attendance ||
      !attendance.check_in ||
      !officeSettings
    ) {
      return;
    }

    const nowMinutes = getMinutesFromDate(new Date(), officeSettings.timezone);
    const officeEndMinutes = timeStringToMinutes(officeSettings.office_end_time);
    const isEarlyCheckout = nowMinutes < officeEndMinutes;
    let earlyReason: string | null = null;

    if (isEarlyCheckout) {
      const reason = window.prompt(
        `Office End ${formatOfficeTime(
          officeSettings.office_end_time
        )} પહેલાં Punch Out કરી રહ્યા છો. Reason લખો:`
      );

      if (reason === null) return;

      if (reason.trim().length < 3) {
        setMessage("Early Punch Out માટે Reason જરૂરી છે.");
        return;
      }

      earlyReason = reason.trim();
    }

    const confirmed = window.confirm(
      isEarlyCheckout
        ? "Early Punch Out confirm કરવું છે?"
        : "હમણાં Check Out કરવું છે?"
    );

    if (!confirmed) return;

    const gpsRequired =
      !gpsSettingsLoaded ||
      Boolean(gpsSettings?.is_active && gpsSettings.require_check_out);

    setAttendanceLoading(true);
    setMessage(
      gpsRequired
        ? "📍 GPS Location મેળવી રહ્યા છીએ..."
        : "GPS Requirement OFF • Check Out કરી રહ્યા છીએ..."
    );

    let capturedLocation: {
      latitude: number;
      longitude: number;
      accuracy: number;
    } | null = null;

    try {
      const location = gpsRequired
        ? await getGpsLocation()
        : {
            latitude: gpsSettings?.latitude ?? 0,
            longitude: gpsSettings?.longitude ?? 0,
            accuracy: 0,
          };
      capturedLocation = location;

      if (!navigator.onLine) {
        enqueueOfflineAction(
          "attendance_check_out",
          {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            early_reason: earlyReason,
          },
          { ownerEmployeeId: employee.id }
        );
        setOfflineAttendanceState("check_out");
        setMessage(
          "Offline • Punch Out deviceમાં save થયું ☁️ Internet આવ્યા પછી auto-sync + Admin Review થશે."
        );
        setAttendanceLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage("Check Out Error: Session મળ્યો નથી. ફરી login કરો.");
        setAttendanceLoading(false);
        return;
      }

      const response = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          early_reason: earlyReason,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        check_out?: string;
        working_minutes?: number;
        distance_m?: number | null;
        accuracy_m?: number | null;
        gps_required?: boolean;
        early_checkout?: boolean;
        approval_required?: boolean;
      };

      if (!response.ok || !result.check_out) {
        setMessage(`Check Out Error: ${result.error || "Check Out save થયું નથી."}`);
        setAttendanceLoading(false);
        return;
      }

      setAttendance((current) =>
        current
          ? {
              ...current,
              check_out: result.check_out || current.check_out,
              working_minutes: result.working_minutes || 0,
            }
          : current
      );

      await loadAttendance(employee.id, officeSettings);

      setMessage(
        result.early_checkout
          ? `Early Punch Out સફળ ✅ Reason save થયું • Admin Review Pending • Working Time: ${formatWorkingMinutes(
              result.working_minutes || 0
            )}`
          : result.gps_required
          ? `Check Out સફળ ✅ Working Time: ${formatWorkingMinutes(
              result.working_minutes || 0
            )}${
              result.distance_m === null || result.distance_m === undefined
                ? ""
                : ` • Officeથી ${result.distance_m}m`
            }`
          : `Check Out સફળ ✅ GPS Requirement OFF • Working Time: ${formatWorkingMinutes(
              result.working_minutes || 0
            )}`
      );
    } catch (error) {
      if (capturedLocation && isLikelyNetworkError(error)) {
        enqueueOfflineAction(
          "attendance_check_out",
          {
            latitude: capturedLocation.latitude,
            longitude: capturedLocation.longitude,
            accuracy: capturedLocation.accuracy,
            early_reason: earlyReason,
          },
          { ownerEmployeeId: employee.id }
        );
        setOfflineAttendanceState("check_out");
        setMessage(
          "Network weak • Punch Out Pending Sync ☁️ Internet આવ્યા પછી Admin Review થશે."
        );
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "GPS Location મેળવવામાં problem આવી."
        );
      }
    }

    setAttendanceLoading(false);
  }

  async function handleLogout() {
    allowDashboardExitRef.current = true;

    const supabase = createClient();
    await supabase.auth.signOut();

    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="yf-page flex items-center justify-center">
        <div className="yf-card px-6 py-5 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse" />
          <p className="font-bold text-slate-700">
            Dashboard લોડ થઈ રહ્યું છે...
          </p>
        </div>
      </main>
    );
  }

  if (!employee || !officeSettings) {
    return (
      <main className="yf-page flex items-center justify-center p-4">
        <div className="yf-card p-5 max-w-md w-full">
          <p className="font-black text-slate-900">Dashboard Load Issue</p>
          <p className="text-sm text-slate-600 mt-2">
            {message || "Employee data મળી નથી."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="yf-btn yf-btn-primary mt-4"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const graceEndTime = minutesToTimeString(
    timeStringToMinutes(officeSettings.office_start_time) +
      officeSettings.grace_minutes
  );

  const attendanceStatus = !attendance
    ? "Not Checked In"
    : getAttendanceLabel(attendance.attendance_type);

  return (
    <main className="yf-page pb-24 sm:pb-8">
      <header className="yf-header">
        <div className="yf-container py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 shrink-0 rounded-2xl bg-white border border-[#d4af37]/50 flex items-center justify-center shadow-sm overflow-hidden p-1">
                <img
                  src="/yashflow-logo.png"
                  alt="Yash Laser"
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="min-w-0">
                <p className="text-[9px] font-black tracking-[0.18em] text-slate-200">
                  YASH LASER
                </p>
                <h1 className="text-lg sm:text-xl font-black text-white truncate">
                  YashFlow
                </h1>
                <p className="text-[10px] text-slate-200 font-semibold truncate">
                  {employee.full_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell employeeId={employee.id} />

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#1a2b4c] hover:bg-[#fbf6e7]"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="yf-container">
        {gpsSettingsLoaded && gpsSettings && !gpsSettings.is_active && (
          <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-black text-amber-800">
              📍 GPS Requirement OFF by Admin
            </p>
            <p className="text-xs font-semibold text-amber-700 mt-1">
              Login અને Attendance માટે device GPS હાલમાં ફરજિયાત નથી.
            </p>
          </div>
        )}

        <section className="yf-card overflow-hidden">
          <div className="yf-brand-panel text-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black tracking-[0.14em] text-[#d4af37]">
                  EMPLOYEE
                </p>
                <h2 className="text-lg font-black mt-0.5 truncate">
                  {employee.full_name}
                </h2>

                <div className="flex flex-wrap gap-1.5 mt-2">
                  {assignedDepartmentNames().slice(0, 2).map(
                    (departmentName, index) => (
                      <span
                        key={`${departmentName}-${index}`}
                        className="rounded-full bg-white/10 border border-white/15 px-2.5 py-1 text-[10px] font-black"
                      >
                        {departmentName}
                        {index === 0 ? " • Primary" : ""}
                      </span>
                    )
                  )}

                  <span className="rounded-full bg-green-500/20 border border-green-300/30 px-2.5 py-1 text-[10px] font-black text-green-100">
                    Active
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold text-slate-300">
                  {formatTodayDay(currentDateTime)} •{" "}
                  {formatTodayDate(currentDateTime)}
                </p>
                <p className="text-lg font-black text-white mt-0.5">
                  {formatCurrentTime(currentDateTime)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-sm font-semibold text-blue-900 shadow-sm">
            {message}
          </div>
        )}

        <TodaysWork employeeId={employee.id} />

        <section className="yf-card mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
                TODAY'S ATTENDANCE
              </p>
              <h3 className="text-lg font-black text-slate-900 mt-0.5">
                આજની હાજરી
              </h3>
            </div>

            <div>
              {!attendance && (
                <button
                  type="button"
                  onClick={handleCheckIn}
                  disabled={attendanceLoading}
                  className="yf-btn yf-btn-success disabled:opacity-60"
                >
                  {attendanceLoading ? "Wait..." : "Check In"}
                </button>
              )}

              {attendance && !attendance.check_out && (
                <button
                  type="button"
                  onClick={handleCheckOut}
                  disabled={attendanceLoading}
                  className="yf-btn yf-btn-danger disabled:opacity-60"
                >
                  {attendanceLoading ? "Wait..." : "Check Out"}
                </button>
              )}

              {attendance?.check_out && (
                <div className="text-right">
                  <span className="yf-badge yf-badge-green">
                    Done ✓
                  </span>
                  <p className="text-[10px] font-semibold text-slate-400 mt-1">
                    Correction માટે Manual Punch વાપરો
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <CompactTile
              label="STATUS"
              value={attendanceStatus}
              icon="🟢"
            />
            <CompactTile
              label="CHECK IN"
              value={formatTime(attendance?.check_in || null)}
              icon="↘"
            />
            <CompactTile
              label="CHECK OUT"
              value={formatTime(attendance?.check_out || null)}
              icon="↗"
            />
            <CompactTile
              label="WORKING"
              value={
                attendance?.check_out
                  ? formatWorkingMinutes(attendance.working_minutes)
                  : attendance?.check_in
                  ? "Running"
                  : "-"
              }
              icon="⏱️"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <button
              type="button"
              onClick={() => openDrawer("attendance")}
              className="rounded-xl bg-blue-50 border border-blue-100 px-3 py-2.5 text-[11px] font-black text-blue-700"
            >
              Details
            </button>

            <button
              type="button"
              onClick={() => openDrawer("attendance")}
              className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11px] font-black text-slate-700"
            >
              Manual Punch
            </button>

            <button
              type="button"
              onClick={() => openDrawer("attendance_policy")}
              className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-[11px] font-black text-amber-700"
            >
              Policy
            </button>
          </div>
        </section>

        <section className="yf-card mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-blue-700">
                LIVE SUMMARY
              </p>
              <h3 className="text-lg font-black text-slate-900 mt-0.5">
                Quick Details
              </h3>
            </div>

            <span className="yf-badge yf-badge-blue text-[10px]">
              Live
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            <CompactTile
              label="ATTENDANCE"
              value={attendanceStatus}
              icon="🕘"
              onClick={() => openDrawer("attendance")}
            />

            <CompactTile
              label="DEPT. ORDERS"
              value={departmentOrderCount}
              icon="📦"
              onClick={() => openDrawer("department_orders")}
            />

            <CompactTile
              label="PENDING LEAVE"
              value={pendingLeaveCount}
              icon="🗓️"
              onClick={() => openDrawer("pending_leave")}
            />

            <CompactTile
              label="WORKING TODAY"
              value={
                attendance?.check_out
                  ? formatWorkingMinutes(attendance.working_minutes)
                  : attendance?.check_in
                  ? "Running"
                  : "-"
              }
              icon="⏱️"
              onClick={() => openDrawer("working_today")}
            />
          </div>
        </section>

        <section className="yf-card mt-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.14em] text-violet-700">
                QUICK APPS
              </p>
              <h3 className="text-lg font-black text-slate-900 mt-0.5">
                Work Modules
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mt-3">
            <QuickApp
              label="Orders"
              icon="📦"
              onClick={() => router.push("/dashboard/orders")}
            />
            <QuickApp
              label="Tasks"
              icon="📋"
              onClick={() => router.push("/dashboard/tasks")}
            />
            <QuickApp
              label="Completed Tasks"
              icon="✅"
              onClick={() => router.push("/completed-tasks")}
            />
            {canCreateOrders && (
              <QuickApp
                label="Create Order"
                icon="➕"
                onClick={() => router.push("/dashboard/order-create")}
              />
            )}
            {canUseManagementAccess && (
              <QuickApp
                label="Admin Access"
                icon="🛠️"
                onClick={() => router.push("/dashboard/manage")}
              />
            )}
            <QuickApp
              label="Leave"
              icon="🗓️"
              onClick={() => router.push("/dashboard/leave")}
            />
            <QuickApp
              label="Calendar"
              icon="📅"
              onClick={() => router.push("/dashboard/work-calendar")}
            />
            <QuickApp
              label="Policy"
              icon="📖"
              onClick={() => openDrawer("attendance_policy")}
            />

            {canViewPurchase && (
              <QuickApp
                label="Purchase"
                icon="🛒"
                onClick={() => router.push("/dashboard/purchase")}
              />
            )}

            {canViewDispatch && (
              <QuickApp
                label="Dispatch"
                icon="🚚"
                onClick={() => router.push("/dashboard/dispatch")}
              />
            )}
          </div>
        </section>

        <div className="py-4 text-center">
          <p className="text-[10px] font-bold text-slate-400">
            YashFlow • Yash Laser Work Management
          </p>
        </div>
      </div>

      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-[70] border-t border-slate-200 bg-white/95 backdrop-blur px-2 py-2">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex flex-col items-center gap-1 py-1 text-[10px] font-black text-blue-700"
          >
            <span className="text-lg">⌂</span>
            Home
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/orders")}
            className="flex flex-col items-center gap-1 py-1 text-[10px] font-black text-slate-600"
          >
            <span className="text-lg">📦</span>
            Orders
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/tasks")}
            className="flex flex-col items-center gap-1 py-1 text-[10px] font-black text-slate-600"
          >
            <span className="text-lg">📋</span>
            Tasks
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/work-calendar")}
            className="flex flex-col items-center gap-1 py-1 text-[10px] font-black text-slate-600"
          >
            <span className="text-lg">📅</span>
            Calendar
          </button>

          <button
            type="button"
            onClick={() => openDrawer("attendance")}
            className="flex flex-col items-center gap-1 py-1 text-[10px] font-black text-slate-600"
          >
            <span className="text-lg">🕘</span>
            Attendance
          </button>
        </div>
      </nav>

      {summaryDrawer && (
        <div className="fixed inset-0 z-[90]">
          <button
            type="button"
            onClick={closeDrawer}
            className="absolute inset-0 bg-slate-950/45"
            aria-label="Close details"
          />

          <aside className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-3xl bg-slate-50 shadow-2xl flex flex-col sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[430px] sm:rounded-none">
            <div className="p-4 yf-brand-panel text-white rounded-t-3xl sm:rounded-none">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black tracking-[0.15em] text-[#d4af37]">
                    QUICK DETAILS
                  </p>

                  <h2 className="text-xl font-black mt-0.5">
                    {summaryDrawer === "attendance"
                      ? "Attendance Details"
                      : summaryDrawer === "department_orders"
                      ? "Department Orders"
                      : summaryDrawer === "pending_leave"
                      ? "Pending Leave"
                      : summaryDrawer === "working_today"
                      ? "Working Today"
                      : "Attendance Policy"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closeDrawer}
                  className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 hover:bg-white/20 font-black"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {summaryDrawer === "attendance" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <CompactTile
                      label="STATUS"
                      value={attendanceStatus}
                      icon="🟢"
                    />
                    <CompactTile
                      label="APPROVAL"
                      value={
                        !attendance
                          ? "-"
                          : !attendance.approval_required
                          ? "Auto Approved"
                          : attendance.approval_status === "pending"
                          ? "Pending"
                          : attendance.approval_status === "approved"
                          ? "Approved"
                          : "Rejected"
                      }
                      icon="✅"
                    />
                    <CompactTile
                      label="CHECK IN"
                      value={formatTime(attendance?.check_in || null)}
                      icon="↘"
                    />
                    <CompactTile
                      label="CHECK OUT"
                      value={formatTime(attendance?.check_out || null)}
                      icon="↗"
                    />
                    <CompactTile
                      label="LATE"
                      value={
                        attendance
                          ? `${formatLateMinutes(attendance.late_minutes)} Min`
                          : "-"
                      }
                      icon="⏳"
                    />
                    <CompactTile
                      label="WORKING"
                      value={formatWorkingMinutes(
                        attendance?.working_minutes || 0
                      )}
                      icon="⏱️"
                    />
                  </div>

                  {attendance?.admin_note && (
                    <div className="rounded-2xl bg-blue-50 border border-blue-200 p-3">
                      <p className="text-[10px] font-black text-blue-700">
                        ADMIN NOTE
                      </p>
                      <p className="text-sm font-semibold text-slate-900 mt-1">
                        {attendance.admin_note}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-[10px] font-black tracking-[0.12em] text-slate-500 mb-2">
                      MANUAL PUNCH
                    </p>

                    <ManualPunchRequest
                      employeeId={employee.id}
                      timezone={officeSettings.timezone}
                    />
                  </div>
                </div>
              )}

              {summaryDrawer === "department_orders" && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-cyan-50 border border-cyan-100 p-4">
                    <p className="text-[10px] font-black text-cyan-700">
                      CURRENT DEPARTMENT ORDERS
                    </p>
                    <p className="text-4xl font-black text-cyan-800 mt-1">
                      {departmentOrderCount}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black text-slate-500">
                      YOUR DEPARTMENTS
                    </p>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {assignedDepartmentNames().map(
                        (departmentName, index) => (
                          <span
                            key={`${departmentName}-drawer-${index}`}
                            className="yf-badge yf-badge-blue"
                          >
                            {departmentName}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigateFromDrawer("/dashboard/orders")
                    }
                    className="yf-btn yf-btn-primary w-full justify-center"
                  >
                    Open Department Orders →
                  </button>
                </div>
              )}

              {summaryDrawer === "pending_leave" && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4">
                    <p className="text-[10px] font-black text-purple-700">
                      PENDING REQUESTS
                    </p>
                    <p className="text-4xl font-black text-purple-800 mt-1">
                      {pendingLeaveCount}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-1">
                      Awaiting Admin approval
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigateFromDrawer("/dashboard/leave")
                    }
                    className="yf-btn yf-btn-primary w-full justify-center"
                  >
                    Open Leave Requests →
                  </button>
                </div>
              )}

              {summaryDrawer === "working_today" && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
                    <p className="text-[10px] font-black text-green-700">
                      ACTUAL WORKING
                    </p>
                    <p className="text-2xl font-black text-green-800 mt-1">
                      {attendance?.check_out
                        ? formatWorkingMinutes(attendance.working_minutes)
                        : attendance?.check_in
                        ? "Running"
                        : "-"}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <CompactTile
                      label="CHECK IN"
                      value={formatTime(attendance?.check_in || null)}
                      icon="↘"
                    />
                    <CompactTile
                      label="CHECK OUT"
                      value={formatTime(attendance?.check_out || null)}
                      icon="↗"
                    />
                  </div>

                  <p className="text-xs font-semibold text-slate-500">
                    Final actual working time Check Out પછી update થશે.
                  </p>
                </div>
              )}

              {summaryDrawer === "attendance_policy" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <CompactTile
                      label="OFFICE START"
                      value={formatOfficeTime(
                        officeSettings.office_start_time
                      )}
                      icon="🏢"
                    />
                    <CompactTile
                      label="ON TIME UP TO"
                      value={formatOfficeTime(graceEndTime)}
                      icon="✓"
                    />
                    <CompactTile
                      label="HALF DAY FROM"
                      value={formatOfficeTime(
                        officeSettings.half_day_checkin_time
                      )}
                      icon="½"
                    />
                    <CompactTile
                      label="OFFICE END"
                      value={formatOfficeTime(
                        officeSettings.office_end_time
                      )}
                      icon="🏁"
                    />
                  </div>

                  <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
                    <p className="font-black text-green-800">✓ On Time</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {formatOfficeTime(
                        officeSettings.office_start_time
                      )} થી {formatOfficeTime(graceEndTime)} સુધી.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-orange-50 border border-orange-100 p-4">
                    <p className="font-black text-orange-800">⏳ Late</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {formatOfficeTime(graceEndTime)} પછી અને{" "}
                      {formatOfficeTime(
                        officeSettings.half_day_checkin_time
                      )} પહેલાં Check In.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-red-50 border border-red-100 p-4">
                    <p className="font-black text-red-800">½ Half Day</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {formatOfficeTime(
                        officeSettings.half_day_checkin_time
                      )} અથવા ત્યાર પછી Check In.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                    <p className="font-black text-blue-800">☕ Recess</p>
                    <p className="text-sm font-medium text-slate-700 mt-1">
                      {formatOfficeTime(
                        officeSettings.recess_start_time
                      )} થી{" "}
                      {formatOfficeTime(
                        officeSettings.recess_end_time
                      )}.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
