"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ApprovalRequest, type ScoredKeyword } from "../../../lib/api";

interface KeywordPayload {
  candidates: ScoredKeyword[];
}

export default function KeywordApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId");

  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [candidates, setCandidates] = useState<ScoredKeyword[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [brief, setBrief] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!approvalId) {
      setError("Missing approvalId in URL");
      setLoading(false);
      return;
    }
    api
      .getApproval(approvalId)
      .then((a) => {
        setApproval(a);
        const payload = a.payload as KeywordPayload;
        setCandidates(payload.candidates.slice(0, 5));
        setChosen(payload.candidates[0]?.keyword ?? "");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workflowRunId || !chosen || !brief.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { approvalId: nextApprovalId } = await api.submitKeyword(workflowRunId, {
        chosenKeyword: chosen,
        brief: brief.trim(),
      });
      router.push(`/approvals/draft?approvalId=${nextApprovalId}&runId=${workflowRunId}`);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Page><p>Loading candidates…</p></Page>;
  }

  if (error) {
    return (
      <Page>
        <p style={{ color: "#b00020" }}>Error: {error}</p>
      </Page>
    );
  }

  return (
    <Page>
      <h1>Pick a keyword</h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Top 5 keywords by search volume × trend ÷ competition. Pick one and tell Claude what you
        want to write about.
      </p>

      <form onSubmit={handleSubmit}>
        <fieldset style={{ border: "none", padding: 0, margin: 0, marginBottom: "2rem" }}>
          <legend style={{ marginBottom: "0.75rem", fontWeight: 600 }}>Keyword candidates</legend>
          {candidates.map((c) => (
            <label
              key={c.keyword}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.75rem 1rem",
                border: "1px solid #e5e5e5",
                borderRadius: 6,
                marginBottom: "0.5rem",
                cursor: "pointer",
                background: chosen === c.keyword ? "#fff5f8" : "white",
              }}
            >
              <input
                type="radio"
                name="keyword"
                value={c.keyword}
                checked={chosen === c.keyword}
                onChange={() => setChosen(c.keyword)}
                style={{ marginRight: "1rem" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{c.keyword}</div>
                <div style={{ color: "#666", fontSize: "0.85rem" }}>
                  vol {formatNum(c.searchVolume)} · trend {c.trendScore.toFixed(2)} · comp{" "}
                  {c.competition.toFixed(2)} · score {formatNum(Math.round(c.score))}
                </div>
              </div>
            </label>
          ))}
        </fieldset>

        <label style={{ display: "block", marginBottom: "2rem" }}>
          <span style={{ fontWeight: 600, display: "block", marginBottom: "0.5rem" }}>
            What do you want to write about?
          </span>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="e.g. the 5 best gifts for new gardeners, focused on budget options, from personal experience"
            style={{
              width: "100%",
              padding: "0.75rem",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: "1rem",
              fontFamily: "inherit",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={submitting || !chosen || !brief.trim()}
          style={{
            padding: "0.75rem 1.5rem",
            background: submitting ? "#888" : "#c8356d",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: "1rem",
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Drafting with Claude…" : "Generate draft"}
        </button>
      </form>

      {approval && (
        <p style={{ color: "#999", marginTop: "2rem", fontSize: "0.8rem" }}>
          Approval {approval.id} · status {approval.status}
        </p>
      )}
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1.5rem" }}>{children}</main>;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}
