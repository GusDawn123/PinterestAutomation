"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type BlogDraft } from "../../../lib/api";
import { StageRail } from "../../../components/stage-rail";
import { ActionBar } from "../../../components/action-bar";
import { useToast } from "../../../components/toast";

interface DraftPayload { draft: BlogDraft; chosenKeyword: string; brief: string; }

export default function DraftApprovalPage() {
  return (
    <Suspense fallback={<div className="page-inner"><div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} /><div className="skeleton" style={{ height: 300 }} /></div>}>
      <DraftApproval />
    </Suspense>
  );
}

function DraftApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId") ?? "";

  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ editUrl: string; previewUrl: string } | null>(null);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    if (!approvalId) { setError("Missing approvalId"); setLoading(false); return; }
    api.getApproval(approvalId)
      .then((a) => {
        const p = a.payload as DraftPayload;
        setDraft(p.draft);
        setKeyword(p.chosenKeyword);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  async function handleApprove() {
    if (!approvalId || !workflowRunId || !draft) return;
    setSubmitting(true);
    setError(null);
    try {
      if ((draft.imageSlots?.length ?? 0) > 0) {
        const started = await api.startImages(workflowRunId);
        router.push(`/approvals/images?runId=${workflowRunId}&approvalId=${started.approvalId}`);
        return;
      }
      await api.decideApproval(approvalId, { status: "approved", data: { editedDraft: draft } });
      const wp = await api.publishToWordpress(workflowRunId);
      setSuccess({ editUrl: wp.editUrl, previewUrl: wp.previewUrl });
      toast("Draft pushed to WordPress");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, "err");
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!approvalId) return;
    setRejecting(true);
    try {
      await api.decideApproval(approvalId, { status: "rejected" });
      toast("Draft rejected");
      router.push("/dashboard");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, "err");
      setRejecting(false);
    }
  }

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t || !draft) return;
    if (!draft.tags.includes(t)) setDraft({ ...draft, tags: [...draft.tags, t] });
    setTagInput("");
  }

  function removeTag(tag: string) {
    if (!draft) return;
    setDraft({ ...draft, tags: draft.tags.filter((t) => t !== tag) });
  }

  if (loading) return (
    <div className="page-inner">
      <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
      <div className="skeleton" style={{ width: 200, height: 48, marginBottom: 24 }} />
      {[0, 1, 2, 3].map((i) => <div key={i} style={{ marginBottom: 16 }}><div className="skeleton" style={{ height: 12, width: 80, marginBottom: 6 }} /><div className="skeleton" style={{ height: 40 }} /></div>)}
    </div>
  );

  if (success) return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Draft saved</div>
        <h1 className="page-title">Off to <em>WordPress</em></h1>
      </div>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ marginBottom: 16, color: "var(--green)", fontFamily: "var(--font-serif)", fontSize: 18 }}>✓ Draft is waiting in WordPress</div>
        <div style={{ display: "flex", gap: 10 }}>
          <a href={success.editUrl} target="_blank" rel="noreferrer" className="btn btn-primary">Edit in WordPress</a>
          <a href={success.previewUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">Preview</a>
          <button className="btn btn-ghost" onClick={() => router.push("/dashboard")}>← Dashboard</button>
        </div>
      </div>
    </div>
  );

  if (!draft) return (
    <div className="page-inner">
      <div className="state"><div className="mk">!</div><h3>No draft found</h3><p>{error ?? "The approval payload was empty."}</p></div>
    </div>
  );

  const metaLen = draft.metaDescription.length;
  const metaCls = metaLen === 0 ? "" : metaLen > 155 ? "over" : metaLen > 140 ? "warn" : "";

  return (
    <div className="page-inner">
      <StageRail current="/approvals/draft" runId={workflowRunId} />

      <div className="page-header">
        <div className="page-eyebrow">Stage 2 of 6 · {keyword}</div>
        <h1 className="page-title">Review the <em>draft</em></h1>
        <div className="page-sub">Edit inline. Approve to generate images or push straight to WordPress.</div>
      </div>

      {error && <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 80 }}>
        <div>
          <div className="field-label"><span>Headline</span></div>
          <input className="field serif" value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
        </div>

        <div>
          <div className="field-label"><span>URL slug</span></div>
          <input className="field mono" value={draft.urlSlug} onChange={(e) => setDraft({ ...draft, urlSlug: e.target.value })} />
        </div>

        <div>
          <div className="field-label">
            <span>Meta description</span>
            <span className={`counter ${metaCls}`}>{metaLen}/160</span>
          </div>
          <textarea className="field" rows={2} maxLength={160} value={draft.metaDescription} onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })} />
        </div>

        <div>
          <div className="field-label">
            <span>Body (markdown)</span>
            <span className="field-hint">{draft.bodyMarkdown.length} chars</span>
          </div>
          <textarea className="field mono" rows={20} value={draft.bodyMarkdown} onChange={(e) => setDraft({ ...draft, bodyMarkdown: e.target.value })} />
        </div>

        <div>
          <div className="field-label"><span>Category</span></div>
          <input className="field" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
        </div>

        <div>
          <div className="field-label"><span>Tags</span></div>
          <div className="tag-input-wrap">
            {draft.tags.map((t) => (
              <span key={t} className="tag">
                {t}
                <button className="x" type="button" onClick={() => removeTag(t)}>×</button>
              </span>
            ))}
            <input
              className="tag-input"
              value={tagInput}
              placeholder="Add tag…"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
                if (e.key === "Backspace" && !tagInput && draft.tags.length) { const last = draft.tags[draft.tags.length - 1]; if (last) removeTag(last); }
              }}
            />
          </div>
        </div>
      </div>

      <ActionBar
        onApprove={handleApprove}
        approveLabel={draft.imageSlots?.length > 0 ? "Approve → generate images" : "Approve → push to WordPress"}
        onReject={handleReject}
        onBack="/approvals"
        loading={submitting || rejecting}
      />
    </div>
  );
}
