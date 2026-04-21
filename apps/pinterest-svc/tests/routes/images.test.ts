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
  mock.anthropic.generateAltText.mockReset();
  mock.exif.stripBuffer.mockReset();
  mock.exif.stripBuffer.mockImplementation(async (buf: Buffer) => buf);
  mock.ideogram.generate.mockReset();
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

describe("POST /workflows/:id/images/start", () => {
  const runId = "00000000-0000-4000-8000-000000000a00";
  const draftId = "00000000-0000-4000-8000-000000000a01";
  const draftApprovalId = "00000000-0000-4000-8000-000000000a02";
  const newApprovalId = "00000000-0000-4000-8000-000000000a03";

  it("calls Ideogram per slot, uploads to WP, creates images approval with generated URLs", async () => {
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
    mock.ideogram.generate.mockResolvedValue({
      imageUrl: "https://ideogram.ai/temp/img.jpg",
      seed: 12345,
    });
    mock.wordpress.uploadMedia.mockResolvedValue({
      mediaId: 701,
      sourceUrl: "https://wp.example.com/slot.jpg",
    });
    mock.anthropic.generateAltText.mockResolvedValue({
      altText: "A sunlit nook with plants",
      confidence: "high",
    });
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
      generatedImageUrl: "https://wp.example.com/slot.jpg",
      ideogramSeed: 12345,
    });
    expect(mock.ideogram.generate).toHaveBeenCalledTimes(2);
    expect(mock.wordpress.uploadMedia).toHaveBeenCalledTimes(2);
    expect(mock.approvals.decide).toHaveBeenCalledWith({
      approvalId: draftApprovalId,
      status: "approved",
    });
  });

  it("returns existing pending images approval idempotently without re-generating", async () => {
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
              generatedImageUrl: "https://wp.example.com/existing.jpg",
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
    expect(mock.ideogram.generate).not.toHaveBeenCalled();
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

  it("stores empty generatedImageUrl and continues when Ideogram fails for a slot", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy",
      draft: { ...DRAFT_WITH_SLOTS, imageSlots: [{ position: 0, promptHint: "nook" }] },
    } as never);
    mock.approvals.listByRun.mockResolvedValue([] as never);
    mock.ideogram.generate.mockRejectedValue(new Error("Ideogram timeout"));
    mock.approvals.create.mockResolvedValue({ id: newApprovalId } as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/start`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slots: ImagesApprovalPayload["slots"] };
    expect(body.slots[0]!.generatedImageUrl).toBe("");
  });
});

describe("POST /workflows/:id/images/:slotPosition/regenerate", () => {
  const runId = "00000000-0000-4000-8000-000000000b00";
  const draftId = "00000000-0000-4000-8000-000000000b01";
  const approvalId = "00000000-0000-4000-8000-000000000b02";

  it("regenerates a slot via Ideogram and updates the approval payload", async () => {
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
              generatedImageUrl: "https://wp.example.com/old.jpg",
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
    mock.ideogram.generate.mockResolvedValue({
      imageUrl: "https://ideogram.ai/temp/new.jpg",
      seed: 99999,
    });
    mock.wordpress.uploadMedia.mockResolvedValue({
      mediaId: 702,
      sourceUrl: "https://wp.example.com/new.jpg",
    });
    mock.anthropic.generateAltText.mockResolvedValue({
      altText: "Fresh sunlit nook",
      confidence: "high",
    });
    mock.approvals.updatePayload.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/regenerate`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slot: ImagesApprovalPayload["slots"][number] };
    expect(body.slot.generatedImageUrl).toBe("https://wp.example.com/new.jpg");
    expect(body.slot.ideogramSeed).toBe(99999);
    expect(mock.ideogram.generate).toHaveBeenCalledTimes(1);
    expect(mock.approvals.updatePayload).toHaveBeenCalledTimes(1);
  });

  it("404s when no pending images approval exists", async () => {
    mock.approvals.listByRun.mockResolvedValue([] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/regenerate`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /workflows/:id/images/decide", () => {
  const runId = "00000000-0000-4000-8000-000000000c00";
  const draftId = "00000000-0000-4000-8000-000000000c01";
  const approvalId = "00000000-0000-4000-8000-000000000c02";

  it("maps generated URLs to chosenImages and advances to affiliates step", async () => {
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
              generatedImageUrl: "https://wp.example.com/a.jpg",
              altTextSuggestion: "alt a",
            },
            {
              slotPosition: 1,
              promptHint: "b",
              generatedImageUrl: "https://wp.example.com/b.jpg",
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
          { slotPosition: 0, altTextOverride: "edited alt a" },
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
        altText: "edited alt a",
      },
      {
        slotPosition: 1,
        imageUrl: "https://wp.example.com/b.jpg",
        prompt: "b",
      },
    ]);
    expect(mock.workflow.update).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({ currentStep: "awaiting_affiliates_approval" }),
    );
  });

  it("400s when any slot has empty generatedImageUrl", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({ id: draftId } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "images",
        status: "pending",
        payload: {
          slots: [
            { slotPosition: 0, promptHint: "a", generatedImageUrl: "https://wp.example.com/a.jpg" },
            { slotPosition: 1, promptHint: "b", generatedImageUrl: "" },
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
    expect((res.json() as { error: string }).error).toBe("image_not_generated");
    expect(mock.workflow.updateBlogDraftImages).not.toHaveBeenCalled();
  });
});
