import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AffiliatesApprovalDecisionSchema,
  AffiliatesApprovalPayloadSchema,
  type AffiliatesApprovalPayload,
  type ChosenImage,
} from "@pa/shared-types";
import type { ServiceContext } from "../context.js";

const IdParam = z.object({ id: z.string().uuid() });

export async function affiliateRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/workflows/:id/affiliates/start", async (req, reply) => {
    const { id } = IdParam.parse(req.params);

    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const chosen = (blogDraft.chosenImages as ChosenImage[] | null) ?? [];
    if (chosen.length === 0) {
      return reply.code(400).send({ error: "no_chosen_images" });
    }

    const existing = await ctx.approvals.listByRun(id);
    const alreadyPending = existing.find(
      (a) => a.kind === "affiliates" && a.status === "pending",
    );
    if (alreadyPending) {
      return {
        workflowRunId: id,
        approvalId: alreadyPending.id,
        slotCount: (alreadyPending.payload as AffiliatesApprovalPayload).slots.length,
      };
    }

    const systemPrompt = await ctx.getAffiliateQueriesPrompt();
    const draft = blogDraft.draft as { headline: string };

    const slots: AffiliatesApprovalPayload["slots"] = [];
    for (const image of chosen) {
      const result = await ctx.anthropic.suggestAffiliateQueries(
        {
          imageUrl: image.imageUrl,
          blogHeadline: draft.headline,
          primaryKeyword: blogDraft.keyword,
          ...(image.altText ? { altText: image.altText } : {}),
        },
        systemPrompt,
      );
      slots.push({
        slotPosition: image.slotPosition,
        imageUrl: image.imageUrl,
        ...(image.altText ? { altText: image.altText } : {}),
        suggestedQueries: result.queries,
        products: [],
      });
    }

    const payload = AffiliatesApprovalPayloadSchema.parse({ slots });

    const approval = await ctx.approvals.create({
      workflowRunId: id,
      kind: "affiliates",
      payload,
    });

    await ctx.workflow.update(id, {
      currentStep: "awaiting_affiliates_approval",
      status: "awaiting_approval",
    });

    return { workflowRunId: id, approvalId: approval.id, slotCount: slots.length };
  });

  app.post("/workflows/:id/affiliates/decide", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const decision = AffiliatesApprovalDecisionSchema.parse(req.body);

    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "affiliates" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_affiliates_approval" });

    const payload = pending.payload as AffiliatesApprovalPayload;
    for (const decisionSlot of decision.slots) {
      const match = payload.slots.find((s) => s.slotPosition === decisionSlot.slotPosition);
      if (!match) {
        return reply.code(400).send({ error: `unknown_slot_${decisionSlot.slotPosition}` });
      }
    }

    const updatedPayload: AffiliatesApprovalPayload = {
      slots: payload.slots.map((slot) => {
        const decisionSlot = decision.slots.find((s) => s.slotPosition === slot.slotPosition);
        return decisionSlot ? { ...slot, products: decisionSlot.products } : slot;
      }),
    };

    await ctx.workflow.updateBlogDraftAffiliates(
      blogDraft.id,
      decision.slots.map((s) => ({ slotPosition: s.slotPosition, products: s.products })),
    );

    await ctx.approvals.updatePayload(pending.id, updatedPayload);
    await ctx.approvals.decide({
      approvalId: pending.id,
      status: "approved",
      decisionData: { slots: decision.slots },
    });
    await ctx.workflow.update(id, { currentStep: "affiliates_approved", status: "running" });

    return { workflowRunId: id, slotCount: updatedPayload.slots.length };
  });
}
