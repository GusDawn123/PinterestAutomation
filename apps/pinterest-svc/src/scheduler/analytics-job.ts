import type { ServiceContext } from "../context.js";

export interface AnalyticsLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export async function runAnalyticsOnce(
  ctx: ServiceContext,
  log: AnalyticsLogger,
  now: Date = new Date(),
): Promise<{ fetched: number; failed: number }> {
  const posted = await ctx.pinsQueue.listPosted(500);
  let fetched = 0;
  let failed = 0;

  for (const row of posted) {
    if (!row.pinterestPinId) continue;
    try {
      const metrics = await ctx.pinterest.getPinAnalytics(row.pinterestPinId);
      await ctx.analytics.record({
        pinterestPinId: row.pinterestPinId,
        boardId: row.boardId,
        impressions: metrics.impressions,
        saves: metrics.saves,
        outboundClicks: metrics.outboundClicks,
        closeups: metrics.closeups,
        observedAt: now,
      });
      fetched++;
    } catch (err) {
      log.error(
        { pinId: row.pinterestPinId, err: (err as Error).message },
        "analytics fetch failed",
      );
      failed++;
    }
  }

  return { fetched, failed };
}

export function startAnalyticsLoop(
  ctx: ServiceContext,
  log: AnalyticsLogger,
  intervalMs: number = 24 * 60 * 60 * 1000,
): () => void {
  let stopped = false;
  let handle: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const res = await runAnalyticsOnce(ctx, log);
      log.info(res, "analytics tick");
    } catch (err) {
      const message = (err as Error).message;
      log.error({ err: message }, "analytics tick error");
      void ctx.alerter.send({
        severity: "error",
        title: "Analytics scheduler tick crashed",
        message,
      });
    } finally {
      if (!stopped) handle = setTimeout(tick, intervalMs);
    }
  };

  handle = setTimeout(tick, intervalMs);

  return () => {
    stopped = true;
    if (handle) clearTimeout(handle);
  };
}
