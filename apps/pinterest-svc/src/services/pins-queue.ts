import { and, eq, isNull, lte, sql, desc } from "drizzle-orm";
import type { Database } from "../db.js";
import { pinsQueue } from "../db/schema.js";
import type { PinsQueueRow } from "../db/schema.js";

export interface EnqueuePinInput {
  workflowRunId?: string | null;
  blogPostId?: number | null;
  imageUrl: string;
  title: string;
  description: string;
  boardId: string;
  linkBackUrl: string;
  scheduledAt: Date;
}

export class PinsQueueService {
  constructor(private readonly db: Database) {}

  async enqueue(input: EnqueuePinInput): Promise<PinsQueueRow> {
    const [row] = await this.db
      .insert(pinsQueue)
      .values({
        workflowRunId: input.workflowRunId ?? null,
        blogPostId: input.blogPostId ?? null,
        imageUrl: input.imageUrl,
        title: input.title,
        description: input.description,
        boardId: input.boardId,
        linkBackUrl: input.linkBackUrl,
        scheduledAt: input.scheduledAt,
      })
      .returning();
    if (!row) throw new Error("Failed to enqueue pin");
    return row;
  }

  async listDue(now: Date, limit = 25): Promise<PinsQueueRow[]> {
    return this.db
      .select()
      .from(pinsQueue)
      .where(and(isNull(pinsQueue.postedAt), lte(pinsQueue.scheduledAt, now)))
      .orderBy(pinsQueue.scheduledAt)
      .limit(limit);
  }

  async listUpcoming(limit = 100): Promise<PinsQueueRow[]> {
    return this.db
      .select()
      .from(pinsQueue)
      .where(isNull(pinsQueue.postedAt))
      .orderBy(pinsQueue.scheduledAt)
      .limit(limit);
  }

  async listPosted(limit = 100): Promise<PinsQueueRow[]> {
    return this.db
      .select()
      .from(pinsQueue)
      .where(sql`${pinsQueue.postedAt} IS NOT NULL AND ${pinsQueue.pinterestPinId} IS NOT NULL`)
      .orderBy(desc(pinsQueue.postedAt))
      .limit(limit);
  }

  async markPosted(id: string, pinterestPinId: string): Promise<PinsQueueRow> {
    const [row] = await this.db
      .update(pinsQueue)
      .set({
        pinterestPinId,
        postedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(pinsQueue.id, id))
      .returning();
    if (!row) throw new Error(`pin queue row ${id} not found`);
    return row;
  }

  async markAttemptFailed(id: string, error: string): Promise<PinsQueueRow> {
    const [row] = await this.db
      .update(pinsQueue)
      .set({
        attempts: sql`${pinsQueue.attempts} + 1`,
        lastError: error.slice(0, 2000),
        updatedAt: new Date(),
      })
      .where(eq(pinsQueue.id, id))
      .returning();
    if (!row) throw new Error(`pin queue row ${id} not found`);
    return row;
  }

  async reschedule(id: string, scheduledAt: Date): Promise<PinsQueueRow> {
    const [row] = await this.db
      .update(pinsQueue)
      .set({ scheduledAt, updatedAt: new Date() })
      .where(eq(pinsQueue.id, id))
      .returning();
    if (!row) throw new Error(`pin queue row ${id} not found`);
    return row;
  }

  async cancel(id: string): Promise<void> {
    await this.db.delete(pinsQueue).where(eq(pinsQueue.id, id));
  }
}
