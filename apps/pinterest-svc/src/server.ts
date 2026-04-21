import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { env } from "./env.js";
import { Sentry } from "./tracing.js";
import { healthRoutes } from "./routes/health.js";

export async function buildServer(): Promise<FastifyInstance> {
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

  return app;
}
