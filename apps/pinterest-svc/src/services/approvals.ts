import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { approvals } from "../db/schema.js";
import type { ApprovalKind, ApprovalStatus } from "@pa/shared-types";

export interface CreateApprovalInput {
  workflowRunId: string;
  kind: ApprovalKind;
  payload: unknown;
}

export interface DecideApprovalInput {
  approvalId: string;
  status: Exclude<ApprovalStatus, "pending">;
  decisionData?: unknown;
  notes?: string;
  decidedBy?: string;
}

export class ApprovalService {
  constructor(private readonly db: Database) {}

  async create(input: CreateApprovalInput) {
    const [row] = await this.db
      .insert(approvals)
      .values({
        workflowRunId: input.workflowRunId,
        kind: input.kind,
        payload: input.payload as object,
      })
      .returning();
    if (!row) throw new Error("Failed to insert approval");
    return row;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(approvals).where(eq(approvals.id, id));
    return row ?? null;
  }

  async listPending() {
    return this.db
      .select()
      .from(approvals)
      .where(eq(approvals.status, "pending"))
      .orderBy(desc(approvals.createdAt));
  }

  async listByRun(workflowRunId: string) {
    return this.db
      .select()
      .from(approvals)
      .where(eq(approvals.workflowRunId, workflowRunId))
      .orderBy(desc(approvals.createdAt));
  }

  async updatePayload(approvalId: string, payload: unknown) {
    const [row] = await this.db
      .update(approvals)
      .set({ payload: payload as object })
      .where(and(eq(approvals.id, approvalId), eq(approvals.status, "pending")))
      .returning();
    if (!row) throw new Error(`Approval ${approvalId} is not pending or does not exist`);
    return row;
  }

  async decide(input: DecideApprovalInput) {
    const [row] = await this.db
      .update(approvals)
      .set({
        status: input.status,
        decisionData: input.decisionData as object | null ?? null,
        notes: input.notes ?? null,
        decidedBy: input.decidedBy ?? null,
        decidedAt: new Date(),
      })
      .where(and(eq(approvals.id, input.approvalId), eq(approvals.status, "pending")))
      .returning();
    if (!row) {
      throw new Error(`Approval ${input.approvalId} is not pending or does not exist`);
    }
    return row;
  }
}
