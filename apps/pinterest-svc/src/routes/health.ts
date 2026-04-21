import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    status: "ok",
    ts: new Date().toISOString(),
    service: "pinterest-svc",
    version: "0.0.1",
  }));

  app.get("/ready", async (_req, reply) => {
    reply.code(200).send({ ready: true });
  });
}
