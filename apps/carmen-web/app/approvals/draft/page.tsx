"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ApprovalRequest, type BlogDraft } from "../../../lib/api";

interface DraftPayload {
  draft: BlogDraft;
  chosenKeyword: string;
  brief: string;
}

export default function DraftApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId");

  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [draft, setDraft] = useState<BlogDraft | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [rejecting, setRejecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ editUrl: string; previewUrl: string } | null>(null);

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
        setDraft((a.payload as DraftPayload).draft);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  async function handleApprove() {
    if (!approvalId || !workflowRunId || !draft) return;
    setPublishing(true);
    setError(null);
    try {
      await api.decideApproval(approvalId, {
        status: "approved",
        data: { editedDraft: draft },
      });
      const wp = await api.publishToWordpress(workflowRunId);
      setSuccess({ editUrl: wp.editUrl, previewUrl: wp.previewUrl });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function handleReject() {
    if (!approvalId) return;
    setRejecting(true);
    setError(null);
    try {
      await api.decideApproval(approvalId, { status: "rejected" });
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setRejecting(false);
    }
  }

  if (loading) return <Page><p>Loading draft…</p></Page>;
  if (error) return <Page><p style={{ color: "#b00020" }}>Error: {error}</p></Page>;
  if (!draft) return <Page><p>No draft payload found.</p></Page>;

  if (success) {
    return (
      <Page>
        <h1>Draft saved to WordPress</h1>
        <p>Your draft is waiting for you in WordPress.</p>
        <ul>
          <li><a href={success.editUrl} target="_blank" rel="noreferrer">Edit in WordPress →</a></li>
          <li><a href={success.previewUrl} target="_blank" rel="noreferrer">Preview →</a></li>
        </ul>
        <a href="/dashboard" style={{ display: "inline-block", marginTop: "1rem" }}>
          ← Back to dashboard
        </a>
      </Page>
    );
  }

  return (
    <Page>
      <h1>Review draft</h1>
      <p style={{ color: "#666" }}>Edit inline. Approve to push to WordPress as a draft post.</p>

      <Field label="Headline">
        <input
          value={draft.headline}
          onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
          style={inputStyle}
        />
      </Field>

      <Field label="URL slug">
        <input
          value={draft.urlSlug}
          onChange={(e) => setDraft({ ...draft, urlSlug: e.target.value })}
          style={inputStyle}
        />
      </Field>

      <Field label="Meta description">
        <textarea
          value={draft.metaDescription}
          onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
          rows={2}
          maxLength={160}
          style={inputStyle}
        />
        <span style={{ color: "#999", fontSize: "0.8rem" }}>
          {draft.metaDescription.length}/160
        </span>
      </Field>

      <Field label="Body (markdown)">
        <textarea
          value={draft.bodyMarkdown}
          onChange={(e) => setDraft({ ...draft, bodyMarkdown: e.target.value })}
          rows={20}
          style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
        />
      </Field>

      <Field label="Category">
        <input
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          style={inputStyle}
        />
      </Field>

      <Field label="Tags (comma-separated)">
        <input
          value={draft.tags.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
            })
          }
          style={inputStyle}
        />
      </Field>

      <div style={{ display: "flex", gap: "0.75rem", marginTop: "2rem" }}>
        <button
          type="button"
          onClick={handleApprove}
          disabled={publishing || rejecting}
          style={{
            padding: "0.75rem 1.5rem",
            background: publishing ? "#888" : "#1a7a3a",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: publishing ? "wait" : "pointer",
          }}
        >
          {publishing ? "Publishing…" : "Approve → push to WordPress"}
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={publishing || rejecting}
          style={{
            padding: "0.75rem 1.5rem",
            background: "white",
            color: "#b00020",
            border: "1px solid #b00020",
            borderRadius: 6,
            cursor: rejecting ? "wait" : "pointer",
          }}
        >
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
      </div>

      {approval && (
        <p style={{ color: "#999", marginTop: "2rem", fontSize: "0.8rem" }}>
          Approval {approval.id} · status {approval.status}
        </p>
      )}
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <main style={{ maxWidth: 820, margin: "2rem auto", padding: "0 1.5rem" }}>{children}</main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginTop: "1.25rem" }}>
      <span style={{ fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: "0.95rem",
  fontFamily: "inherit",
};
