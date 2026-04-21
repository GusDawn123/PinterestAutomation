"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  LineChart,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api, type ApprovalRequest, type PinQueueItem } from "../../lib/api";
import { PageContainer } from "../../components/page-container";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";

const shortcuts = [
  {
    href: "/approvals",
    title: "Pending approvals",
    blurb: "Keywords, drafts, images, pins waiting on you.",
    icon: ClipboardList,
  },
  {
    href: "/calendar",
    title: "Scheduled pins",
    blurb: "Calendar of upcoming Pinterest posts.",
    icon: CalendarClock,
  },
  {
    href: "/analytics",
    title: "Analytics",
    blurb: "Best-performing pins and recommended posting slots.",
    icon: LineChart,
  },
] as const;

export default function Dashboard() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null);
  const [queue, setQueue] = useState<PinQueueItem[] | null>(null);

  useEffect(() => {
    api.listPendingApprovals().then(({ approvals }) => setApprovals(approvals)).catch(() => setApprovals([]));
    api.listQueuedPins().then(({ items }) => setQueue(items)).catch(() => setQueue([]));
  }, []);

  async function handleStart() {
    setStarting(true);
    try {
      const { workflowRunId, approvalId } = await api.startBlogWorkflow("US");
      toast.success("New workflow started");
      router.push(`/approvals/keyword?approvalId=${approvalId}&runId=${workflowRunId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(false);
    }
  }

  const pendingCount = approvals?.length ?? null;
  const queuedCount = queue?.length ?? null;
  const nextPin = queue?.[0];

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Dashboard"
        description="Kick off a new post, approve what's waiting, and keep an eye on the schedule."
        actions={
          <Button size="lg" onClick={handleStart} disabled={starting}>
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {starting ? "Starting…" : "Start new blog post"}
          </Button>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pending approvals"
          value={pendingCount}
          hint={pendingCount === 0 ? "Inbox clear" : "Needs your review"}
          href="/approvals"
          loading={approvals === null}
        />
        <StatCard
          label="Scheduled pins"
          value={queuedCount}
          hint={nextPin ? `Next: ${new Date(nextPin.scheduledAt).toLocaleString()}` : "Nothing queued"}
          href="/calendar"
          loading={queue === null}
        />
        <StatCard
          label="Workflow status"
          value="Ready"
          hint="Claude + Pinterest + WordPress wired"
          isText
        />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {shortcuts.map((c) => (
          <Link key={c.href} href={c.href} className="group">
            <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/30">
              <CardContent className="flex flex-col gap-3 py-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <c.icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
                </div>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      {approvals && approvals.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Waiting on you
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {approvals.slice(0, 5).map((a) => (
                <Link
                  key={a.id}
                  href={`/approvals/${a.kind}?approvalId=${a.id}&runId=${a.workflowRunId}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="capitalize">{a.kind}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  hint,
  href,
  loading = false,
  isText = false,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
  href?: string;
  loading?: boolean;
  isText?: boolean;
}) {
  const inner = (
    <Card className={href ? "transition-colors hover:border-primary/50" : undefined}>
      <CardContent className="flex flex-col gap-1 py-5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-16" />
        ) : (
          <span className={isText ? "text-xl font-semibold" : "text-3xl font-bold tracking-tight"}>
            {value ?? "—"}
          </span>
        )}
        {hint && <span className="mt-1 text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
