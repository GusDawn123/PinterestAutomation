"use client";

import { useRouter } from "next/navigation";

const STAGES = [
  { href: "/approvals/keyword",    n: 1, label: "Keyword",    sub: "pick one" },
  { href: "/approvals/draft",      n: 2, label: "Draft",      sub: "review copy" },
  { href: "/approvals/images",     n: 3, label: "Images",     sub: "upload + ai" },
  { href: "/approvals/affiliates", n: 4, label: "Affiliates", sub: "products" },
  { href: "/approvals/pins",       n: 5, label: "Pins",       sub: "upload" },
  { href: "/approvals/publish",    n: 6, label: "Publish",    sub: "wordpress" },
];

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="11" height="11">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

interface StageRailProps {
  current: string;
  runId?: string;
}

export function StageRail({ current, runId }: StageRailProps) {
  const router = useRouter();
  const currentIdx = STAGES.findIndex((s) => s.href === current);

  const go = (href: string) => {
    const url = runId ? `${href}?runId=${runId}` : href;
    router.push(url);
  };

  return (
    <div className="stage-rail">
      {STAGES.map((s, i) => {
        const cls = i < currentIdx ? "done" : i === currentIdx ? "active" : "";
        return (
          <button key={s.href} className={`stage-step ${cls}`} onClick={() => go(s.href)}>
            <span className="n">{i < currentIdx ? CHECK : s.n}</span>
            <span className="lbl">
              {s.label}
              <span className="sub">{s.sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
