"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, type ApprovalRequest, type BlogDraft } from "../../../lib/api";
import { PageContainer } from "../../../components/page-container";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";

interface DraftPayload {
  draft: BlogDraft;
  chosenKeyword: string;
  brief: string;
}

export default function DraftApprovalPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DraftApproval />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <PageContainer>
      <PageHeader title="Review draft" description="Loading draft…" backHref="/approvals" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </PageContainer>
  );
}

function DraftApproval() {
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
      if ((draft.imageSlots?.length ?? 0) > 0) {
        const started = await api.startImages(workflowRunId);
        router.push(`/approvals/images?runId=${workflowRunId}&approvalId=${started.approvalId}`);
        return;
      }
      await api.decideApproval(approvalId, {
        status: "approved",
        data: { editedDraft: draft },
      });
      const wp = await api.publishToWordpress(workflowRunId);
      setSuccess({ editUrl: wp.editUrl, previewUrl: wp.previewUrl });
      toast.success("Draft pushed to WordPress");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
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
      toast.success("Draft rejected");
      router.push("/dashboard");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
      setRejecting(false);
    }
  }

  if (loading) return <LoadingState />;

  if (error && !draft) {
    return (
      <PageContainer>
        <PageHeader title="Review draft" backHref="/approvals" />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      </PageContainer>
    );
  }
  if (!draft) {
    return (
      <PageContainer>
        <PageHeader title="Review draft" backHref="/approvals" />
        <p className="text-sm text-muted-foreground">No draft payload found.</p>
      </PageContainer>
    );
  }

  if (success) {
    return (
      <PageContainer>
        <PageHeader title="Draft saved to WordPress" backHref="/dashboard" backLabel="Dashboard" />
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Your draft is waiting for you in WordPress.</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={success.editUrl} target="_blank" rel="noreferrer">
                  Edit in WordPress
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="ghost">
                <a href={success.previewUrl} target="_blank" rel="noreferrer">
                  Preview
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const metaCount = draft.metaDescription.length;
  const metaVariant: "success" | "warning" | "destructive" =
    metaCount === 0 ? "destructive" : metaCount > 155 ? "warning" : "success";

  return (
    <PageContainer>
      <PageHeader
        title="Review draft"
        description="Edit inline. Approve to push to WordPress as a draft post."
        backHref="/approvals"
      />

      <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
        <Field label="Headline" htmlFor="headline">
          <Input
            id="headline"
            value={draft.headline}
            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
          />
        </Field>

        <Field label="URL slug" htmlFor="slug">
          <Input
            id="slug"
            value={draft.urlSlug}
            onChange={(e) => setDraft({ ...draft, urlSlug: e.target.value })}
          />
        </Field>

        <Field
          label="Meta description"
          htmlFor="meta"
          extra={<Badge variant={metaVariant}>{metaCount}/160</Badge>}
        >
          <Textarea
            id="meta"
            rows={2}
            maxLength={160}
            value={draft.metaDescription}
            onChange={(e) => setDraft({ ...draft, metaDescription: e.target.value })}
          />
        </Field>

        <Field label="Body (markdown)" htmlFor="body">
          <Textarea
            id="body"
            rows={20}
            value={draft.bodyMarkdown}
            onChange={(e) => setDraft({ ...draft, bodyMarkdown: e.target.value })}
            className="font-mono text-xs"
          />
        </Field>

        <Field label="Category" htmlFor="category">
          <Input
            id="category"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
        </Field>

        <Field label="Tags (comma-separated)" htmlFor="tags">
          <Input
            id="tags"
            value={draft.tags.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
              })
            }
          />
        </Field>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            size="lg"
            variant="success"
            onClick={handleApprove}
            disabled={publishing || rejecting}
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {publishing
              ? draft.imageSlots.length > 0
                ? "Generating images…"
                : "Publishing…"
              : draft.imageSlots.length > 0
                ? "Approve → generate images"
                : "Approve → push to WordPress"}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={handleReject}
            disabled={publishing || rejecting}
          >
            {rejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            {rejecting ? "Rejecting…" : "Reject"}
          </Button>
        </div>

        {approval && (
          <p className="text-xs text-muted-foreground">
            Approval {approval.id} · status {approval.status}
          </p>
        )}
      </form>
    </PageContainer>
  );
}

function Field({
  label,
  htmlFor,
  extra,
  children,
}: {
  label: string;
  htmlFor: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {extra}
      </div>
      {children}
    </div>
  );
}
