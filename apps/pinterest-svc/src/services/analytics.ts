import { desc, eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { pinAnalytics } from "../db/schema.js";
import type { PinAnalyticsRow, PinAnalyticsInsert } from "../db/schema.js";

export class AnalyticsService {
  constructor(private readonly db: Database) {}

  async record(input: {
    pinterestPinId: string;
    boardId: string;
    impressions: number;
    saves: number;
    outboundClicks: number;
    closeups: number;
    observedAt: Date;
  }): Promise<PinAnalyticsRow> {
    const values: PinAnalyticsInsert = {
      pinterestPinId: input.pinterestPinId,
      boardId: input.boardId,
      impressions: input.impressions,
      saves: input.saves,
      outboundClicks: input.outboundClicks,
      closeups: input.closeups,
      observedAt: input.observedAt,
    };
    const [row] = await this.db.insert(pinAnalytics).values(values).returning();
    if (!row) throw new Error("Failed to record analytics");
    return row;
  }

  async latestForPin(pinterestPinId: string): Promise<PinAnalyticsRow | null> {
    const [row] = await this.db
      .select()
      .from(pinAnalytics)
      .where(eq(pinAnalytics.pinterestPinId, pinterestPinId))
      .orderBy(desc(pinAnalytics.observedAt))
      .limit(1);
    return row ?? null;
  }

  async all(limit = 500): Promise<PinAnalyticsRow[]> {
    return this.db
      .select()
      .from(pinAnalytics)
      .orderBy(desc(pinAnalytics.observedAt))
      .limit(limit);
  }
}
