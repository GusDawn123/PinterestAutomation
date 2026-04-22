import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";
import type { BlogDraft, ImagesApprovalPayload } from "@pa/shared-types";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.workflow.get.mockReset();
  mock.workflow.getBlogDraftByRun.mockReset();
  mock.workflow.update.mockReset();
  mock.workflow.updateBlogDraftImages.mockReset();
  mock.approvals.listByRun.mockReset();
  mock.approvals.create.mockReset();
  mock.approvals.updatePayload.mockReset();
  mock.approvals.decide.mockReset();
  mock.wordpress.uploadMedia.mockReset();
  mock.anthropic.analyzeImage.mockReset();
  mock.exif.stripBuffer.mockReset();
  mock.exif.stripBuffer.mockImplementation(async (buf: Buffer) => buf);
});

afterAll(async () => {
  await app.close();
});

const DRAFT_WITH_SLOTS: BlogDraft = {
  headline: "Cozy Nook Ideas",
  urlSlug: "cozy-nook-ideas",
  bodyMarkdown: "body",
  metaDescription: "m",
  socialDescription: "s",
  category: "Home",
  tags: ["cozy"],
  imageSlots: [
    { position: 0, promptHint: "sunlit reading nook" },
    { position: 1, promptHint: "warm kitchen corner" },
  ],
};

// --- Fixture: JPEG SOI+EOI bytes. Minimal valid multipart body Fastify will accept. ---
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function multipartBody(filename: string, contentType: string, data: Buffer): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----test-boundary-" + Date.now();
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    payload: Buffer.concat([head, data, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("POST /workflows/:id/images/start", () => {
  const runId = "00000000-0000-4000-8000-000000000a00";
  const draftId = "00000000-0000-4000-8000-000000000a01";
  const draftApprovalId = "00000000-0000-4000-8000-000000000a02";
  const newApprovalId = "00000000-0000-4000-8000-000000000a03";

  it("seeds empty upload slots from the draft (no image generation)", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      draft: DRAFT_WITH_SLOTS,
    } as never);
    mock.approvals.listByRun.mockResolvedValue([
      { id: draftApprovalId, kind: "draft", status: "pending" },
    ] as never);
    mock.approvals.decide.mockResolvedValue({} as never);
    mock.approvals.create.mockResolvedValue({ id: newApprovalId } as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/start`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slots: ImagesApprovalPayload["slots"]; approvalId: string };
    expect(body.approvalId).toBe(newApprovalId);
    expect(body.slots).toHaveLength(2);
    expect(body.slots[0]).toMatchObject({
      slotPosition: 0,
      promptHint: "sunlit reading nook",
      uploadedImageUrl: "",
      title: "",
      altText: "",
      detectedTags: [],
    });
    expect(mock.wordpress.uploadMedia).not.toHaveBeenCalled();
    expect(mock.anthropic.analyzeImage).not.toHaveBeenCalled();
    expect(mock.approvals.decide).toHaveBeenCalledWith({
      approvalId: draftApprovalId,
      status: "approved",
    });
  });

  it("returns existing pending approval idempotently", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      draft: DRAFT_WITH_SLOTS,
    } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: newApprovalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "sunlit reading nook",
              uploadedImageUrl: "https://wp.example.com/existing.jpg",
              title: "existing title",
              altText: "existing alt",
              detectedTags: ["linen"],
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/start`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { approvalId: string };
    expect(body.approvalId).toBe(newApprovalId);
    expect(mock.approvals.create).not.toHaveBeenCalled();
  });

  it("400s when draft has no image slots", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      draft: { ...DRAFT_WITH_SLOTS, imageSlots: [] },
    } as never);
    mock.approvals.listByRun.mockResolvedValue([] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/start`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /workflows/:id/images/:slotPosition/upload", () => {
  const runId = "00000000-0000-4000-8000-000000000b00";
  const draftId = "00000000-0000-4000-8000-000000000b01";
  const approvalId = "00000000-0000-4000-8000-000000000b02";

  it("uploads the file to WP, runs vision analysis, and patches the slot", async () => {
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "sunlit reading nook",
              uploadedImageUrl: "",
              title: "",
              altText: "",
              detectedTags: [],
            },
          ],
        },
      },
    ] as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      draft: { headline: "Cozy Nook Ideas" },
    } as never);
    mock.wordpress.uploadMedia.mockResolvedValue({
      mediaId: 801,
      sourceUrl: "https://wp.example.com/uploaded.jpg",
    });
    mock.anthropic.analyzeImage.mockResolvedValue({
      title: "Morning light over a linen nook",
      altText: "Sunlit reading nook with linen cushions and wildflowers on the sill",
      detectedTags: ["linen cushions", "morning light", "wildflowers"],
      confidence: "high",
    });
    mock.approvals.updatePayload.mockResolvedValue({} as never);

    const { payload, headers } = multipartBody("nook.jpg", "image/jpeg", JPEG_BYTES);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/upload`,
      payload,
      headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slot: ImagesApprovalPayload["slots"][number] };
    expect(body.slot).toMatchObject({
      slotPosition: 0,
      promptHint: "sunlit reading nook",
      uploadedImageUrl: "https://wp.example.com/uploaded.jpg",
      title: "Morning light over a linen nook",
      altText: "Sunlit reading nook with linen cushions and wildflowers on the sill",
      detectedTags: ["linen cushions", "morning light", "wildflowers"],
    });
    expect(mock.wordpress.uploadMedia).toHaveBeenCalledTimes(1);
    expect(mock.anthropic.analyzeImage).toHaveBeenCalledTimes(1);
    expect(mock.approvals.updatePayload).toHaveBeenCalledTimes(1);
  });

  it("keeps the upload but leaves copy empty when vision analysis throws", async () => {
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "sunlit reading nook",
              uploadedImageUrl: "",
              title: "",
              altText: "",
              detectedTags: [],
            },
          ],
        },
      },
    ] as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      draft: { headline: "Cozy Nook Ideas" },
    } as never);
    mock.wordpress.uploadMedia.mockResolvedValue({
      mediaId: 802,
      sourceUrl: "https://wp.example.com/uploaded2.jpg",
    });
    mock.anthropic.analyzeImage.mockRejectedValue(new Error("vision timeout"));
    mock.approvals.updatePayload.mockResolvedValue({} as never);

    const { payload, headers } = multipartBody("nook.jpg", "image/jpeg", JPEG_BYTES);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/upload`,
      payload,
      headers,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slot: ImagesApprovalPayload["slots"][number] };
    expect(body.slot.uploadedImageUrl).toBe("https://wp.example.com/uploaded2.jpg");
    expect(body.slot.title).toBe("");
    expect(body.slot.altText).toBe("");
  });

  it("400s when no multipart file is present", async () => {
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: { slots: [{ slotPosition: 0, promptHint: "x", uploadedImageUrl: "", title: "", altText: "", detectedTags: [] }] },
      },
    ] as never);

    const boundary = "----empty-" + Date.now();
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/upload`,
      payload: Buffer.from(`--${boundary}--\r\n`, "utf8"),
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /workflows/:id/images/:slotPosition/reanalyze", () => {
  const runId = "00000000-0000-4000-8000-000000000c00";
  const draftId = "00000000-0000-4000-8000-000000000c01";
  const approvalId = "00000000-0000-4000-8000-000000000c02";

  it("re-runs vision on an existing uploaded image, optionally with instructions", async () => {
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "sunlit reading nook",
              uploadedImageUrl: "https://wp.example.com/u.jpg",
              title: "old title",
              altText: "old alt",
              detectedTags: ["old tag"],
            },
          ],
        },
      },
    ] as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      draft: { headline: "Cozy Nook Ideas" },
    } as never);
    mock.anthropic.analyzeImage.mockResolvedValue({
      title: "Punchier Morning Nook",
      altText: "punchier alt",
      detectedTags: ["linen"],
      confidence: "high",
    });
    mock.approvals.updatePayload.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/reanalyze`,
      payload: { instructions: "make it punchier" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slot: ImagesApprovalPayload["slots"][number] };
    expect(body.slot.title).toBe("Punchier Morning Nook");
    expect(mock.wordpress.uploadMedia).not.toHaveBeenCalled();
    expect(mock.anthropic.analyzeImage).toHaveBeenCalledTimes(1);
    expect(mock.anthropic.analyzeImage.mock.calls[0]![0]).toMatchObject({
      imageUrl: "https://wp.example.com/u.jpg",
      instructions: "make it punchier",
    });
  });

  it("400s when slot has no upload yet", async () => {
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "x",
              uploadedImageUrl: "",
              title: "",
              altText: "",
              detectedTags: [],
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/reanalyze`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("slot_has_no_upload");
  });
});

describe("POST /workflows/:id/images/decide", () => {
  const runId = "00000000-0000-4000-8000-000000000d00";
  const draftId = "00000000-0000-4000-8000-000000000d01";
  const approvalId = "00000000-0000-4000-8000-000000000d02";

  it("maps uploads to chosenImages with title + alt + tags, advances to affiliates", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({ id: draftId } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "a",
              uploadedImageUrl: "https://wp.example.com/a.jpg",
              title: "title a",
              altText: "alt a",
              detectedTags: ["linen", "morning"],
            },
            {
              slotPosition: 1,
              promptHint: "b",
              uploadedImageUrl: "https://wp.example.com/b.jpg",
              title: "title b",
              altText: "alt b",
              detectedTags: ["wool"],
            },
          ],
        },
      },
    ] as never);
    mock.approvals.decide.mockResolvedValue({} as never);
    mock.workflow.updateBlogDraftImages.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/decide`,
      payload: {
        slots: [
          { slotPosition: 0, titleOverride: "edited title a", altTextOverride: "edited alt a" },
          { slotPosition: 1 },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const [, chosen] = mock.workflow.updateBlogDraftImages.mock.calls[0]!;
    expect(chosen).toEqual([
      {
        slotPosition: 0,
        imageUrl: "https://wp.example.com/a.jpg",
        prompt: "a",
        title: "edited title a",
        altText: "edited alt a",
        detectedTags: ["linen", "morning"],
      },
      {
        slotPosition: 1,
        imageUrl: "https://wp.example.com/b.jpg",
        prompt: "b",
        title: "title b",
        altText: "alt b",
        detectedTags: ["wool"],
      },
    ]);
    expect(mock.workflow.update).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({ currentStep: "awaiting_affiliates_approval" }),
    );
  });

  it("400s when any slot has no upload", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({ id: draftId } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              promptHint: "a",
              uploadedImageUrl: "https://wp.example.com/a.jpg",
              title: "t",
              altText: "",
              detectedTags: [],
            },
            {
              slotPosition: 1,
              promptHint: "b",
              uploadedImageUrl: "",
              title: "",
              altText: "",
              detectedTags: [],
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/decide`,
      payload: { slots: [{ slotPosition: 0 }, { slotPosition: 1 }] },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe("image_not_uploaded");
    expect(mock.workflow.updateBlogDraftImages).not.toHaveBeenCalled();
  });
});
