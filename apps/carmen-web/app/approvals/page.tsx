"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ApprovalRequest } from "../../lib/api";

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M5 12h14M13 6l6 6-6 6"/>
  </svg>
);

const KIND_ROUTE: Record<string, string> = {
  keyword:    "/approvals/keyword",
  draft:      "/approvals/draft",
  images:     "/approvals/images",
  affiliates: "/approvals/affiliates",
  pins:       "/approvals/pins",
  publish:    "/approvals/publish",
};

const GROUPS = [
  { stage: "keyword",    label: "1 · Keyword" },
  { stage: "draft",      label: "2 · Draft" },
  { stage: "images",     label: "3 · Images" },
  { stage: "affiliates", label: "4 · Affiliates" },
  { stage: "pins",       label: "5 · Pins" },
  { stage: "publish",    label: "6 · Publish" },
];

export default function ApprovalsHub() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPendingApprovals()
      .then((r) => setApprovals(r.approvals))
      .catch((e) => { setApprovals([]); setError((e as Error).message); });
  }, []);

  const totalCount = approvals?.length ?? 0;

  return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Approvals</div>
        <h1 className="page-title">
          <em>{approvals === null ? "—" : totalCount}</em> item{totalCount !== 1 ? "s" : ""} waiting on you
        </h1>
        <div className="page-sub">Grouped by pipeline stage. Oldest first.</div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      {approvals === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {[0, 1].map((i) => (
            <div key={i}>
              <div className="skeleton" style={{ width: 100, height: 12, marginBottom: 10 }} />
              <div className="card" style={{ padding: 16 }}>
                <div className="skeleton" style={{ height: 48 }} />
              </div>
            </div>
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="state">
          <div className="mk">✦</div>
          <h3>Inbox clear</h3>
          <p>Start a new blog post from the dashboard to kick off a workflow.</p>
        </div>
      ) : (
        GROUPS.map((g) => {
          const items = approvals.filter((a) => a.kind === g.stage);
          if (!items.length) return null;
          return (
            <div key={g.stage} style={{ marginBottom: 28 }}>
              <div className="section-label" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{g.label}</span>
                <span>{items.length} item{items.length > 1 ? "s" : ""}</span>
              </div>
              <div className="card" style={{ overflow: "hidden" }}>
                {items.map((a) => {
                  const href = `${KIND_ROUTE[a.kind] ?? "/approvals"}?approvalId=${a.id}&runId=${a.workflowRunId}`;
                  return (
                    <div key={a.id} className="mini-queue-item" onClick={() => router.push(href)}>
                      <span className={`stage-pill ${a.kind}`}>{a.kind}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="mini-title">{a.kind} approval</div>
                        <div className="mini-meta">{new Date(a.createdAt).toLocaleString()}</div>
                      </div>
                      <button className="btn btn-ghost"><ArrowIcon /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
