"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type SectionConfig = {
  titles: string[];
  collapsedText: string;
  expandedText: string;
  labelSelector?: string;
  labelMatch?: string;
};

const sectionConfigs: SectionConfig[] = [
  {
    titles: ["Today at a Glance"],
    collapsedText: "Tap to Open ▼",
    expandedText: "Tap to Close ▲",
    labelSelector: "span",
    labelMatch: "Click any card",
  },
  {
    titles: ["Items Need Your Attention", "All Clear"],
    collapsedText: "Tap to open section ▼",
    expandedText: "Tap to close section ▲",
    labelSelector: "p",
    labelMatch: "Tap here to open all attention items.",
  },
  {
    titles: ["Order Workflow"],
    collapsedText: "Open ▼",
    expandedText: "Close ▲",
    labelSelector: "span",
    labelMatch: "View All ›",
  },
];

function findHeading(titles: string[]) {
  return Array.from(document.querySelectorAll("h2")).find((node) =>
    titles.includes(node.textContent?.trim() || "")
  ) as HTMLElement | undefined;
}

function findLabel(header: HTMLElement, config: SectionConfig) {
  if (!config.labelSelector || !config.labelMatch) return null;

  return (
    Array.from(header.querySelectorAll(config.labelSelector)).find(
      (node) => node.textContent?.trim() === config.labelMatch
    ) as HTMLElement | undefined
  ) || null;
}

function setupSection(config: SectionConfig) {
  const heading = findHeading(config.titles);
  const section = heading?.closest("section") as HTMLElement | null;
  if (!section || section.dataset.yfAccordionReady === "true") return;

  const header = section.children.item(0) as HTMLElement | null;
  const content = section.children.item(1) as HTMLElement | null;
  if (!header || !content) return;

  section.dataset.yfAccordionReady = "true";
  header.dataset.yfCollapsed = "true";
  header.setAttribute("aria-expanded", "false");
  header.style.cursor = "pointer";
  content.style.display = "none";

  const label = findLabel(header, config);
  if (label) {
    label.dataset.yfOriginalText = label.textContent || "";
    label.textContent = config.collapsedText;
  }

  const toggle = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const isCollapsed = header.dataset.yfCollapsed !== "false";
    header.dataset.yfCollapsed = isCollapsed ? "false" : "true";
    header.setAttribute("aria-expanded", isCollapsed ? "true" : "false");
    content.style.display = isCollapsed ? "" : "none";

    if (label) {
      label.textContent = isCollapsed
        ? config.expandedText
        : config.collapsedText;
    }
  };

  header.addEventListener("click", toggle, true);
}

export default function AdminDashboardAccordion() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin") return;

    const apply = () => {
      for (const config of sectionConfigs) setupSection(config);
    };

    apply();

    const observer = new MutationObserver(apply);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
