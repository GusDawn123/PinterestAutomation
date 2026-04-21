import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  KeywordApprovalDecisionSchema,
  StartBlogWorkflowInputSchema,
} from "@pa/shared-types";
import { scoreKeywords } from "../scoring.js";
import type { ServiceContext } from "../context.js";

const IdParam = z.object({ id: z.string().uuid() });

export async function workflowRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/workflows/blog/start", async (req) => {
    const input = StartBlogWorkflowInputSchema.parse(req.body ?? {});

    const raw = await ctx.pinterest.getTrendingKeywords(input.region);
    const scored = scoreKeywords(raw).slice(0, 5);

    const run = await ctx.workflow.create("blog", "awaiting_keyword", { region: input.region });
    await ctx.workflow.update(run.id, { status: "awaiting_approval" });

    const approval = await ctx.approvals.create({
      workflowRunId: run.id,
      kind: "keyword",
      payload: { candidates: scored },
    });

    return { workflowRunId: run.id, approvalId: approval.id };
  });

  app.post("/workflows/:id/draft", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { chosenKeyword, brief } = KeywordApprovalDecisionSchema.parse(req.body);

    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });
    if (run.kind !== "blog") {
      return reply.code(400).send({ error: "not_a_blog_workflow" });
    }

    const pendingApprovals = await ctx.approvals.listByRun(id);
    const keywordApproval = pendingApprovals.find(
      (a) => a.kind === "keyword" && a.status === "pending",
    );
    if (keywordApproval) {
      await ctx.approvals.decide({
        approvalId: keywordApproval.id,
        status: "approved",
        decisionData: { chosenKeyword, brief },
      });
    }

    await ctx.workflow.update(id, {
      currentStep: "drafting",
      status: "running",
      context: { ...(run.context as object), chosenKeyword, brief },
    });

    const systemPrompt = await ctx.getBlogDraftPrompt();
    const draft = await ctx.anthropic.generateBlogDraft(
      { keyword: chosenKeyword, brief },
      systemPrompt,
    );

    await ctx.workflow.saveBlogDraft(id, chosenKeyword, brief, draft);

    await ctx.workflow.update(id, { currentStep: "awaiting_draft", status: "awaiting_approval" });

    const approval = await ctx.approvals.create({
      workflowRunId: id,
      kind: "draft",
      payload: { draft, chosenKeyword, brief },
    });

    return { workflowRunId: id, approvalId: approval.id, draft };
  });

  app.get("/workflows/:id", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });
    const approvals = await ctx.approvals.listByRun(id);
    const blogDraft = run.kind === "blog" ? await ctx.workflow.getBlogDraftByRun(id) : null;
    return { run, approvals, blogDraft };
  });
}
