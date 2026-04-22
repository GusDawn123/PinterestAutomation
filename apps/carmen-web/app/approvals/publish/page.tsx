"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type BlogDraft } from "../../../lib/api";
import { StageRail } from "../../../components/stage-rail";
import { ActionBar } from "../../../components/action-bar";
import { useToast } from "../../../components/toast";

interface DraftPayload { draft: BlogDraft; chosenKeyword: string; }

export default function PublishApprovalPage() {
  return (
    <Suspense fallback={<div className="page-inner"><div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} /><div className="skeleton" style={{ height: 300 }} /></div>}>
      <PublishApproval />
    </Suspense>
  );
}

function PublishApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId") ?? "";

  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ editUrl: string; previewUrl: string } | null>(null);

  useEffect(() => {
    if (!workflowRunId) { setLoading(false); return; }
    api.getWorkflow(workflowRunId)
      .then((w) => {
        const d = w.blogDraft as BlogDraft | null;
        if (d) setDraft(d);
        const ctx = w.run.context as { chosenKeyword?: string } | null;
        if (ctx?.chosenKeyword) setKeyword(ctx.chosenKeyword);
      })
      .catch(() => {
        if (approvalId) {
          api.getApproval(approvalId)
            .then((a) => {
              const p = a.payload as DraftPayload;
              setDraft(p.draft);
              setKeyword(p.chosenKeyword);
            })
            .catch((e) => setError((e as Error).message));
        }
      })
      .finally(() => setLoading(false));
  }, [workflowRunId, approvalId]);

  async function handlePublish() {
    if (!workflowRunId) return;
    setPublishing(true);
    setError(null);
    try {
      if (approvalId) {
        await api.decideApproval(approvalId, { status: "approved" });
      }
      const wp = await api.publishToWordpress(workflowRunId);
      setSuccess({ editUrl: wp.editUrl, previewUrl: wp.previewUrl });
      toast("Published to WordPress ✓");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, "err");
      setPublishing(false);
    }
  }

  if (loading) return (
    <div className="page-inner">
      <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
      <div className="skeleton" style={{ width: 200, height: 48, marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  );

  if (success) return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Complete</div>
        <h1 className="page-title"><em>Published</em> to WordPress</h1>
      </div>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ color: "var(--green)", fontFamily: "var(--font-serif)", fontSize: 18, marginBottom: 16 }}>✓ Blog post is live in WordPress</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={success.editUrl} target="_blank" rel="noreferrer" className="btn btn-primary">Edit in WordPress</a>
          <a href={success.previewUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">Preview</a>
          <button className="btn btn-ghost" onClick={() => router.push("/dashboard")}>← Dashboard</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-inner">
      <StageRail current="/approvals/publish" runId={workflowRunId} />

      <div className="page-header">
        <div className="page-eyebrow">Stage 6 of 6 · {keyword}</div>
        <h1 className="page-title">Final <em>review</em></h1>
        <div className="page-sub">Check everything looks good, then publish to WordPress.</div>
      </div>

      {error && <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>{error}</div>}

      {draft ? (
        <div className="card" style={{ padding: 22, marginBottom: 80 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, marginBottom: 6, letterSpacing: "-0.01em" }}>{draft.headline}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)", marginBottom: 16 }}>/{draft.urlSlug}</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
            <CheckItem ok={!!draft.headline} label="Headline" detail={draft.headline} />
            <CheckItem ok={draft.metaDescription.length > 0 && draft.metaDescription.length <= 160} label="Meta description" detail={`${draft.metaDescription.length}/160 chars`} />
            <CheckItem ok={!!draft.category} label="Category" detail={draft.category} />
            <CheckItem ok={draft.tags.length > 0} label="Tags" detail={`${draft.tags.length} tags`} />
            <CheckItem ok={draft.imageSlots.length > 0} label="Image slots" detail={`${draft.imageSlots.length} slot${draft.imageSlots.length !== 1 ? "s" : ""}`} />
          </div>

          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Meta preview</div>
          <div style={{ padding: "12px 14px", background: "var(--bg-elev)", borderRadius: 8, fontSize: 13, color: "var(--ink-soft)", fontStyle: "italic", lineHeight: 1.5 }}>
            {draft.metaDescription || <span style={{ color: "var(--red)" }}>No meta description</span>}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 22, marginBottom: 80, color: "var(--ink-muted)", fontSize: 14 }}>
          Could not load draft preview. You can still publish.
        </div>
      )}

      <ActionBar
        onApprove={handlePublish}
        approveLabel="Publish to WordPress"
        onBack="/approvals"
        loading={publishing}
      />
    </div>
  );
}

function CheckItem({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ color: ok ? "var(--green)" : "var(--red)", fontFamily: "var(--font-serif)", fontSize: 16, lineHeight: 1 }}>{ok ? "✓" : "✗"}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)" }}>{detail}</div>
      </div>
    </div>
  );
}
