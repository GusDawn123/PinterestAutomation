import { buildServer } from "./server.js";
import { env } from "./env.js";
import { flushTelemetry } from "./tracing.js";
import { db } from "./db.js";
import { ApprovalService } from "./services/approvals.js";
import { WorkflowService } from "./services/workflow.js";
import { PinterestClient } from "./clients/pinterest.js";
import { AnthropicClient } from "./clients/anthropic.js";
import { WordpressClient } from "./clients/wordpress.js";
import { loadPrompt } from "./services/prompts.js";
import type { ServiceContext } from "./context.js";

async function buildContext(): Promise<ServiceContext> {
  return {
    db,
    approvals: new ApprovalService(db),
    workflow: new WorkflowService(db),
    pinterest: new PinterestClient(),
    anthropic: new AnthropicClient(),
    wordpress: new WordpressClient(),
    getBlogDraftPrompt: () => loadPrompt("blog_draft"),
  };
}

async function main(): Promise<void> {
  const ctx = await buildContext();
  const app = await buildServer({ ctx });
  await app.listen({ port: env.PINTEREST_SVC_PORT, host: "0.0.0.0" });

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutdown requested");
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
