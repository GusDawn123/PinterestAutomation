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
import { imageRoutes } from "./routes/images.js";
import { polishRoutes } from "./routes/polish.js";
import { pinRoutes } from "./routes/pins.js";
import { affiliateRoutes } from "./routes/affiliates.js";
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
    const status = err.statusCode ?? 500;
    if (status >= 500 && opts.ctx?.alerter) {
      void opts.ctx.alerter.send({
        severity: "error",
        title: `HTTP ${status} from ${req.method} ${req.url}`,
        message: err.message,
        context: { url: req.url, method: req.method, errorName: err.name ?? "InternalError" },
      });
    }
    reply.status(status).send({
      error: err.name ?? "InternalError",
      message: err.message,
    });
  });

  const multipart = await import("@fastify/multipart");
  await app.register(multipart.default, {
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  await app.register(healthRoutes);

  if (opts.ctx) {
    const ctx = opts.ctx;
    await app.register((inst) => trendingRoutes(inst, { ctx }));
    await app.register((inst) => approvalRoutes(inst, { ctx }));
    await app.register((inst) => workflowRoutes(inst, { ctx }));
    await app.register((inst) => wordpressRoutes(inst, { ctx }));
    await app.register((inst) => imageRoutes(inst, { ctx }));
    await app.register((inst) => polishRoutes(inst, { ctx }));
    await app.register((inst) => pinRoutes(inst, { ctx }));
    await app.register((inst) => affiliateRoutes(inst, { ctx }));
  }

  return app;
}
