"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Clock, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type PinQueueItem } from "../../lib/api";
import { PageContainer } from "../../components/page-container";
import { PageHeader } from "../../components/page-header";
import { EmptyState } from "../../components/empty-state";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { RescheduleDialog } from "../../components/reschedule-dialog";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";

const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default function Calendar() {
  const [items, setItems] = useState<PinQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<PinQueueItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PinQueueItem | null>(null);

  async function refresh() {
    try {
      const { items } = await api.listQueuedPins();
      setItems(items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const buckets = new Map<string, PinQueueItem[]>();
    for (const item of items) {
      const key = item.scheduledAt.slice(0, 10);
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  async function handleReschedule(iso: string) {
    if (!rescheduleTarget) return;
    const id = rescheduleTarget.id;
    setActioning(id);
    try {
      await api.reschedulePin(id, iso);
      await refresh();
      toast.success("Pin rescheduled");
      setRescheduleTarget(null);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setActioning(null);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setActioning(id);
    try {
      await api.cancelPin(id);
      await refresh();
      toast.success("Pin cancelled");
      setCancelTarget(null);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setActioning(null);
    }
  }

  if (loading) {
    return (
      <PageContainer size="wide">
        <PageHeader
          title="Scheduled pins"
          description="Loading your pin queue…"
          backHref="/dashboard"
          backLabel="Dashboard"
        />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Scheduled pins"
        description="Upcoming Pinterest posts. Reschedule to change a slot or cancel to remove a pin."
        backHref="/dashboard"
        backLabel="Dashboard"
        actions={
          <Badge variant="secondary" className="gap-1">
            <CalendarClock className="h-3 w-3" />
            {items.length} queued
          </Badge>
        }
      />

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {items.length === 0 && !error && (
        <EmptyState
          icon={CalendarClock}
          title="No pins queued"
          description="Once pins are approved with auto-post, they'll land here for review and rescheduling."
        />
      )}

      <div className="flex flex-col gap-6">
        {grouped.map(([date, dayItems]) => (
          <section key={date} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">{formatDate(date)}</h2>
            <div className="flex flex-col gap-2">
              {dayItems.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground sm:w-20 sm:shrink-0">
                      <Clock className="h-3 w-3" />
                      {item.scheduledAt.slice(11, 16)}Z
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{item.title}</div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {item.description}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="outline">Board {item.boardId}</Badge>
                        {item.attempts > 0 && (
                          <Badge variant="warning">
                            {item.attempts} attempt{item.attempts === 1 ? "" : "s"}
                          </Badge>
                        )}
                        {item.lastError && (
                          <span className="truncate text-destructive">
                            {item.lastError.slice(0, 60)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRescheduleTarget(item)}
                        disabled={actioning === item.id}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Reschedule
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCancelTarget(item)}
                        disabled={actioning === item.id}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>

      <RescheduleDialog
        open={rescheduleTarget !== null}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        currentIso={rescheduleTarget?.scheduledAt}
        onSubmit={handleReschedule}
        submitting={actioning === rescheduleTarget?.id}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel scheduled pin?"
        description={
          cancelTarget
            ? `"${cancelTarget.title}" will be removed from the queue. This can't be undone.`
            : undefined
        }
        confirmLabel="Cancel pin"
        cancelLabel="Keep"
        destructive
        onConfirm={handleCancel}
        confirming={actioning === cancelTarget?.id}
      />
    </PageContainer>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return DAY_FMT.format(d);
}
