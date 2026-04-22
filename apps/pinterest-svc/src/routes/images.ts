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

const ReanalyzeBody = z.object({
  instructions: z.string().max(500).optional(),
});

async function analyzeAndPatchSlot(
  app: FastifyInstance,
  ctx: ServiceContext,
  existing: ImageSlotDraft,
  uploadedImageUrl: string,
  blogHeadline: string,
  blogKeyword: string,
  instructions?: string,
): Promise<ImageSlotDraft> {
  try {
    const prompt = await ctx.getImageAnalysisPrompt();
    const analysis = await ctx.anthropic.analyzeImage(
      {
        imageUrl: uploadedImageUrl,
        blogTitle: blogHeadline,
        primaryKeyword: blogKeyword,
        promptHint: existing.promptHint,
        ...(instructions ? { instructions } : {}),
      },
      prompt,
    );
    return {
      slotPosition: existing.slotPosition,
      promptHint: existing.promptHint,
      uploadedImageUrl,
      title: analysis.title,
      altText: analysis.altText,
      detectedTags: analysis.detectedTags,
    };
  } catch (err) {
    app.log.warn(
      { err, slotPosition: existing.slotPosition },
      "image_analysis_failed",
    );
    // Keep the upload, leave copy fields empty so Carmen can fill in or retry.
    return {
      slotPosition: existing.slotPosition,
      promptHint: existing.promptHint,
      uploadedImageUrl,
      title: existing.title,
      altText: existing.altText,
      detectedTags: existing.detectedTags,
    };
  }
}

export async function imageRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  // Stage 3 begins: seed empty upload slots from the blog draft. No image generation.
  app.post("/workflows/:id/images/start", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });
    if (run.kind !== "blog") return reply.code(400).send({ error: "not_a_blog_workflow" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const draft = blogDraft.draft as {
      headline: string;
      imageSlots?: Array<{ position: number; promptHint: string }>;
    };
    const draftSlots = draft.imageSlots ?? [];
    if (draftSlots.length === 0) {
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

    const slots: ImageSlotDraft[] = draftSlots.map((s) => ({
      slotPosition: s.position,
      promptHint: s.promptHint,
      uploadedImageUrl: "",
      title: "",
      altText: "",
      detectedTags: [],
    }));

    const payload: ImagesApprovalPayload = { slots };
    const approval = await ctx.approvals.create({
      workflowRunId: id,
      kind: "images",
      payload,
    });

    await ctx.workflow.update(id, {
      currentStep: "awaiting_images_approval",
      status: "awaiting_approval",
    });

    return { workflowRunId: id, approvalId: approval.id, slots };
  });

  // Carmen uploads her own photography for a slot.
  // Flow: multipart file → JPEG convert → EXIF strip → WordPress upload → Claude vision analysis.
  app.post("/workflows/:id/images/:slotPosition/upload", async (req, reply) => {
    const { id, slotPosition } = SlotParam.parse(req.params);

    const file = await (req as unknown as {
      file: () => Promise<
        | { filename: string; mimetype: string; toBuffer: () => Promise<Buffer> }
        | undefined
      >;
    }).file();
    if (!file) return reply.code(400).send({ error: "no_file" });

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "images" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_images_approval" });

    const payload = pending.payload as ImagesApprovalPayload;
    const idx = payload.slots.findIndex((s) => s.slotPosition === slotPosition);
    if (idx === -1) return reply.code(400).send({ error: "slot_not_found" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });
    const draft = blogDraft.draft as { headline: string };

    const raw = await file.toBuffer();
    const converted = await convertPngToJpeg(raw, file.mimetype || "image/jpeg");
    const extHint = converted.contentType === "image/jpeg" ? "jpg" : "png";
    const stripped = await ctx.exif.stripBuffer(converted.data, extHint);

    const slot = payload.slots[idx]!;
    const filenameBase = file.filename?.replace(/\.(png|webp|jpeg|jpg)$/i, "") || `slot-${slotPosition}`;
    const filename =
      converted.contentType === "image/jpeg" ? `${filenameBase}.jpg` : `${filenameBase}.png`;

    const uploaded = await ctx.wordpress.uploadMedia({
      data: stripped,
      filename,
      contentType: converted.contentType,
      altText: slot.promptHint || `image slot ${slotPosition}`,
    });

    const refreshed = await analyzeAndPatchSlot(
      app,
      ctx,
      slot,
      uploaded.sourceUrl,
      draft.headline,
      blogDraft.keyword,
    );

    const updated: ImagesApprovalPayload = {
      slots: payload.slots.map((s, i) => (i === idx ? refreshed : s)),
    };
    await ctx.approvals.updatePayload(pending.id, updated);
    return { slot: refreshed };
  });

  // Re-run Claude vision on the slot's existing upload (no re-upload).
  // Optional `instructions` lets Carmen steer ("more whimsical", "focus on the lamp").
  app.post("/workflows/:id/images/:slotPosition/reanalyze", async (req, reply) => {
    const { id, slotPosition } = SlotParam.parse(req.params);
    const { instructions } = ReanalyzeBody.parse(req.body ?? {});

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "images" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_images_approval" });

    const payload = pending.payload as ImagesApprovalPayload;
    const idx = payload.slots.findIndex((s) => s.slotPosition === slotPosition);
    if (idx === -1) return reply.code(400).send({ error: "slot_not_found" });

    const slot = payload.slots[idx]!;
    if (!slot.uploadedImageUrl) {
      return reply.code(400).send({ error: "slot_has_no_upload" });
    }

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });
    const draft = blogDraft.draft as { headline: string };

    const refreshed = await analyzeAndPatchSlot(
      app,
      ctx,
      slot,
      slot.uploadedImageUrl,
      draft.headline,
      blogDraft.keyword,
      instructions,
    );

    const updated: ImagesApprovalPayload = {
      slots: payload.slots.map((s, i) => (i === idx ? refreshed : s)),
    };
    await ctx.approvals.updatePayload(pending.id, updated);
    return { slot: refreshed };
  });

  // Clear a slot's upload (lets Carmen start over before approving).
  app.delete("/workflows/:id/images/:slotPosition/upload", async (req, reply) => {
    const { id, slotPosition } = SlotParam.parse(req.params);

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "images" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_images_approval" });

    const payload = pending.payload as ImagesApprovalPayload;
    const idx = payload.slots.findIndex((s) => s.slotPosition === slotPosition);
    if (idx === -1) return reply.code(400).send({ error: "slot_not_found" });

    const slot = payload.slots[idx]!;
    const cleared: ImageSlotDraft = {
      slotPosition: slot.slotPosition,
      promptHint: slot.promptHint,
      uploadedImageUrl: "",
      title: "",
      altText: "",
      detectedTags: [],
    };

    const updated: ImagesApprovalPayload = {
      slots: payload.slots.map((s, i) => (i === idx ? cleared : s)),
    };
    await ctx.approvals.updatePayload(pending.id, updated);
    return { slot: cleared };
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
      if (!slot.uploadedImageUrl) {
        return reply
          .code(400)
          .send({ error: "image_not_uploaded", slotPosition: slot.slotPosition });
      }
    }

    const overrideByPos = new Map(
      parsed.slots.map((s) => [s.slotPosition, { title: s.titleOverride, alt: s.altTextOverride }]),
    );

    const chosen: ChosenImage[] = payload.slots.map((slot) => {
      const override = overrideByPos.get(slot.slotPosition);
      return {
        slotPosition: slot.slotPosition,
        imageUrl: slot.uploadedImageUrl,
        prompt: slot.promptHint,
        title: override?.title ?? slot.title,
        altText: override?.alt ?? slot.altText,
        detectedTags: slot.detectedTags,
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
