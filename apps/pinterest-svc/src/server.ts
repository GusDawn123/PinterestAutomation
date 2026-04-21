import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { env } from "./env.js";
import { Sentry } from "./tracing.js";
import { healthRoutes } from "./routes/health.js";
import { trendingRoutes } from "./routes/trending.js";
import { approvalRoutes } from "./routes/approvals.js";
import { workflowRoutes } from "./routes/workflows.js";
import { wordpressRoutes } from "./routes/wordpress.js";
import type { ServiceContext } from "./context.js";

export interface BuildServerOptions {
  ctx?: ServiceContext;
}

export async function buildServer(opts: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" } }
          : undefined,
    },
    disableRequestLogging: env.NODE_ENV === "test",
  });

  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    req.log.error({ err }, "request failed");
    if (env.SENTRY_DSN) Sentry.captureException(err);
    reply.status(err.statusCode ?? 500).send({
      error: err.name ?? "InternalError",
      message: err.message,
    });
  });

  await app.register(healthRoutes);

  if (opts.ctx) {
    const ctx = opts.ctx;
    await app.register((inst) => trendingRoutes(inst, { ctx }));
    await app.register((inst) => approvalRoutes(inst, { ctx }));
    await app.register((inst) => workflowRoutes(inst, { ctx }));
    await app.register((inst) => wordpressRoutes(inst, { ctx }));
  }

  return app;
}
