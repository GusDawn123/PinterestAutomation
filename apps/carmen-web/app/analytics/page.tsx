"use client";

import { useEffect, useState } from "react";
import { BarChart3, LineChart, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { api, type RecommendedSlot } from "../../lib/api";
import { PageContainer } from "../../components/page-container";
import { PageHeader } from "../../components/page-header";
import { EmptyState } from "../../components/empty-state";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import { Skeleton } from "../../components/ui/skeleton";
import { Separator } from "../../components/ui/separator";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Analytics() {
  const [boardId, setBoardId] = useState<string>("");
  const [activeBoardId, setActiveBoardId] = useState<string>("");
  const [slots, setSlots] = useState<RecommendedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyticsItems, setAnalyticsItems] = useState<Array<Record<string, unknown>>>([]);
  const [rowsLoading, setRowsLoading] = useState(true);

  useEffect(() => {
    api
      .listAnalytics()
      .then(({ items }) => setAnalyticsItems(items))
      .catch((e) => setError((e as Error).message))
      .finally(() => setRowsLoading(false));
  }, []);

  async function loadSlots(e?: React.FormEvent) {
    e?.preventDefault();
    if (!boardId) return;
    setLoading(true);
    setError(null);
    try {
      const { slots } = await api.listRecommendedSlots(boardId);
      setSlots(slots);
      setActiveBoardId(boardId);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Analytics"
        description="Recommended posting slots per board — ranked by impressions, saves, and outbound clicks."
        backHref="/dashboard"
        backLabel="Dashboard"
      />

      <Card className="mb-6">
        <CardContent className="py-5">
          <form onSubmit={loadSlots} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="board-id">Board ID</Label>
              <Input
                id="board-id"
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                placeholder="e.g. 123456789012345678"
              />
            </div>
            <Button type="submit" disabled={!boardId || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Loading…" : "Load slots"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <BarChart3 className="h-4 w-4" />
          {activeBoardId ? `Top slots for board ${activeBoardId}` : "Recommended slots"}
        </h2>

        {loading ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : slots.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title={activeBoardId ? "No slots yet for this board" : "Enter a board ID to see slot recommendations"}
            description={
              activeBoardId
                ? "Once pins on this board have accumulated impressions, ranked slots will appear here."
                : "Find your board ID in the Pinterest URL or API and load it above."
            }
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((s, i) => (
              <Card key={i}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="text-sm font-semibold">
                      {DAY_NAMES[s.dayOfWeek]} · {String(s.hour).padStart(2, "0")}:00 UTC
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">score {s.score.toFixed(2)}</Badge>
                      <Badge variant="outline">n={s.sampleSize}</Badge>
                    </div>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">#{i + 1}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator className="my-6" />

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <LineChart className="h-4 w-4" />
          Recent analytics rows
        </h2>
        {rowsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : analyticsItems.length === 0 ? (
          <EmptyState
            icon={LineChart}
            title="No analytics captured yet"
            description="Once scheduled pins go live, the daily cron fetches impressions, saves, and outbound clicks."
          />
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{analyticsItems.length}</span> rows collected.
            </CardContent>
          </Card>
        )}
      </section>
    </PageContainer>
  );
}
