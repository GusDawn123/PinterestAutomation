import { buildServer } from "./server.js";
import { env } from "./env.js";
import { flushTelemetry } from "./tracing.js";
import { db } from "./db.js";
import { ApprovalService } from "./services/approvals.js";
import { WorkflowService } from "./services/workflow.js";
import { PinsQueueService } from "./services/pins-queue.js";
import { AnalyticsService } from "./services/analytics.js";
import { RecommenderService } from "./services/recommender.js";
import { IdeogramClient } from "./clients/ideogram.js";
import { PinterestClient } from "./clients/pinterest.js";
import { AnthropicClient } from "./clients/anthropic.js";
import { WordpressClient } from "./clients/wordpress.js";
import { UndetectableClient } from "./clients/undetectable.js";
import { ExifStripper } from "./exif.js";
import { buildAlerter } from "./alerting.js";
import { loadPrompt } from "./services/prompts.js";
import { startSchedulers } from "./scheduler/index.js";
import type { ServiceContext } from "./context.js";

async function buildContext(): Promise<ServiceContext> {
  return {
    db,
    approvals: new ApprovalService(db),
    workflow: new WorkflowService(db),
    pinsQueue: new PinsQueueService(db),
    analytics: new AnalyticsService(db),
    recommender: new RecommenderService(db),
    ideogram: new IdeogramClient(env),
    pinterest: new PinterestClient(),
    anthropic: new AnthropicClient(),
    wordpress: new WordpressClient(),
    undetectable: new UndetectableClient(),
    exif: new ExifStripper(),
    alerter: buildAlerter(),
    getBlogDraftPrompt: () => loadPrompt("blog_draft"),
    getAltTextPrompt: () => loadPrompt("alt_text_generator"),
    getInterlinkPrompt: () => loadPrompt("interlink_picker"),
    getPinCopyPrompt: () => loadPrompt("pin_copy"),
    getAffiliateQueriesPrompt: () => loadPrompt("affiliate_queries"),
  };
}

async function main(): Promise<void> {
  const ctx = await buildContext();
  const app = await buildServer({ ctx });
  await app.listen({ port: env.PINTEREST_SVC_PORT, host: "0.0.0.0" });

  const stopSchedulers = startSchedulers(ctx, app.log);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutdown requested");
    stopSchedulers();
    await app.close();
    await flushTelemetry();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
