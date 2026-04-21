import type { FastifyInstance } from "fastify";
import {
  AltTextRequestSchema,
  HumanizeRequestSchema,
  InterlinkRequestSchema,
} from "@pa/shared-types";
import { env } from "../env.js";
import type { ServiceContext } from "../context.js";

export async function polishRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/alt-text", async (req) => {
    const body = AltTextRequestSchema.parse(req.body);
    const systemPrompt = await ctx.getAltTextPrompt();
    return ctx.anthropic.generateAltText(body, systemPrompt);
  });

  app.post("/interlinks", async (req) => {
    const body = InterlinkRequestSchema.parse(req.body);
    const systemPrompt = await ctx.getInterlinkPrompt();
    return ctx.anthropic.pickInterlinks(body, systemPrompt);
  });

  app.post("/humanize", async (req, reply) => {
    const body = HumanizeRequestSchema.parse(req.body);
    if (!env.HUMANIZE_ENABLED) {
      return reply.code(400).send({
        error: "humanize_disabled",
        message: "Set HUMANIZE_ENABLED=true to use /humanize",
      });
    }
    return ctx.undetectable.humanize(body);
  });
}
