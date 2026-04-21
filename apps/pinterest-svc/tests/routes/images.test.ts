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
});

afterAll(async () => {
  await app.close();
});

const DRAFT_WITH_SLOTS: BlogDraft = {
  headline: "Cozy",
  urlSlug: "cozy",
  bodyMarkdown: "body",
  metaDescription: "m",
  socialDescription: "s",
  category: "Home",
  tags: ["cozy"],
  imageSlots: [
    { position: 0, promptHint: "sunlit reading nook" },
    { position: 1, promptHint: "warm kitchen" },
  ],
};

function buildMultipart(
  filename: string,
  contentType: string,
  fileData: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----pa-test-boundary-" + Math.random().toString(16).slice(2);
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8",
  );
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const payload = Buffer.concat([preamble, fileData, closing]);
  return {
    payload,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(payload.length),
    },
  };
}

describe("POST /workflows/:id/images/start", () => {
  const runId = "00000000-0000-4000-8000-000000000a00";
  const draftId = "00000000-0000-4000-8000-000000000a01";
  const draftApprovalId = "00000000-0000-4000-8000-000000000a02";
  const newApprovalId = "00000000-0000-4000-8000-000000000a03";

  it("resolves pending draft approval and creates images approval with empty uploads", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
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
    const body = res.json() as {
      slots: ImagesApprovalPayload["slots"];
      approvalId: string;
    };
    expect(body.slots).toHaveLength(2);
    expect(body.approvalId).toBe(newApprovalId);
    expect(body.slots[0]).toMatchObject({
      slotPosition: 0,
      promptHint: "sunlit reading nook",
      uploadedImageUrl: "",
      needsManualUpload: true,
    });

    expect(mock.approvals.decide).toHaveBeenCalledWith({
      approvalId: draftApprovalId,
      status: "approved",
    });
    const approvalArg = mock.approvals.create.mock.calls[0]![0] as {
      kind: string;
      payload: ImagesApprovalPayload;
    };
    expect(approvalArg.kind).toBe("images");
    expect(approvalArg.payload.slots).toHaveLength(2);
  });

  it("returns existing pending images approval idempotently", async () => {
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
              promptHint: "x",
              uploadedImageUrl: "",
              needsManualUpload: true,
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

  it("strips EXIF, uploads to WP, patches slot with URL and alt text", async () => {
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
              needsManualUpload: true,
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
      mediaId: 701,
      sourceUrl: "https://wp.example.com/slot-0.jpg",
    });
    mock.anthropic.generateAltText.mockResolvedValue({
      altText: "A sunlit nook with plants",
      confidence: "high",
    });
    mock.approvals.updatePayload.mockResolvedValue({} as never);

    const fileData = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { payload, headers } = buildMultipart("nook.jpg", "image/jpeg", fileData);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/upload`,
      payload,
      headers,
    });
    expect(res.statusCode).toBe(200);

    expect(mock.exif.stripBuffer).toHaveBeenCalledTimes(1);
    expect(mock.wordpress.uploadMedia).toHaveBeenCalledTimes(1);
    const [, updated] = mock.approvals.updatePayload.mock.calls[0]!;
    const slot = (updated as ImagesApprovalPayload).slots[0]!;
    expect(slot.uploadedImageUrl).toBe("https://wp.example.com/slot-0.jpg");
    expect(slot.needsManualUpload).toBe(false);
    expect(slot.altTextSuggestion).toBe("A sunlit nook with plants");
  });

  it("404s when no pending images approval exists", async () => {
    mock.approvals.listByRun.mockResolvedValue([] as never);
    const fileData = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { payload, headers } = buildMultipart("x.jpg", "image/jpeg", fileData);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/0/upload`,
      payload,
      headers,
    });
    expect(res.statusCode).toBe(404);
  });

  it("400s on unknown slot position", async () => {
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
              needsManualUpload: true,
            },
          ],
        },
      },
    ] as never);
    const fileData = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const { payload, headers } = buildMultipart("x.jpg", "image/jpeg", fileData);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/9/upload`,
      payload,
      headers,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST /workflows/:id/images/decide", () => {
  const runId = "00000000-0000-4000-8000-000000000c00";
  const draftId = "00000000-0000-4000-8000-000000000c01";
  const approvalId = "00000000-0000-4000-8000-000000000c02";

  it("maps uploaded URLs to chosenImages and advances to affiliates step", async () => {
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
              needsManualUpload: false,
              altTextSuggestion: "alt a",
            },
            {
              slotPosition: 1,
              promptHint: "b",
              uploadedImageUrl: "https://wp.example.com/b.jpg",
              needsManualUpload: false,
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

  it("400s with image_not_uploaded when any slot has empty uploadedImageUrl", async () => {
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
              needsManualUpload: false,
            },
            {
              slotPosition: 1,
              promptHint: "b",
              uploadedImageUrl: "",
              needsManualUpload: true,
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/images/decide`,
      payload: {
        slots: [
          { slotPosition: 0 },
          { slotPosition: 1 },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string };
    expect(body.error).toBe("image_not_uploaded");
    expect(mock.workflow.updateBlogDraftImages).not.toHaveBeenCalled();
  });
});
