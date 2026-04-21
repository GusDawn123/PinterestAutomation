import { describe, it, expect } from "vitest";
import { scoreKeywords, type TrendingKeyword } from "../src/scoring.js";

describe("scoreKeywords", () => {
  it("ranks keywords by search_volume * trend_score / competition", () => {
    const input: TrendingKeyword[] = [
      { keyword: "low-vol", searchVolume: 500, trendScore: 1.0, competition: 0.5 },
      { keyword: "high-vol-low-trend", searchVolume: 10000, trendScore: 0.2, competition: 0.5 },
      { keyword: "balanced", searchVolume: 3000, trendScore: 1.5, competition: 0.3 },
    ];

    const ranked = scoreKeywords(input);

    expect(ranked[0]?.keyword).toBe("balanced");
    expect(ranked[ranked.length - 1]?.keyword).toBe("low-vol");
  });

  it("handles zero-competition without dividing by zero", () => {
    const input: TrendingKeyword[] = [
      { keyword: "rare", searchVolume: 100, trendScore: 1, competition: 0 },
    ];
    const ranked = scoreKeywords(input);
    expect(Number.isFinite(ranked[0]?.score)).toBe(true);
  });
});
