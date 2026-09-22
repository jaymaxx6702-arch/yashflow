import type { ReactNode } from "react";

export type YashFlowIconName =
  | "users"
  | "user-check"
  | "calendar"
  | "clock"
  | "orders"
  | "check"
  | "leave"
  | "task"
  | "alert"
  | "gps"
  | "inventory"
  | "design"
  | "cutting"
  | "production"
  | "packing"
  | "dispatch"
  | "products"
  | "settings"
  | "details"
  | "team"
  | "id-card"
  | "performance"
  | "purchase"
  | "reorder"
  | "accounts"
  | "report"
  | "export"
  | "activity"
  | "files"
  | "shield"
  | "recovery"
  | "health"
  | "bell"
  | "admin"
  | "arrow-up"
  | "arrow-down"
  | "edit";

function iconPath(name: YashFlowIconName): ReactNode {
  switch (name) {
    case "users":
    case "team":
      return (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      );
    case "user-check":
      return (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="m17 11 2 2 4-4" />
        </>
      );
    case "calendar":
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </>
      );
    case "clock":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case "orders":
    case "packing":
      return (
        <>
          <path d="m4 7 8-4 8 4-8 4-8-4Z" />
          <path d="M4 7v10l8 4 8-4V7" />
          <path d="M12 11v10" />
        </>
      );
    case "check":
    case "health":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m8 12 2.5 2.5L16.5 9" />
        </>
      );
    case "leave":
      return (
        <>
          <path d="M4 20h16" />
          <path d="M7 18c3-5 5-8 10-12" />
          <path d="M11 9c-3-1-5 0-6 2 3 1 5 1 7-1" />
          <path d="M15 6c0-3 1-4 3-5 1 3 0 5-2 7" />
        </>
      );
    case "task":
      return (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
          <path d="m5.5 8 .8.8 1.4-1.6" />
        </>
      );
    case "alert":
      return (
        <>
          <path d="M10.3 3.7 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </>
      );
    case "gps":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="8" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </>
      );
    case "inventory":
      return (
        <>
          <path d="M3 7h18v14H3z" />
          <path d="M7 7V3h10v4M8 12h8" />
        </>
      );
    case "design":
      return (
        <>
          <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
          <path d="m13.5 7.5 3 3" />
        </>
      );
    case "cutting":
      return (
        <>
          <circle cx="6" cy="7" r="3" />
          <circle cx="6" cy="17" r="3" />
          <path d="m8.5 8.5 11 7M8.5 15.5l11-7" />
        </>
      );
    case "production":
      return (
        <>
          <path d="M3 21V10l6 3V9l6 3V6l6 4v11H3Z" />
          <path d="M7 17h2M12 17h2M17 17h2" />
        </>
      );
    case "dispatch":
      return (
        <>
          <path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </>
      );
    case "products":
      return (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );
    case "details":
      return (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </>
      );
    case "id-card":
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8" cy="11" r="2.2" />
          <path d="M5.5 16c.8-1.7 4.2-1.7 5 0M13 10h5M13 14h5" />
        </>
      );
    case "performance":
      return (
        <>
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
          <path d="M5 6H3v2a4 4 0 0 0 4 4M19 6h2v2a4 4 0 0 1-4 4" />
          <path d="M12 14v4M8 21h8M9 18h6" />
        </>
      );
    case "purchase":
      return (
        <>
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
          <path d="M2 3h3l2.5 11h10.8l2-7H6" />
        </>
      );
    case "reorder":
      return (
        <>
          <path d="M20 7h-8a4 4 0 0 0-4 4v1" />
          <path d="m16 3 4 4-4 4" />
          <path d="M4 17h8a4 4 0 0 0 4-4v-1" />
          <path d="m8 21-4-4 4-4" />
        </>
      );
    case "accounts":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 8.5c-.7-.6-1.7-1-3-1-1.7 0-3 .8-3 2s1 1.7 3 2 3 1 3 2.2-1.3 2.3-3 2.3c-1.2 0-2.4-.4-3.2-1.1M12 5.5v13" />
        </>
      );
    case "report":
      return (
        <>
          <path d="M5 21V10M12 21V3M19 21v-7" />
        </>
      );
    case "export":
      return (
        <>
          <path d="M12 3v12M7 8l5-5 5 5" />
          <path d="M5 13v7h14v-7" />
        </>
      );
    case "activity":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l4 2" />
        </>
      );
    case "files":
      return (
        <>
          <path d="M3 6h7l2 2h9v11H3z" />
        </>
      );
    case "shield":
      return (
        <>
          <path d="M12 3 4 6v5c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6l-8-3Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      );
    case "recovery":
      return (
        <>
          <path d="M4 4v6h6" />
          <path d="M5.5 15a8 8 0 1 0 .5-8l-2 3" />
        </>
      );
    case "bell":
      return (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </>
      );
    case "admin":
      return (
        <>
          <path d="M12 3 5 6v5c0 4.6 2.8 7.8 7 9.5 4.2-1.7 7-4.9 7-9.5V6l-7-3Z" />
          <path d="M9 11h6M12 8v6" />
        </>
      );
    case "arrow-up":
      return <path d="m6 15 6-6 6 6" />;
    case "arrow-down":
      return <path d="m6 9 6 6 6-6" />;
    case "edit":
      return (
        <>
          <path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17l-1 3Z" />
          <path d="m14.5 7.5 3 3" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="8" />;
  }
}

export default function YashFlowIcon({
  name,
  size = 22,
  className = "",
}: {
  name: YashFlowIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {iconPath(name)}
    </svg>
  );
}
