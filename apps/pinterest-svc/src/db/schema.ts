import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
  index,
  integer,
  real,
  boolean,
  uniqueIndex,
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
  "affiliates",
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
    chosenImages: jsonb("chosen_images"),
    affiliateProducts: jsonb("affiliate_products"),
    wordpressPostId: text("wordpress_post_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    runIdx: index("blog_drafts_workflow_run_id_idx").on(t.workflowRunId),
  }),
);

export const pinsQueue = pgTable(
  "pins_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "set null",
    }),
    blogPostId: integer("blog_post_id"),
    imageUrl: text("image_url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    boardId: text("board_id").notNull(),
    linkBackUrl: text("link_back_url").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    pinterestPinId: text("pinterest_pin_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dueIdx: index("pins_queue_due_idx").on(t.scheduledAt, t.postedAt),
    boardIdx: index("pins_queue_board_idx").on(t.boardId),
    pinIdUnique: uniqueIndex("pins_queue_pinterest_pin_id_uniq").on(t.pinterestPinId),
  }),
);

export const pinAnalytics = pgTable(
  "pin_analytics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pinterestPinId: text("pinterest_pin_id").notNull(),
    boardId: text("board_id").notNull(),
    impressions: integer("impressions").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    outboundClicks: integer("outbound_clicks").notNull().default(0),
    closeups: integer("closeups").notNull().default(0),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pinIdx: index("pin_analytics_pin_idx").on(t.pinterestPinId),
    observedIdx: index("pin_analytics_observed_idx").on(t.observedAt),
    boardIdx: index("pin_analytics_board_idx").on(t.boardId),
  }),
);

export const recommendedSlots = pgTable(
  "recommended_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: text("board_id").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    hour: integer("hour").notNull(),
    score: real("score").notNull(),
    sampleSize: integer("sample_size").notNull().default(0),
    active: boolean("active").notNull().default(true),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boardDayHourUnique: uniqueIndex("recommended_slots_board_day_hour_uniq").on(
      t.boardId,
      t.dayOfWeek,
      t.hour,
    ),
    boardIdx: index("recommended_slots_board_idx").on(t.boardId),
  }),
);

export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowRunInsert = typeof workflowRuns.$inferInsert;
export type ApprovalRow = typeof approvals.$inferSelect;
export type ApprovalInsert = typeof approvals.$inferInsert;
export type BlogDraftRow = typeof blogDrafts.$inferSelect;
export type BlogDraftInsert = typeof blogDrafts.$inferInsert;
export type PinsQueueRow = typeof pinsQueue.$inferSelect;
export type PinsQueueInsert = typeof pinsQueue.$inferInsert;
export type PinAnalyticsRow = typeof pinAnalytics.$inferSelect;
export type PinAnalyticsInsert = typeof pinAnalytics.$inferInsert;
export type RecommendedSlotRow = typeof recommendedSlots.$inferSelect;
export type RecommendedSlotInsert = typeof recommendedSlots.$inferInsert;
