import { eq } from "drizzle-orm";
import type { Database } from "../db.js";
import { workflowRuns, blogDrafts } from "../db/schema.js";
import type {
  AffiliateProduct,
  BlogDraft,
  ChosenImage,
  WorkflowKind,
  WorkflowStatus,
} from "@pa/shared-types";

export interface BlogDraftAffiliateSlot {
  slotPosition: number;
  products: AffiliateProduct[];
}

export class WorkflowService {
  constructor(private readonly db: Database) {}

  async create(kind: WorkflowKind, currentStep: string, context: object = {}) {
    const [row] = await this.db
      .insert(workflowRuns)
      .values({ kind, currentStep, context })
      .returning();
    if (!row) throw new Error("Failed to insert workflow run");
    return row;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(workflowRuns).where(eq(workflowRuns.id, id));
    return row ?? null;
  }

  async update(
    id: string,
    patch: { status?: WorkflowStatus; currentStep?: string; context?: object; finishedAt?: Date },
  ) {
    const [row] = await this.db
      .update(workflowRuns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(workflowRuns.id, id))
      .returning();
    if (!row) throw new Error(`workflow run ${id} not found`);
    return row;
  }

  async saveBlogDraft(workflowRunId: string, keyword: string, brief: string, draft: BlogDraft) {
    const [row] = await this.db
      .insert(blogDrafts)
      .values({ workflowRunId, keyword, brief, draft })
      .returning();
    if (!row) throw new Error("Failed to insert blog draft");
    return row;
  }

  async updateBlogDraftImages(blogDraftId: string, chosenImages: ChosenImage[]) {
    const [row] = await this.db
      .update(blogDrafts)
      .set({ chosenImages, updatedAt: new Date() })
      .where(eq(blogDrafts.id, blogDraftId))
      .returning();
    if (!row) throw new Error(`blog draft ${blogDraftId} not found`);
    return row;
  }

  async updateBlogDraftAffiliates(
    blogDraftId: string,
    affiliateProducts: BlogDraftAffiliateSlot[],
  ) {
    const [row] = await this.db
      .update(blogDrafts)
      .set({ affiliateProducts, updatedAt: new Date() })
      .where(eq(blogDrafts.id, blogDraftId))
      .returning();
    if (!row) throw new Error(`blog draft ${blogDraftId} not found`);
    return row;
  }

  async updateBlogDraftWpId(blogDraftId: string, wordpressPostId: string) {
    const [row] = await this.db
      .update(blogDrafts)
      .set({ wordpressPostId, updatedAt: new Date() })
      .where(eq(blogDrafts.id, blogDraftId))
      .returning();
    if (!row) throw new Error(`blog draft ${blogDraftId} not found`);
    return row;
  }

  async getBlogDraftByRun(workflowRunId: string) {
    const [row] = await this.db
      .select()
      .from(blogDrafts)
      .where(eq(blogDrafts.workflowRunId, workflowRunId));
    return row ?? null;
  }
}
