"use client";

import { usePathname } from "next/navigation";
import { SidebarNav } from "./sidebar-nav";
import { ActivityRail } from "./activity-rail";
import { Topbar } from "./topbar";

const LANDING_PATH = "/";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === LANDING_PATH;

  if (isLanding) {
    return <>{children}</>;
  }

  return (
    <div className="app">
      <SidebarNav />
      <main className="main">
        <Topbar />
        <div className="page">{children}</div>
      </main>
      <ActivityRail />
    </div>
  );
}
