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

export async function imageRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/workflows/:id/images/start", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });
    if (run.kind !== "blog") return reply.code(400).send({ error: "not_a_blog_workflow" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const draft = blogDraft.draft as {
      imageSlots?: Array<{ position: number; promptHint: string; altText?: string }>;
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

    const slotDrafts: ImageSlotDraft[] = slots.map((s) => ({
      slotPosition: s.position,
      promptHint: s.promptHint,
      uploadedImageUrl: "",
      needsManualUpload: true,
      ...(s.altText ? { altTextSuggestion: s.altText } : {}),
    }));

    const payload: ImagesApprovalPayload = { slots: slotDrafts };
    const approval = await ctx.approvals.create({
      workflowRunId: id,
      kind: "images",
      payload,
    });

    await ctx.workflow.update(id, {
      currentStep: "awaiting_images",
      status: "awaiting_approval",
    });

    return { workflowRunId: id, approvalId: approval.id, slots: slotDrafts };
  });

  app.post("/workflows/:id/images/:slotPosition/upload", async (req, reply) => {
    const { id, slotPosition } = SlotParam.parse(req.params);

    const file = await (req as unknown as {
      file: () => Promise<
        | {
            filename: string;
            mimetype: string;
            toBuffer: () => Promise<Buffer>;
          }
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

    const raw = await file.toBuffer();
    const converted = await convertPngToJpeg(raw, file.mimetype || "image/jpeg");
    const extHint = converted.contentType === "image/jpeg" ? "jpg" : "png";
    const stripped = await ctx.exif.stripBuffer(converted.data, extHint);
    const filename = renameToJpeg(
      file.filename || `slot-${slotPosition}.jpg`,
      converted.contentType,
    );

    const uploaded = await ctx.wordpress.uploadMedia({
      data: stripped,
      filename,
      contentType: converted.contentType,
      altText: payload.slots[idx]!.promptHint,
    });

    const slot = payload.slots[idx]!;
    let altTextSuggestion = slot.altTextSuggestion;
    try {
      const altPrompt = await ctx.getAltTextPrompt();
      const alt = await ctx.anthropic.generateAltText(
        {
          imageUrl: uploaded.sourceUrl,
          blogTitle: (blogDraft.draft as { headline: string }).headline,
          primaryKeyword: blogDraft.keyword,
          promptHint: slot.promptHint,
        },
        altPrompt,
      );
      altTextSuggestion = alt.altText;
    } catch (err) {
      app.log.warn({ err }, "alt_text_generation_failed_after_upload");
    }

    const updated: ImagesApprovalPayload = {
      slots: payload.slots.map((s, i) =>
        i === idx
          ? {
              ...s,
              uploadedImageUrl: uploaded.sourceUrl,
              needsManualUpload: false,
              ...(altTextSuggestion ? { altTextSuggestion } : {}),
            }
          : s,
      ),
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
      if (!slot.uploadedImageUrl || slot.uploadedImageUrl.length === 0) {
        return reply
          .code(400)
          .send({ error: "image_not_uploaded", slotPosition: slot.slotPosition });
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
        imageUrl: slot.uploadedImageUrl,
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

function renameToJpeg(filename: string, contentType: string): string {
  if (contentType !== "image/jpeg") return filename;
  const withoutExt = filename.replace(/\.(png|webp|jpeg|jpg)$/i, "");
  return `${withoutExt}.jpg`;
}
