import type { FastifyInstance } from "fastify";
import {
  HumanizeRequestSchema,
  ImageAnalysisRequestSchema,
  InterlinkRequestSchema,
} from "@pa/shared-types";
import { env } from "../env.js";
import type { ServiceContext } from "../context.js";

export async function polishRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/image-analysis", async (req) => {
    const body = ImageAnalysisRequestSchema.parse(req.body);
    const systemPrompt = await ctx.getImageAnalysisPrompt();
    return ctx.anthropic.analyzeImage(body, systemPrompt);
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
