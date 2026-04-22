"use client";

import { usePathname, useRouter } from "next/navigation";

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/>
  </svg>
);
const InboxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M3 15h4l2 3h6l2-3h4"/><path d="M3 15V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8"/>
  </svg>
);
const CalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>
  </svg>
);
const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M3 20h18"/><path d="M5 16v-5M10 16V8M15 16v-3M20 16V5"/>
  </svg>
);

const WORKSPACE = [
  { href: "/dashboard",  label: "Dashboard",  Icon: HomeIcon },
  { href: "/approvals",  label: "Approvals",  Icon: InboxIcon },
  { href: "/calendar",   label: "Calendar",   Icon: CalIcon },
  { href: "/analytics",  label: "Analytics",  Icon: ChartIcon },
];

const STAGES = [
  { href: "/approvals/keyword",    n: 1, label: "Keyword" },
  { href: "/approvals/draft",      n: 2, label: "Draft" },
  { href: "/approvals/images",     n: 3, label: "Images" },
  { href: "/approvals/affiliates", n: 4, label: "Affiliates" },
  { href: "/approvals/pins",       n: 5, label: "Pins" },
  { href: "/approvals/publish",    n: 6, label: "Publish" },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    href === "/approvals"
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <aside className="sidebar">
      <button className="brand" onClick={() => router.push("/dashboard")}>
        <div className="brand-mark">C</div>
        <div>
          <div className="brand-name">Cockpit</div>
          <div className="brand-sub">Carmen · v1</div>
        </div>
      </button>

      <div className="nav-section">
        <div className="nav-label">Workspace</div>
        {WORKSPACE.map(({ href, label, Icon }) => (
          <button
            key={href}
            className={`nav-item ${isActive(href) ? "active" : ""}`}
            onClick={() => router.push(href)}
          >
            <span className="nav-icon"><Icon /></span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="nav-section">
        <div className="nav-label">Pipeline stages</div>
        {STAGES.map(({ href, n, label }) => (
          <button
            key={href}
            className={`nav-item ${pathname.startsWith(href) ? "active" : ""}`}
            onClick={() => router.push(href)}
          >
            <span className="nav-icon" style={{ fontFamily: "var(--font-mono)", fontSize: 11, textAlign: "center" }}>
              {n}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="avatar">C</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13 }}>Carmen Rosales</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)" }}>editor</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
