import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { WordpressDraftRequestSchema } from "@pa/shared-types";
import type { ServiceContext } from "../context.js";

const IdParam = z.object({ id: z.string().uuid() });

export async function wordpressRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/wordpress/draft", async (req) => {
    const { draft } = WordpressDraftRequestSchema.parse(req.body);
    return ctx.wordpress.createDraft(draft);
  });

  app.post("/workflows/:id/wordpress-draft", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const wp = await ctx.wordpress.createDraft(blogDraft.draft as never);
    await ctx.workflow.updateBlogDraftWpId(blogDraft.id, String(wp.postId));
    await ctx.workflow.update(id, {
      currentStep: "wordpress_draft_created",
      status: "completed",
      finishedAt: new Date(),
    });

    return wp;
  });
}
