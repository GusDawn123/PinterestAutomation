"use client";

import { useState, useEffect } from "react";

interface FeedItem {
  id: string;
  icon: "ok" | "info" | "warn" | "err";
  agent: string;
  title: string;
  detail: string;
  time: string;
}

const SEED_FEED: FeedItem[] = [
  { id: "f0", icon: "ok",   agent: "scheduler", title: "Posted to Pinterest",    detail: "\"Enamel Mug Collection\" · 1,204 impr first hour", time: "just now" },
  { id: "f1", icon: "info", agent: "claude",    title: "Drafting new post",       detail: "keyword: linen slipcover couch",                   time: "2m" },
  { id: "f2", icon: "warn", agent: "ideogram",  title: "Retry succeeded",         detail: "slot 3 · 1 retry",                                time: "4m" },
  { id: "f3", icon: "ok",   agent: "wp",        title: "Draft saved",             detail: "/cottagecore-bedroom · status: draft",             time: "18m" },
  { id: "f4", icon: "info", agent: "keyword",   title: "3 new keywords found",    detail: "low-comp · cottage · vol > 5k",                   time: "26m" },
  { id: "f5", icon: "ok",   agent: "carmen",    title: "Approved affiliates",      detail: "sourdough · slot 2",                              time: "41m" },
];

const AGENT_LINES = [
  "Claude is drafting…",
  "Ideogram generated 4 images",
  "WordPress draft saved",
  "Scheduler rebalanced 3 slots",
  "New keyword batch ready",
  "Draft meta ok · 142 chars",
];

const AGENTS = ["claude", "ideogram", "wp", "scheduler", "keyword"];
const ICONS: FeedItem["icon"][] = ["ok", "info", "info", "ok"];

export function ActivityRail() {
  const [items, setItems] = useState<FeedItem[]>(SEED_FEED);

  useEffect(() => {
    const t = setInterval(() => {
      const line: string = AGENT_LINES[Math.floor(Math.random() * AGENT_LINES.length)] ?? "Working…";
      const agent: string = AGENTS[Math.floor(Math.random() * AGENTS.length)] ?? "claude";
      const icon: FeedItem["icon"] = ICONS[Math.floor(Math.random() * ICONS.length)] ?? "ok";
      setItems((xs) => [
        {
          id: "ev" + Date.now(),
          icon,
          agent,
          title: line,
          detail: `run · ${Math.floor(Math.random() * 800 + 100)}ms · ok`,
          time: "now",
        },
        ...xs.slice(0, 24),
      ]);
    }, 5200);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="rail">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4>Activity</h4>
        <span className="chip good" style={{ padding: "2px 8px" }}>
          <span className="pulse-dot" style={{ width: 6, height: 6 }} /> live
        </span>
      </div>
      {items.map((f) => (
        <div key={f.id} className="feed-item">
          <div className={`feed-icon ${f.icon}`}>
            {f.icon === "ok" ? "✓" : f.icon === "err" ? "×" : f.icon === "warn" ? "!" : "·"}
          </div>
          <div className="feed-body">
            <div className="feed-title">
              {f.title} <span className="agent">{f.agent}</span>
            </div>
            <div className="feed-detail">{f.detail}</div>
          </div>
          <div className="feed-time">{f.time}</div>
        </div>
      ))}
    </aside>
  );
}
