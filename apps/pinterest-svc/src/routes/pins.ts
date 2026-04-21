import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PinCopyRequestSchema,
  PinsApprovalDecisionSchema,
  SchedulePinRequestSchema,
  StartPinsWorkflowInputSchema,
  type ComposedPin,
  type PinCopyVariation,
  type PinsApprovalPayload,
} from "@pa/shared-types";
import type { ServiceContext } from "../context.js";

const IdParam = z.object({ id: z.string().uuid() });

const RegeneratePinSchema = z.object({
  pinIndex: z.number().int().nonnegative(),
});

const PinIndexParam = z.object({
  id: z.string().uuid(),
  pinIndex: z.coerce.number().int().nonnegative(),
});

export async function pinRoutes(app: FastifyInstance, opts: { ctx: ServiceContext }) {
  const { ctx } = opts;

  app.post("/pins/copy", async (req) => {
    const body = PinCopyRequestSchema.parse(req.body);
    const prompt = await ctx.getPinCopyPrompt();
    const result = await ctx.anthropic.generatePinCopy(body, prompt);
    return result;
  });

  app.post("/workflows/:id/pins/start", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const body = StartPinsWorkflowInputSchema.parse({
      ...((req.body as object) ?? {}),
      blogWorkflowRunId: id,
    });

    const blogRun = await ctx.workflow.get(id);
    if (!blogRun) return reply.code(404).send({ error: "workflow_not_found" });
    if (blogRun.kind !== "blog") return reply.code(400).send({ error: "not_a_blog_workflow" });

    const blogDraft = await ctx.workflow.getBlogDraftByRun(id);
    if (!blogDraft) return reply.code(400).send({ error: "no_draft_for_workflow" });

    const chosenImages = (blogDraft.chosenImages as
      | Array<{ slotPosition: number; imageUrl: string; prompt: string; altText?: string }>
      | null) ?? [];
    if (chosenImages.length === 0) {
      return reply.code(400).send({ error: "no_chosen_images" });
    }

    const draft = blogDraft.draft as { headline: string };
    const blogUrl = blogDraft.wordpressPostId
      ? `wordpress://post/${blogDraft.wordpressPostId}`
      : `https://pending.blog/${blogDraft.id}`;

    const pinsRun = await ctx.workflow.create("pins", "generating_pin_copy", {
      blogWorkflowRunId: id,
      boardId: body.boardId,
      autoPost: body.autoPost,
    });

    const pinCopyPrompt = await ctx.getPinCopyPrompt();

    const composed: ComposedPin[] = [];
    for (let i = 0; i < chosenImages.length; i++) {
      const img = chosenImages[i]!;
      const copy = await ctx.anthropic.generatePinCopy(
        {
          blogHeadline: draft.headline,
          blogUrl,
          primaryKeyword: blogDraft.keyword,
          relatedKeywords: [],
          imageUrl: img.imageUrl,
          imageAltText: img.altText,
          variationsPerImage: 3,
        },
        pinCopyPrompt,
      );

      composed.push({
        pinIndex: i,
        sourceImageUrl: img.imageUrl,
        composedImageUrl: "",
        variations: copy.variations,
        needsManualUpload: true,
      });
    }

    const payload: PinsApprovalPayload = {
      blogPostId: blogDraft.wordpressPostId ? Number(blogDraft.wordpressPostId) : undefined,
      blogUrl,
      boardId: body.boardId,
      pins: composed,
    };

    const approval = await ctx.approvals.create({
      workflowRunId: pinsRun.id,
      kind: "pins",
      payload,
    });

    await ctx.workflow.update(pinsRun.id, {
      currentStep: "awaiting_pins_approval",
      status: "awaiting_approval",
    });

    return {
      workflowRunId: pinsRun.id,
      approvalId: approval.id,
      pinCount: composed.length,
    };
  });

  app.post("/workflows/:id/pins/regenerate", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { pinIndex } = RegeneratePinSchema.parse(req.body);

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "pins" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_pins_approval" });

    const payload = pending.payload as PinsApprovalPayload;
    const idx = payload.pins.findIndex((p) => p.pinIndex === pinIndex);
    if (idx === -1) return reply.code(400).send({ error: "pin_not_found" });

    const pin = payload.pins[idx]!;
    const prompt = await ctx.getPinCopyPrompt();
    const copy = await ctx.anthropic.generatePinCopy(
      {
        blogHeadline: "regenerate",
        blogUrl: payload.blogUrl,
        primaryKeyword: "",
        relatedKeywords: [],
        imageUrl: pin.sourceImageUrl,
        variationsPerImage: 3,
      },
      prompt,
    );

    const updated: PinsApprovalPayload = {
      ...payload,
      pins: payload.pins.map((p, i) =>
        i === idx ? { ...p, variations: copy.variations } : p,
      ),
    };

    await ctx.approvals.updatePayload(pending.id, updated);
    return { pin: updated.pins[idx] };
  });

  app.post("/workflows/:id/pins/:pinIndex/upload", async (req, reply) => {
    const { id, pinIndex } = PinIndexParam.parse(req.params);

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
    const pending = approvals.find((a) => a.kind === "pins" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_pins_approval" });

    const payload = pending.payload as PinsApprovalPayload;
    const idx = payload.pins.findIndex((p) => p.pinIndex === pinIndex);
    if (idx === -1) return reply.code(400).send({ error: "pin_not_found" });

    const raw = await file.toBuffer();
    const { data, contentType } = await toJpegIfNeeded(raw, file.mimetype || "image/jpeg");
    const extHint = contentType === "image/jpeg" ? "jpg" : "png";
    const stripped = await ctx.exif.stripBuffer(data, extHint);
    const filename = renameToJpeg(file.filename || `pin-${pinIndex}.jpg`, contentType);

    const uploaded = await ctx.wordpress.uploadMedia({
      data: stripped,
      filename,
      contentType,
      altText: payload.pins[idx]!.variations[0]?.title ?? `pin ${pinIndex}`,
    });

    const updated: PinsApprovalPayload = {
      ...payload,
      pins: payload.pins.map((p, i) =>
        i === idx
          ? {
              ...p,
              composedImageUrl: uploaded.sourceUrl,
              needsManualUpload: false,
            }
          : p,
      ),
    };

    await ctx.approvals.updatePayload(pending.id, updated);
    return { pin: updated.pins[idx] };
  });

  app.post("/workflows/:id/pins/decide", async (req, reply) => {
    const { id } = IdParam.parse(req.params);
    const { approvedPins, autoPost } = PinsApprovalDecisionSchema.parse(req.body);

    const run = await ctx.workflow.get(id);
    if (!run) return reply.code(404).send({ error: "workflow_not_found" });

    const approvals = await ctx.approvals.listByRun(id);
    const pending = approvals.find((a) => a.kind === "pins" && a.status === "pending");
    if (!pending) return reply.code(404).send({ error: "no_pending_pins_approval" });

    const payload = pending.payload as PinsApprovalPayload;

    for (const pick of approvedPins) {
      const pin = payload.pins.find((p) => p.pinIndex === pick.pinIndex);
      if (!pin) return reply.code(400).send({ error: `unknown_pin_${pick.pinIndex}` });
      if (!pin.composedImageUrl || pin.composedImageUrl.length === 0) {
        return reply
          .code(400)
          .send({ error: "pin_not_uploaded", pinIndex: pick.pinIndex });
      }
    }

    const queuedIds: string[] = [];
    const now = new Date();
    const scheduleAtHourOffset = (offset: number): Date => {
      const d = new Date(now);
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + offset);
      return d;
    };

    for (const pick of approvedPins) {
      const pin = payload.pins.find((p) => p.pinIndex === pick.pinIndex)!;
      const chosen: PinCopyVariation = pick.edited ?? pin.variations[pick.chosenVariationIndex]!;
      if (!chosen) return reply.code(400).send({ error: `unknown_variation_${pick.chosenVariationIndex}` });

      let scheduledAt: Date | null = null;
      if (autoPost) {
        scheduledAt = await ctx.recommender.nextSlotFor(payload.boardId, now);
      }
      if (!scheduledAt) {
        scheduledAt = scheduleAtHourOffset(1 + queuedIds.length);
      }

      const row = await ctx.pinsQueue.enqueue({
        workflowRunId: id,
        blogPostId: payload.blogPostId ?? null,
        imageUrl: pin.composedImageUrl,
        title: chosen.title,
        description: chosen.description,
        boardId: payload.boardId,
        linkBackUrl: payload.blogUrl,
        scheduledAt,
      });
      queuedIds.push(row.id);
    }

    await ctx.approvals.decide({
      approvalId: pending.id,
      status: "approved",
      decisionData: { approvedPins, autoPost },
    });
    await ctx.workflow.update(id, {
      currentStep: autoPost ? "scheduled" : "awaiting_manual_schedule",
      status: "completed",
      finishedAt: new Date(),
    });

    return { workflowRunId: id, queued: queuedIds };
  });

  app.post("/pins/schedule", async (req) => {
    const body = SchedulePinRequestSchema.parse(req.body);
    const row = await ctx.pinsQueue.enqueue({
      workflowRunId: null,
      blogPostId: body.blogPostId ?? null,
      imageUrl: body.imageUrl,
      title: body.title,
      description: body.description,
      boardId: body.boardId,
      linkBackUrl: body.linkBackUrl,
      scheduledAt: new Date(body.scheduledAt),
    });
    return { id: row.id, scheduledAt: row.scheduledAt };
  });

  app.get("/pins/queue", async () => {
    const upcoming = await ctx.pinsQueue.listUpcoming(200);
    return { items: upcoming };
  });

  app.get("/pins/posted", async () => {
    const posted = await ctx.pinsQueue.listPosted(200);
    return { items: posted };
  });

  app.post("/pins/:pinQueueId/reschedule", async (req, reply) => {
    const params = z.object({ pinQueueId: z.string().uuid() }).parse(req.params);
    const body = z.object({ scheduledAt: z.string().datetime() }).parse(req.body);
    try {
      const row = await ctx.pinsQueue.reschedule(params.pinQueueId, new Date(body.scheduledAt));
      return { id: row.id, scheduledAt: row.scheduledAt };
    } catch {
      return reply.code(404).send({ error: "pin_queue_row_not_found" });
    }
  });

  app.delete("/pins/:pinQueueId", async (req) => {
    const params = z.object({ pinQueueId: z.string().uuid() }).parse(req.params);
    await ctx.pinsQueue.cancel(params.pinQueueId);
    return { ok: true };
  });

  app.get("/analytics/slots", async (req) => {
    const q = z.object({ boardId: z.string().min(1) }).parse(req.query);
    const slots = await ctx.recommender.listForBoard(q.boardId, 20);
    return { slots };
  });

  app.get("/analytics/pins/:pinterestPinId", async (req, reply) => {
    const params = z.object({ pinterestPinId: z.string().min(1) }).parse(req.params);
    const latest = await ctx.analytics.latestForPin(params.pinterestPinId);
    if (!latest) return reply.code(404).send({ error: "no_analytics" });
    return { analytics: latest };
  });

  app.get("/analytics/pins", async () => {
    const all = await ctx.analytics.all(500);
    return { items: all };
  });
}

async function toJpegIfNeeded(
  data: Buffer,
  contentType: string,
): Promise<{ data: Buffer; contentType: string }> {
  const needs = contentType === "image/png" || contentType === "image/webp";
  if (!needs) return { data, contentType };
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp(data).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return { data: jpeg, contentType: "image/jpeg" };
}

function renameToJpeg(filename: string, contentType: string): string {
  if (contentType !== "image/jpeg") return filename;
  return filename.replace(/\.(png|webp|jpeg)$/i, ".jpg").replace(/^(.+?)$/, (s) =>
    s.toLowerCase().endsWith(".jpg") ? s : `${s}.jpg`,
  );
}
