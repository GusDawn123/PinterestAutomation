import { describe, it, expect } from "vitest";
import { computeSlots, type SlotScoreInput } from "../../src/services/recommender.js";

function sample(
  boardId: string,
  iso: string,
  overrides: Partial<Omit<SlotScoreInput, "boardId" | "observedAt">> = {},
): SlotScoreInput {
  return {
    boardId,
    observedAt: new Date(iso),
    impressions: overrides.impressions ?? 0,
    saves: overrides.saves ?? 0,
    outboundClicks: overrides.outboundClicks ?? 0,
    closeups: overrides.closeups ?? 0,
  };
}

describe("computeSlots", () => {
  it("scores saves 3x, outboundClicks 2x, impressions ÷ 1000", () => {
    const slots = computeSlots([
      sample("board-a", "2026-04-20T14:00:00Z", { saves: 10, outboundClicks: 5, impressions: 1000 }),
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.score).toBeCloseTo(10 * 3 + 5 * 2 + 1, 5);
    expect(slots[0]!.sampleSize).toBe(1);
  });

  it("buckets by boardId + day-of-week + hour and averages", () => {
    const slots = computeSlots([
      // Monday 14:00 — two samples into the same bucket
      sample("board-a", "2026-04-20T14:10:00Z", { saves: 10 }),
      sample("board-a", "2026-04-27T14:45:00Z", { saves: 20 }),
      // Different hour — separate bucket
      sample("board-a", "2026-04-20T15:00:00Z", { saves: 5 }),
    ]);

    const mondayTwoPm = slots.find((s) => s.dayOfWeek === 1 && s.hour === 14);
    expect(mondayTwoPm?.sampleSize).toBe(2);
    expect(mondayTwoPm?.score).toBeCloseTo((10 * 3 + 20 * 3) / 2, 5);

    const mondayThreePm = slots.find((s) => s.dayOfWeek === 1 && s.hour === 15);
    expect(mondayThreePm?.sampleSize).toBe(1);
    expect(mondayThreePm?.score).toBeCloseTo(15, 5);
  });

  it("keeps only topN per board, sorted by score descending", () => {
    const inputs: SlotScoreInput[] = [];
    // 6 distinct hours on board-a with decreasing scores
    for (let h = 0; h < 6; h++) {
      inputs.push(sample("board-a", `2026-04-20T${String(h).padStart(2, "0")}:00:00Z`, { saves: 10 - h }));
    }
    const slots = computeSlots(inputs, 3);
    expect(slots).toHaveLength(3);
    expect(slots[0]!.score).toBeGreaterThan(slots[1]!.score);
    expect(slots[1]!.score).toBeGreaterThan(slots[2]!.score);
    expect(slots[0]!.hour).toBe(0);
  });

  it("separates slots per board independently", () => {
    const slots = computeSlots([
      sample("board-a", "2026-04-20T14:00:00Z", { saves: 10 }),
      sample("board-b", "2026-04-20T14:00:00Z", { saves: 20 }),
    ]);
    expect(slots).toHaveLength(2);
    const aSlots = slots.filter((s) => s.boardId === "board-a");
    const bSlots = slots.filter((s) => s.boardId === "board-b");
    expect(aSlots).toHaveLength(1);
    expect(bSlots).toHaveLength(1);
    expect(bSlots[0]!.score).toBeGreaterThan(aSlots[0]!.score);
  });

  it("returns empty when no samples", () => {
    expect(computeSlots([])).toEqual([]);
  });
});
