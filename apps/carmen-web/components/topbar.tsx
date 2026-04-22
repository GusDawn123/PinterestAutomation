"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";

const CRUMB_MAP: Record<string, { label: string; href?: string }[]> = {
  "/dashboard":            [{ label: "Dashboard" }],
  "/approvals":            [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals" }],
  "/approvals/keyword":    [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals", href: "/approvals" }, { label: "1 · Keyword" }],
  "/approvals/draft":      [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals", href: "/approvals" }, { label: "2 · Draft" }],
  "/approvals/images":     [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals", href: "/approvals" }, { label: "3 · Images" }],
  "/approvals/affiliates": [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals", href: "/approvals" }, { label: "4 · Affiliates" }],
  "/approvals/pins":       [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals", href: "/approvals" }, { label: "5 · Pins" }],
  "/approvals/publish":    [{ label: "Dashboard", href: "/dashboard" }, { label: "Approvals", href: "/approvals" }, { label: "6 · Publish" }],
  "/calendar":             [{ label: "Dashboard", href: "/dashboard" }, { label: "Calendar" }],
  "/analytics":            [{ label: "Dashboard", href: "/dashboard" }, { label: "Analytics" }],
};

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
  </svg>
);

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const crumbs = CRUMB_MAP[pathname] ?? [{ label: pathname }];

  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i > 0 && <span className="sep">/</span>}
            {c.href ? (
              <button onClick={() => router.push(c.href!)} style={{ color: "inherit" }}>
                {c.label}
              </button>
            ) : (
              <span className={i === crumbs.length - 1 ? "here" : ""}>{c.label}</span>
            )}
          </span>
        ))}
      </div>
      <div className="topbar-spacer" />
      <button
        className="icon-btn"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        title="Toggle theme"
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}
