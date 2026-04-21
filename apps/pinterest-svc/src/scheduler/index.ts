import type { ServiceContext } from "../context.js";
import { env } from "../env.js";
import { startPinsQueueLoop } from "./pins-queue.js";
import { startAnalyticsLoop } from "./analytics-job.js";
import { startRecommenderLoop } from "./recommender-job.js";

export interface SchedulerLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export function startSchedulers(ctx: ServiceContext, log: SchedulerLogger): () => void {
  if (!env.SCHEDULER_AUTO_POST) {
    log.info({}, "SCHEDULER_AUTO_POST=false — schedulers disabled");
    return () => {};
  }

  log.info({}, "starting schedulers: pins-queue (1m), analytics (24h), recommender (7d)");

  const stopPins = startPinsQueueLoop(ctx, log, 60_000);
  const stopAnalytics = startAnalyticsLoop(ctx, log, 24 * 60 * 60 * 1000);
  const stopRecommender = startRecommenderLoop(ctx, log, 7 * 24 * 60 * 60 * 1000);

  return () => {
    stopPins();
    stopAnalytics();
    stopRecommender();
  };
}
