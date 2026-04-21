import { buildServer } from "./server.js";
import { env } from "./env.js";
import { flushTelemetry } from "./tracing.js";

async function main(): Promise<void> {
  const app = await buildServer();
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
