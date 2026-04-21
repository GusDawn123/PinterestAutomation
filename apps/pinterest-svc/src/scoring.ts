export interface TrendingKeyword {
  keyword: string;
  searchVolume: number;
  trendScore: number;
  competition: number;
}

export interface ScoredKeyword extends TrendingKeyword {
  score: number;
}

export function scoreKeywords(keywords: readonly TrendingKeyword[]): ScoredKeyword[] {
  return keywords
    .map((k) => ({
      ...k,
      score: (k.searchVolume * k.trendScore) / Math.max(k.competition, 0.01),
    }))
    .sort((a, b) => b.score - a.score);
}
