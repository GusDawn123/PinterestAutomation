import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ImagesApprovalDecisionSchema,
  type ChosenImage,
  type ImageSlotDraft,
  type ImagesApprovalPayload,
} from "@pa/shared-types";
import type { ServiceContext } from "../context.js";
import { convertPngToJpeg } from "./wordpress.js";

const IdParam = z.object({ id: z.string().uuid() });

const SlotParam = z.object({
  id: z.string().uuid(),
  slotPosition: z.coerce.number().int().nonnegative(),
});

async function downloadImageBuffer(
  url: string,
  ctx: ServiceContext,
): Promise<{ data: Buffer; contentType: string }> {
  if (ctx.downloadImage) return ctx.downloadImage(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image from Ideogram: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  return { data: Buffer.from(await res.arrayBuffer()), contentType };
}

async function generateAndUploadSlot(
  app: FastifyInstance,
  ctx: ServiceContext,
  slot: { position: number; promptHint: string },
  blogDraftKeyword: string,
  blogDraftHeadline: string,
): Promise<ImageSlotDraft> {
  const generated = await ctx.ideogram.generate({ prompt: slot.promptHint });
  const downloaded = await downloadImageBuffer(generated.imageUrl, ctx);
  const converted = await convertPngToJpeg(downloaded.data, downloaded.contentType);
  const extHint = converted.contentType === "image/jpeg" ? "jpg" : "png";
  const stripped = await ctx.exif.stripBuffer(converted.data, extHint);

  const uploaded = await ctx.wordpress.uploadMedia({
    data: stripped,
    filename: `slot-${slot.position}-ideogram.jpg`,
    contentType: converted.contentType,
    altText: slot.promptHint,
  });

  let altTextSuggestion: string | undefined;
  try {
    const altPrompt = await ctx.getAltTextPrompt();
    const alt = await ctx.anthropic.generateAltText(
      {
        imageUrl: uploaded.sourceUrl,
        blogTitle: blogDraftHeadline,
        primaryKeyword: blogDraftKeyword,
        promptHint: slot.promptHint,
      },
      altPrompt,
    );
    altTextSuggestion = alt.altText;
  } catch (err) {
    app.log.warn({ err, slotPosition: slot.position }, "alt_text_generation_failed");
  }

  return {
    slotPosition: slot.position,
    promptHint: slot.promptHint,
    generatedImageUrl: uploaded.sourceUrl,
    ideogramSeed: generated.seed,
    ...(altTextSuggestion ? { altTextSuggestion } : {}),
  };
}

export async function imageRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/workflows/:id/images/start", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });
    if (run.kind !== "blog") return reply.code(400).send({ error: "not_a_blog_workflow" });

    if (!ctx.ideogram.isConfigured()) {
      return reply.code(503).send({ error: "ideogram_not_configured" });
    }

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const draft = blogDraft.draft as {
      headline: string;
      imageSlots?: Array<{ position: number; promptHint: string }>;
    };
    const slots = draft.imageSlots ?? [];
    if (slots.length === 0) {
      return reply.code(400).send({ error: "draft_has_no_image_slots" });
    }

    const existing = await ctx.approvals.listByRun(id);
    const already = existing.find((a) => a.kind === "images" && a.status === "pending");
    if (already) {
      return {
        workflowRunId: id,
        approvalId: already.id,
        slots: (already.payload as ImagesApprovalPayload).slots,
      };
    }

    const draftApproval = existing.find((a) => a.kind === "draft" && a.status === "pending");
    if (draftApproval) {
      await ctx.approvals.decide({ approvalId: draftApproval.id, status: "approved" });
    }

    const slotDrafts: ImageSlotDraft[] = await Promise.all(
      slots.map((s) =>
        generateAndUploadSlot(app, ctx, s, blogDraft.keyword, draft.headline).catch((err) => {
          app.log.error({ err, slotPosition: s.position }, "ideogram_slot_generation_failed");
          return {
            slotPosition: s.position,
            promptHint: s.promptHint,
            generatedImageUrl: "",
          } satisfies ImageSlotDraft;
        }),
      ),
    );

    const payload: ImagesApprovalPayload = { slots: slotDrafts };
    const approval = await ctx.approvals.create({
      workflowRunId: id,
      kind: "images",
      payload,
    });

    await ctx.workflow.update(id, {
      currentStep: "awaiting_images_approval",
      status: "awaiting_approval",
    });

    return { workflowRunId: id, approvalId: approval.id, slots: slotDrafts };
  });

  app.post("/workflows/:id/images/:slotPosition/regenerate", async (req, reply) => {
    const { id, slotPosition } = SlotParam.parse(req.params);

    if (!ctx.ideogram.isConfigured()) {
      return reply.code(503).send({ error: "ideogram_not_configured" });
    }

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "images" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_images_approval" });

    const payload = pending.payload as ImagesApprovalPayload;
    const idx = payload.slots.findIndex((s) => s.slotPosition === slotPosition);
    if (idx === -1) return reply.code(400).send({ error: "slot_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const draft = blogDraft.draft as { headline: string };
    const slot = payload.slots[idx]!;

    const refreshed = await generateAndUploadSlot(
      app,
      ctx,
      { position: slot.slotPosition, promptHint: slot.promptHint },
      blogDraft.keyword,
      draft.headline,
    );

    const updated: ImagesApprovalPayload = {
      slots: payload.slots.map((s, i) => (i === idx ? refreshed : s)),
    };

    await ctx.approvals.updatePayload(pending.id, updated);
    return { slot: updated.slots[idx] };
  });

  app.post("/workflows/:id/images/decide", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const parsed = ImagesApprovalDecisionSchema.parse(req.body);

    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "images" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_images_approval" });

    const payload = pending.payload as ImagesApprovalPayload;

    for (const slot of payload.slots) {
      if (!slot.generatedImageUrl) {
        return reply
          .code(400)
          .send({ error: "image_not_generated", slotPosition: slot.slotPosition });
      }
    }

    const overrideByPos = new Map(
      parsed.slots.map((s) => [s.slotPosition, s.altTextOverride]),
    );

    const chosen: ChosenImage[] = payload.slots.map((slot) => {
      const override = overrideByPos.get(slot.slotPosition);
      const altText = override ?? slot.altTextSuggestion;
      return {
        slotPosition: slot.slotPosition,
        imageUrl: slot.generatedImageUrl,
        prompt: slot.promptHint,
        ...(altText ? { altText } : {}),
      };
    });

    await ctx.approvals.decide({
      approvalId: pending.id,
      status: "approved",
      decisionData: { slots: parsed.slots },
    });
    await ctx.workflow.updateBlogDraftImages(blogDraft.id, chosen);
    await ctx.workflow.update(id, {
      currentStep: "awaiting_affiliates_approval",
      status: "running",
    });

    return { workflowRunId: id, chosenImages: chosen };
  });
}
