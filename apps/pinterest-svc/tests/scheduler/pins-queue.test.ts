import { describe, it, expect, vi } from "vitest";
import { runPinsQueueOnce } from "../../src/scheduler/pins-queue.js";
import { makeMockCtx } from "../helpers/test-ctx.js";
import type { PinsQueueRow } from "../../src/db/schema.js";

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeRow(overrides: Partial<PinsQueueRow> = {}): PinsQueueRow {
  return {
    id: "q-1",
    workflowRunId: "wr-1",
    blogPostId: 42,
    imageUrl: "https://cdn.example.com/pin.png",
    title: "Cozy nook",
    description: "A cozy corner",
    boardId: "board-1",
    linkBackUrl: "https://blog.example.com/cozy",
    scheduledAt: new Date("2026-04-20T14:00:00Z"),
    postedAt: null,
    pinterestPinId: null,
    attempts: 0,
    lastError: null,
    createdAt: new Date("2026-04-20T12:00:00Z"),
    updatedAt: new Date("2026-04-20T12:00:00Z"),
    ...overrides,
  } as PinsQueueRow;
}

describe("runPinsQueueOnce", () => {
  it("posts due pins and marks them posted", async () => {
    const { ctx, pinsQueue, pinterest } = makeMockCtx();
    pinsQueue.listDue.mockResolvedValue([makeRow(), makeRow({ id: "q-2" })]);
    pinterest.createPin.mockResolvedValueOnce({ pinId: "pin-A" }).mockResolvedValueOnce({ pinId: "pin-B" });
    pinsQueue.markPosted.mockResolvedValue(undefined);

    const res = await runPinsQueueOnce(ctx, log);

    expect(res).toEqual({ posted: 2, failed: 0, skipped: 0 });
    expect(pinterest.createPin).toHaveBeenCalledTimes(2);
    expect(pinsQueue.markPosted).toHaveBeenNthCalledWith(1, "q-1", "pin-A");
    expect(pinsQueue.markPosted).toHaveBeenNthCalledWith(2, "q-2", "pin-B");
  });

  it("records failure and does not mark posted when Pinterest throws", async () => {
    const { ctx, pinsQueue, pinterest, alerter } = makeMockCtx();
    pinsQueue.listDue.mockResolvedValue([makeRow()]);
    pinterest.createPin.mockRejectedValue(new Error("Pinterest 500"));
    pinsQueue.markAttemptFailed.mockResolvedValue(undefined);

    const res = await runPinsQueueOnce(ctx, log);

    expect(res).toEqual({ posted: 0, failed: 1, skipped: 0 });
    expect(pinsQueue.markPosted).not.toHaveBeenCalled();
    expect(pinsQueue.markAttemptFailed).toHaveBeenCalledWith("q-1", "Pinterest 500");
    // attempts 0 → 1: below alert threshold (3) — should NOT alert
    expect(alerter.send).not.toHaveBeenCalled();
  });

  it("alerts Discord when a pin hits 3 attempts and escalates at 5", async () => {
    const { ctx, pinsQueue, pinterest, alerter } = makeMockCtx();
    pinsQueue.listDue.mockResolvedValue([
      makeRow({ id: "q-3", attempts: 2 }),
      makeRow({ id: "q-5", attempts: 4 }),
    ]);
    pinterest.createPin.mockRejectedValue(new Error("auth expired"));
    pinsQueue.markAttemptFailed.mockResolvedValue(undefined);

    await runPinsQueueOnce(ctx, log);

    expect(alerter.send).toHaveBeenCalledTimes(2);
    const first = alerter.send.mock.calls[0]![0];
    const second = alerter.send.mock.calls[1]![0];
    expect(first.severity).toBe("error");
    expect(first.context?.attempts).toBe(3);
    expect(second.severity).toBe("critical");
    expect(second.context?.attempts).toBe(5);
  });

  it("skips rows with attempts >= 5", async () => {
    const { ctx, pinsQueue, pinterest } = makeMockCtx();
    pinsQueue.listDue.mockResolvedValue([makeRow({ attempts: 5 })]);

    const res = await runPinsQueueOnce(ctx, log);

    expect(res).toEqual({ posted: 0, failed: 0, skipped: 1 });
    expect(pinterest.createPin).not.toHaveBeenCalled();
    expect(pinsQueue.markPosted).not.toHaveBeenCalled();
    expect(pinsQueue.markAttemptFailed).not.toHaveBeenCalled();
  });
});
