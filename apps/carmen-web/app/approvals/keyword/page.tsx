"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, type ApprovalRequest, type ScoredKeyword } from "../../../lib/api";
import { PageContainer } from "../../../components/page-container";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { Badge } from "../../../components/ui/badge";
import { RadioGroup, RadioGroupItem } from "../../../components/ui/radio-group";
import { Label } from "../../../components/ui/label";
import { Skeleton } from "../../../components/ui/skeleton";

interface KeywordPayload {
  candidates: ScoredKeyword[];
}

export default function KeywordApprovalPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <KeywordApproval />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <PageContainer>
      <PageHeader title="Pick a keyword" description="Loading candidates…" backHref="/approvals" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </PageContainer>
  );
}

function KeywordApproval() {
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
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;

  if (error && candidates.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Pick a keyword" backHref="/approvals" />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Pick a keyword"
        description="Top 5 keywords by search volume × trend ÷ competition. Pick one and tell Claude what you want to write about."
        backHref="/approvals"
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <section>
          <Label className="mb-2 block">Keyword candidates</Label>
          <RadioGroup value={chosen} onValueChange={setChosen} className="gap-2">
            {candidates.map((c) => {
              const picked = chosen === c.keyword;
              return (
                <Label
                  key={c.keyword}
                  htmlFor={`kw-${c.keyword}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                    picked ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                  }`}
                >
                  <RadioGroupItem id={`kw-${c.keyword}`} value={c.keyword} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{c.keyword}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="outline">vol {formatNum(c.searchVolume)}</Badge>
                      <Badge variant="outline">trend {c.trendScore.toFixed(2)}</Badge>
                      <Badge variant="outline">comp {c.competition.toFixed(2)}</Badge>
                      <Badge variant="secondary">score {formatNum(Math.round(c.score))}</Badge>
                    </div>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
        </section>

        <section>
          <Label htmlFor="brief" className="mb-2 block">
            What do you want to write about?
          </Label>
          <Textarea
            id="brief"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={5}
            placeholder="e.g. the 5 best gifts for new gardeners, focused on budget options, from personal experience"
          />
        </section>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="submit" size="lg" disabled={submitting || !chosen || !brief.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? "Drafting with Claude…" : "Generate draft"}
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

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}
