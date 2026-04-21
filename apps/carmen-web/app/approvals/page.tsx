"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type ApprovalRequest } from "../../lib/api";

const KIND_ROUTE: Record<string, string> = {
  keyword: "/approvals/keyword",
  draft: "/approvals/draft",
  images: "/approvals/images",
  pins: "/approvals/pins",
  publish: "/approvals/publish",
};

export default function ApprovalsIndex() {
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPendingApprovals()
      .then((r) => setApprovals(r.approvals))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1.5rem" }}>
      <h1>Pending approvals</h1>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: "#b00020" }}>Error: {error}</p>}
      {!loading && !error && approvals.length === 0 && (
        <p style={{ color: "#666" }}>Nothing waiting. Start a new post from the dashboard.</p>
      )}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {approvals.map((a) => {
          const base = KIND_ROUTE[a.kind] ?? "/approvals";
          const href = `${base}?approvalId=${a.id}&runId=${a.workflowRunId}`;
          return (
            <li
              key={a.id}
              style={{
                padding: "0.75rem 1rem",
                border: "1px solid #e5e5e5",
                borderRadius: 6,
                marginBottom: "0.5rem",
              }}
            >
              <Link href={href} style={{ color: "inherit", textDecoration: "none" }}>
                <strong style={{ textTransform: "capitalize" }}>{a.kind}</strong> approval
                <span style={{ color: "#999", marginLeft: "0.5rem", fontSize: "0.85rem" }}>
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p style={{ marginTop: "2rem" }}>
        <Link href="/dashboard">← Dashboard</Link>
      </p>
    </main>
  );
}
