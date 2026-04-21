import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const workflowKindEnum = pgEnum("workflow_kind", ["blog", "pins"]);
export const workflowStatusEnum = pgEnum("workflow_status", [
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);
export const approvalKindEnum = pgEnum("approval_kind", [
  "keyword",
  "draft",
  "images",
  "pins",
  "publish",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "changes_requested",
]);

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: workflowKindEnum("kind").notNull(),
    status: workflowStatusEnum("status").notNull().default("running"),
    currentStep: text("current_step").notNull(),
    context: jsonb("context").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index("workflow_runs_status_idx").on(t.status),
    createdIdx: index("workflow_runs_created_at_idx").on(t.createdAt),
  }),
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    kind: approvalKindEnum("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    decisionData: jsonb("decision_data"),
    notes: text("notes"),
    decidedBy: text("decided_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => ({
    runIdx: index("approvals_workflow_run_id_idx").on(t.workflowRunId),
    statusIdx: index("approvals_status_idx").on(t.status),
  }),
);

export const blogDrafts = pgTable(
  "blog_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    brief: text("brief").notNull(),
    draft: jsonb("draft").notNull(),
    wordpressPostId: text("wordpress_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("blog_drafts_workflow_run_id_idx").on(t.workflowRunId),
  }),
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowRunInsert = typeof workflowRuns.$inferInsert;
export type ApprovalRow = typeof approvals.$inferSelect;
export type ApprovalInsert = typeof approvals.$inferInsert;
export type BlogDraftRow = typeof blogDrafts.$inferSelect;
export type BlogDraftInsert = typeof blogDrafts.$inferInsert;
