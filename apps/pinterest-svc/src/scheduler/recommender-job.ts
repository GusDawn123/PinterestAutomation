import type { ServiceContext } from "../context.js";

export interface RecommenderLogger {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export async function runRecommenderOnce(
  ctx: ServiceContext,
  log: RecommenderLogger,
): Promise<{ slots: number }> {
  try {
    const slots = await ctx.recommender.recompute(5);
    log.info({ slots: slots.length }, "recommender recomputed");
    return { slots: slots.length };
  } catch (err) {
    log.error({ err: (err as Error).message }, "recommender failed");
    throw err;
  }
}

export function startRecommenderLoop(
  ctx: ServiceContext,
  log: RecommenderLogger,
  intervalMs: number = 7 * 24 * 60 * 60 * 1000,
): () => void {
  let stopped = false;
  let handle: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      await runRecommenderOnce(ctx, log);
    } catch (err) {
      void ctx.alerter.send({
        severity: "error",
        title: "Recommender scheduler tick failed",
        message: (err as Error).message,
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
