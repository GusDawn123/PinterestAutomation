import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { scoreKeywords } from "../scoring.js";
import type { ServiceContext } from "../context.js";

const QuerySchema = z.object({
  region: z.string().length(2).default("US"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function trendingRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.get("/trending", async (req) => {
    const { region, limit } = QuerySchema.parse(req.query ?? {});
    const raw = await ctx.pinterest.getTrendingKeywords(region);
    const scored = scoreKeywords(raw).slice(0, limit);
    return { region, scored };
  });
}
