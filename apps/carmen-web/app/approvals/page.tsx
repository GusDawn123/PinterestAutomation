"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Inbox } from "lucide-react";
import { api, type ApprovalRequest } from "../../lib/api";
import { PageContainer } from "../../components/page-container";
import { PageHeader } from "../../components/page-header";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { EmptyState } from "../../components/empty-state";

const KIND_ROUTE: Record<string, string> = {
  keyword: "/approvals/keyword",
  draft: "/approvals/draft",
  images: "/approvals/images",
  pins: "/approvals/pins",
  publish: "/approvals/publish",
  affiliates: "/approvals/affiliates",
};

export default function ApprovalsIndex() {
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPendingApprovals()
      .then((r) => setApprovals(r.approvals))
      .catch((e) => {
        setApprovals([]);
        setError((e as Error).message);
      });
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="Pending approvals"
        description="Every workflow needs your eyes at a few checkpoints. Here's what's waiting."
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {approvals === null ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nothing waiting"
          description="Start a new blog post from the dashboard to kick off a workflow."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {approvals.map((a) => {
            const base = KIND_ROUTE[a.kind] ?? "/approvals";
            const href = `${base}?approvalId=${a.id}&runId=${a.workflowRunId}`;
            return (
              <Link key={a.id} href={href}>
                <Card className="transition-colors hover:border-primary/50 hover:bg-accent/30">
                  <CardContent className="flex items-center justify-between gap-4 py-4">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="capitalize">{a.kind}</Badge>
                      <div>
                        <div className="text-sm font-medium">
                          <span className="capitalize">{a.kind}</span> approval
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
