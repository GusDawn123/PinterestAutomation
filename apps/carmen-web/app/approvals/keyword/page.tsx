"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ScoredKeyword } from "../../../lib/api";
import { StageRail } from "../../../components/stage-rail";
import { ActionBar } from "../../../components/action-bar";
import { useToast } from "../../../components/toast";

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

interface KeywordPayload { candidates: ScoredKeyword[]; }

export default function KeywordApprovalPage() {
  return (
    <Suspense fallback={<div className="page-inner"><div className="skeleton" style={{ height: 40, marginBottom: 20 }} /><div className="skeleton" style={{ height: 200 }} /></div>}>
      <KeywordApproval />
    </Suspense>
  );
}

function KeywordApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId") ?? "";

  const [candidates, setCandidates] = useState<ScoredKeyword[]>([]);
  const [chosen, setChosen] = useState<string>("");
  const [brief, setBrief] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!approvalId) { setError("Missing approvalId in URL"); setLoading(false); return; }
    api.getApproval(approvalId)
      .then((a) => {
        const payload = a.payload as KeywordPayload;
        const top5 = payload.candidates.slice(0, 5);
        setCandidates(top5);
        setChosen(top5[0]?.keyword ?? "");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  async function handleSubmit() {
    if (!workflowRunId || !chosen || !brief.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { approvalId: nextId } = await api.submitKeyword(workflowRunId, {
        chosenKeyword: chosen,
        brief: brief.trim(),
      });
      toast("Draft generation started");
      router.push(`/approvals/draft?approvalId=${nextId}&runId=${workflowRunId}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, "err");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-inner">
        <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
        <div className="page-header">
          <div className="skeleton" style={{ width: 80, height: 12, marginBottom: 10 }} />
          <div className="skeleton" style={{ width: 300, height: 48, marginBottom: 10 }} />
        </div>
        {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72, marginBottom: 8, borderRadius: 12 }} />)}
      </div>
    );
  }

  return (
    <div className="page-inner">
      <StageRail current="/approvals/keyword" runId={workflowRunId} />

      <div className="page-header">
        <div className="page-eyebrow">Stage 1 of 6</div>
        <h1 className="page-title">Pick a <em>keyword</em></h1>
        <div className="page-sub">Top candidates ranked by search volume × trend ÷ competition. Pick one and describe your angle.</div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="kw-list" style={{ marginBottom: 28 }}>
        {candidates.map((c) => {
          const picked = chosen === c.keyword;
          const pct = Math.min(100, Math.round(c.score / 10));
          return (
            <button
              key={c.keyword}
              className={`kw-row ${picked ? "selected" : ""}`}
              onClick={() => setChosen(c.keyword)}
              type="button"
            >
              <div className="kw-score">
                {pct}<span className="pct">%</span>
              </div>
              <div>
                <div className="kw-term">{c.keyword}</div>
                <div className="kw-meta">
                  vol {c.searchVolume.toLocaleString()} · trend {c.trendScore.toFixed(2)} · comp {c.competition.toFixed(2)}
                </div>
              </div>
              <div className="kw-cat">{c.score > 500 ? "hot" : c.score > 200 ? "warm" : "niche"}</div>
              <div className="kw-pick-dot">{picked && CHECK}</div>
            </button>
          );
        })}
      </div>

      <div style={{ marginBottom: 80 }}>
        <div className="field-label">
          <span>Your angle — what do you want to write about?</span>
          <span className="field-hint">{brief.length} chars</span>
        </div>
        <textarea
          className="field"
          rows={5}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. the 5 best gifts for new gardeners, focused on budget options, from personal experience"
        />
      </div>

      <ActionBar
        onApprove={handleSubmit}
        approveLabel="Generate draft"
        onBack="/approvals"
        metaText={chosen ? `"${chosen}"` : undefined}
        disabled={!chosen || !brief.trim()}
        loading={submitting}
      />
    </div>
  );
}
