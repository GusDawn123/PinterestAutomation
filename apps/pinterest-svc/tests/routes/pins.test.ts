import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.workflow.get.mockReset();
  mock.workflow.create.mockReset();
  mock.workflow.update.mockReset();
  mock.workflow.getBlogDraftByRun.mockReset();
  mock.approvals.create.mockReset();
  mock.approvals.listByRun.mockReset();
  mock.approvals.decide.mockReset();
  mock.anthropic.generatePinCopy.mockReset();
  mock.approvals.updatePayload.mockReset();
  mock.pinsQueue.enqueue.mockReset();
  mock.wordpress.uploadMedia.mockReset();
  mock.pinsQueue.listUpcoming.mockReset();
  mock.recommender.nextSlotFor.mockReset();
});

afterAll(async () => {
  await app.close();
});

const runId = "00000000-0000-4000-8000-000000000aaa";
const pinsRunId = "00000000-0000-4000-8000-000000000bbb";
const approvalId = "00000000-0000-4000-8000-000000000ccc";
const draftId = "00000000-0000-4000-8000-000000000ddd";

describe("POST /workflows/:id/pins/start", () => {
  it("generates pin copy per chosen image and creates pins approval with empty composed images", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      wordpressPostId: "1234",
      draft: { headline: "Cozy nook ideas" },
      chosenImages: [
        {
          slotPosition: 0,
          imageUrl: "https://cdn.example.com/a.png",
          prompt: "nook",
          altText: "a nook",
        },
        {
          slotPosition: 1,
          imageUrl: "https://cdn.example.com/b.png",
          prompt: "plants",
        },
      ],
    } as never);
    mock.workflow.create.mockResolvedValue({ id: pinsRunId } as never);
    mock.workflow.update.mockResolvedValue({} as never);
    mock.anthropic.generatePinCopy.mockResolvedValue({
      imageUrl: "x",
      variations: [
        { title: "Cozy title", description: "Cozy description" },
        { title: "Alt title", description: "Alt description" },
      ],
    } as never);
    mock.approvals.create.mockResolvedValue({ id: approvalId } as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/start`,
      payload: { boardId: "board-1", canvaTemplateId: "tpl-xyz", autoPost: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { workflowRunId: string; approvalId: string; pinCount: number };
    expect(body.workflowRunId).toBe(pinsRunId);
    expect(body.approvalId).toBe(approvalId);
    expect(body.pinCount).toBe(2);

    expect(mock.anthropic.generatePinCopy).toHaveBeenCalledTimes(2);

    const approvalPayload = mock.approvals.create.mock.calls[0]![0] as {
      kind: string;
      payload: { pins: Array<{ composedImageUrl: string; needsManualUpload?: boolean; sourceImageUrl: string }> };
    };
    expect(approvalPayload.kind).toBe("pins");
    expect(approvalPayload.payload.pins).toHaveLength(2);
    expect(approvalPayload.payload.pins[0]!.composedImageUrl).toBe("");
    expect(approvalPayload.payload.pins[0]!.needsManualUpload).toBe(true);
    expect(approvalPayload.payload.pins[0]!.sourceImageUrl).toBe("https://cdn.example.com/a.png");
    expect(approvalPayload.payload.pins[1]!.composedImageUrl).toBe("");
    expect(approvalPayload.payload.pins[1]!.needsManualUpload).toBe(true);
  });

  it("400s when no chosen images", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "x",
      draft: { headline: "x" },
      chosenImages: [],
    } as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/start`,
      payload: { boardId: "b", canvaTemplateId: "t", autoPost: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s when workflow missing", async () => {
    mock.workflow.get.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/start`,
      payload: { boardId: "b", canvaTemplateId: "t", autoPost: false },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /workflows/:id/pins/decide", () => {
  it("enqueues each approved pin using recommender slot when autoPost=true", async () => {
    const scheduledAt = new Date("2026-04-21T14:00:00Z");
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "pins" } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "pins",
        status: "pending",
        payload: {
          blogPostId: 1234,
          blogUrl: "https://blog.example.com/x",
          boardId: "board-1",
          pins: [
            {
              pinIndex: 0,
              sourceImageUrl: "https://cdn.example.com/a.png",
              composedImageUrl: "https://cdn.canva.com/1.png",
              variations: [
                { title: "T1", description: "D1" },
                { title: "T2", description: "D2" },
              ],
            },
          ],
        },
      },
    ] as never);
    mock.recommender.nextSlotFor.mockResolvedValue(scheduledAt);
    mock.pinsQueue.enqueue.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000eee",
      scheduledAt,
    } as never);
    mock.approvals.decide.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/decide`,
      payload: {
        approvedPins: [{ pinIndex: 0, chosenVariationIndex: 1 }],
        autoPost: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { queued: string[] };
    expect(body.queued).toHaveLength(1);

    expect(mock.recommender.nextSlotFor).toHaveBeenCalledWith("board-1", expect.any(Date));
    const enqueueArg = mock.pinsQueue.enqueue.mock.calls[0]![0] as {
      title: string;
      description: string;
      imageUrl: string;
      boardId: string;
      scheduledAt: Date;
    };
    expect(enqueueArg.title).toBe("T2");
    expect(enqueueArg.description).toBe("D2");
    expect(enqueueArg.imageUrl).toBe("https://cdn.canva.com/1.png");
    expect(enqueueArg.boardId).toBe("board-1");
    expect(enqueueArg.scheduledAt.toISOString()).toBe(scheduledAt.toISOString());

    expect(mock.approvals.decide).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId, status: "approved" }),
    );
    expect(mock.workflow.update).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({ status: "completed", currentStep: "scheduled" }),
    );
  });

  it("uses edited variation when provided", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "pins" } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "pins",
        status: "pending",
        payload: {
          blogUrl: "https://blog.example.com/x",
          boardId: "board-1",
          pins: [
            {
              pinIndex: 0,
              sourceImageUrl: "s",
              composedImageUrl: "c",
              variations: [{ title: "T", description: "D" }],
            },
          ],
        },
      },
    ] as never);
    mock.pinsQueue.enqueue.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000fff",
      scheduledAt: new Date(),
    } as never);
    mock.approvals.decide.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/decide`,
      payload: {
        approvedPins: [
          {
            pinIndex: 0,
            chosenVariationIndex: 0,
            edited: { title: "Custom title", description: "Custom description" },
          },
        ],
        autoPost: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const enqueueArg = mock.pinsQueue.enqueue.mock.calls[0]![0] as {
      title: string;
      description: string;
    };
    expect(enqueueArg.title).toBe("Custom title");
    expect(enqueueArg.description).toBe("Custom description");
    // autoPost: false — recommender should not be called
    expect(mock.recommender.nextSlotFor).not.toHaveBeenCalled();
  });

  it("400s pin_not_uploaded when any approved pin has empty composedImageUrl", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "pins" } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "pins",
        status: "pending",
        payload: {
          blogUrl: "https://blog.example.com/x",
          boardId: "board-1",
          pins: [
            {
              pinIndex: 0,
              sourceImageUrl: "https://cdn.example.com/a.png",
              composedImageUrl: "",
              needsManualUpload: true,
              variations: [{ title: "T", description: "D" }],
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/pins/decide`,
      payload: {
        approvedPins: [{ pinIndex: 0, chosenVariationIndex: 0 }],
        autoPost: false,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: string; pinIndex: number };
    expect(body.error).toBe("pin_not_uploaded");
    expect(body.pinIndex).toBe(0);
    expect(mock.pinsQueue.enqueue).not.toHaveBeenCalled();
    expect(mock.approvals.decide).not.toHaveBeenCalled();
  });
});

describe("POST /pins/schedule", () => {
  it("enqueues an ad-hoc pin", async () => {
    const id = "00000000-0000-4000-8000-000000000111";
    const scheduledAt = new Date("2026-05-01T10:00:00Z");
    mock.pinsQueue.enqueue.mockResolvedValue({ id, scheduledAt } as never);

    const res = await app.inject({
      method: "POST",
      url: "/pins/schedule",
      payload: {
        imageUrl: "https://cdn.example.com/p.png",
        title: "t",
        description: "d",
        boardId: "b",
        linkBackUrl: "https://blog.example.com/p",
        scheduledAt: scheduledAt.toISOString(),
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { id: string };
    expect(body.id).toBe(id);
    expect(mock.pinsQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://cdn.example.com/p.png",
        boardId: "b",
        scheduledAt: expect.any(Date),
      }),
    );
  });
});

describe("GET /pins/queue", () => {
  it("returns upcoming pins", async () => {
    mock.pinsQueue.listUpcoming.mockResolvedValue([
      { id: "1", title: "Pin one" },
      { id: "2", title: "Pin two" },
    ] as never);

    const res = await app.inject({ method: "GET", url: "/pins/queue" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(2);
  });
});
