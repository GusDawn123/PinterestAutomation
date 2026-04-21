import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { pinAnalytics, recommendedSlots } from "../db/schema.js";
import type { RecommendedSlotRow } from "../db/schema.js";

export interface SlotScoreInput {
  boardId: string;
  observedAt: Date;
  impressions: number;
  saves: number;
  outboundClicks: number;
  closeups: number;
}

export interface ComputedSlot {
  boardId: string;
  dayOfWeek: number;
  hour: number;
  score: number;
  sampleSize: number;
}

/**
 * Scoring: saves weigh 3x, outbound clicks 2x, impressions 1x (normalized per 1000).
 * Returns the top N slots per board.
 */
export function computeSlots(samples: SlotScoreInput[], topN = 5): ComputedSlot[] {
  const buckets = new Map<string, { score: number; count: number; boardId: string; dow: number; hour: number }>();

  for (const s of samples) {
    const d = s.observedAt;
    const dow = d.getUTCDay();
    const hour = d.getUTCHours();
    const key = `${s.boardId}|${dow}|${hour}`;
    const entry = buckets.get(key) ?? { score: 0, count: 0, boardId: s.boardId, dow, hour };
    const localScore = s.saves * 3 + s.outboundClicks * 2 + s.impressions / 1000;
    entry.score += localScore;
    entry.count += 1;
    buckets.set(key, entry);
  }

  const perBoard = new Map<string, ComputedSlot[]>();
  for (const entry of buckets.values()) {
    const list = perBoard.get(entry.boardId) ?? [];
    list.push({
      boardId: entry.boardId,
      dayOfWeek: entry.dow,
      hour: entry.hour,
      score: entry.count ? entry.score / entry.count : 0,
      sampleSize: entry.count,
    });
    perBoard.set(entry.boardId, list);
  }

  const out: ComputedSlot[] = [];
  for (const list of perBoard.values()) {
    list.sort((a, b) => b.score - a.score);
    out.push(...list.slice(0, topN));
  }
  return out;
}

export class RecommenderService {
  constructor(private readonly db: Database) {}

  async recompute(topN = 5): Promise<ComputedSlot[]> {
    const rows = await this.db
      .select({
        boardId: pinAnalytics.boardId,
        observedAt: pinAnalytics.observedAt,
        impressions: pinAnalytics.impressions,
        saves: pinAnalytics.saves,
        outboundClicks: pinAnalytics.outboundClicks,
        closeups: pinAnalytics.closeups,
      })
      .from(pinAnalytics);

    const slots = computeSlots(rows, topN);

    await this.db
      .update(recommendedSlots)
      .set({ active: false })
      .where(eq(recommendedSlots.active, true));

    for (const s of slots) {
      await this.db
        .insert(recommendedSlots)
        .values({
          boardId: s.boardId,
          dayOfWeek: s.dayOfWeek,
          hour: s.hour,
          score: s.score,
          sampleSize: s.sampleSize,
          active: true,
          computedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [recommendedSlots.boardId, recommendedSlots.dayOfWeek, recommendedSlots.hour],
          set: {
            score: s.score,
            sampleSize: s.sampleSize,
            active: true,
            computedAt: new Date(),
          },
        });
    }

    return slots;
  }

  async listForBoard(boardId: string, limit = 10): Promise<RecommendedSlotRow[]> {
    return this.db
      .select()
      .from(recommendedSlots)
      .where(and(eq(recommendedSlots.boardId, boardId), eq(recommendedSlots.active, true)))
      .orderBy(desc(recommendedSlots.score))
      .limit(limit);
  }

  async nextSlotFor(boardId: string, from: Date = new Date()): Promise<Date | null> {
    const top = await this.listForBoard(boardId, 20);
    if (top.length === 0) return null;

    const base = new Date(Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      from.getUTCHours(),
      0,
      0,
      0,
    ));

    let best: { when: Date; score: number } | null = null;
    for (let addDays = 0; addDays < 7; addDays++) {
      for (const slot of top) {
        const when = new Date(base);
        when.setUTCDate(when.getUTCDate() + addDays);
        const dow = when.getUTCDay();
        if (dow !== slot.dayOfWeek) continue;
        when.setUTCHours(slot.hour, 0, 0, 0);
        if (when <= from) continue;
        if (!best || slot.score > best.score) best = { when, score: slot.score };
      }
    }
    return best?.when ?? null;
  }
}
