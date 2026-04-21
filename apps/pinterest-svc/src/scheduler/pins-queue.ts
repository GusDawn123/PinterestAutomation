import type { ServiceContext } from "../context.js";
import type { PinsQueueRow } from "../db/schema.js";

export interface PinsQueueRunnerLogger {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
}

export async function runPinsQueueOnce(
  ctx: ServiceContext,
  log: PinsQueueRunnerLogger,
  now: Date = new Date(),
): Promise<{ posted: number; failed: number; skipped: number }> {
  const due = await ctx.pinsQueue.listDue(now, 25);
  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of due) {
    if ((row.attempts ?? 0) >= 5) {
      skipped++;
      continue;
    }
    try {
      const { pinId } = await ctx.pinterest.createPin({
        boardId: row.boardId,
        imageUrl: row.imageUrl,
        title: row.title,
        description: row.description,
        linkBackUrl: row.linkBackUrl,
      });
      await ctx.pinsQueue.markPosted(row.id, pinId);
      log.info({ pinQueueId: row.id, pinterestPinId: pinId }, "pin posted");
      posted++;
    } catch (err) {
      const message = (err as Error).message;
      await ctx.pinsQueue.markAttemptFailed(row.id, message);
      log.error({ pinQueueId: row.id, err: message }, "pin post failed");
      const nextAttempts = (row.attempts ?? 0) + 1;
      if (nextAttempts >= 3) {
        void ctx.alerter.send({
          severity: nextAttempts >= 5 ? "critical" : "error",
          title: "Pinterest pin post failing",
          message,
          context: {
            pinQueueId: row.id,
            boardId: row.boardId,
            attempts: nextAttempts,
            title: row.title,
          },
          workflowRunId: row.workflowRunId ?? undefined,
        });
      }
      failed++;
    }
  }

  return { posted, failed, skipped };
}

export function startPinsQueueLoop(
  ctx: ServiceContext,
  log: PinsQueueRunnerLogger,
  intervalMs: number = 60_000,
): () => void {
  let stopped = false;
  let handle: NodeJS.Timeout | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const res = await runPinsQueueOnce(ctx, log);
      if (res.posted || res.failed) {
        log.info(res, "pins-queue tick");
      }
    } catch (err) {
      log.error({ err: (err as Error).message }, "pins-queue tick error");
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

export type { PinsQueueRow };
