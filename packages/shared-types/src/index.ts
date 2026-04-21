import { z } from "zod";

export const TrendingKeywordSchema = z.object({
  keyword: z.string().min(1),
  searchVolume: z.number().nonnegative(),
  trendScore: z.number(),
  competition: z.number().min(0).max(1),
});
export type TrendingKeyword = z.infer<typeof TrendingKeywordSchema>;

export const ScoredKeywordSchema = TrendingKeywordSchema.extend({
  score: z.number(),
});
export type ScoredKeyword = z.infer<typeof ScoredKeywordSchema>;

export const BlogDraftSchema = z.object({
  headline: z.string().min(1),
  urlSlug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  bodyMarkdown: z.string().min(1),
  metaDescription: z.string().max(160),
  socialDescription: z.string().max(200),
  category: z.string(),
  tags: z.array(z.string()),
  imageSlots: z.array(
    z.object({
      position: z.number().int().nonnegative(),
      promptHint: z.string(),
      altText: z.string().optional(),
    }),
  ),
});
export type BlogDraft = z.infer<typeof BlogDraftSchema>;

export const IdeogramVariantSchema = z.object({
  slotPosition: z.number().int().nonnegative(),
  variantIndex: z.number().int().min(0).max(7),
  imageUrl: z.string().url(),
  prompt: z.string(),
  expiresAt: z.string().datetime().optional(),
});
export type IdeogramVariant = z.infer<typeof IdeogramVariantSchema>;

export const PinSchema = z.object({
  id: z.string().uuid(),
  imageUrl: z.string().url(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  boardId: z.string(),
  linkBackUrl: z.string().url(),
  scheduledAt: z.string().datetime().nullable(),
  postedAt: z.string().datetime().nullable(),
  pinterestPinId: z.string().nullable(),
});
export type Pin = z.infer<typeof PinSchema>;

export const PinAnalyticsSchema = z.object({
  pinterestPinId: z.string(),
  impressions: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
  outboundClicks: z.number().int().nonnegative(),
  closeups: z.number().int().nonnegative(),
  observedAt: z.string().datetime(),
});
export type PinAnalytics = z.infer<typeof PinAnalyticsSchema>;

export const RecommendedSlotSchema = z.object({
  boardId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  score: z.number(),
  sampleSize: z.number().int().nonnegative(),
});
export type RecommendedSlot = z.infer<typeof RecommendedSlotSchema>;

export const WorkflowKind = z.enum(["blog", "pins"]);
export type WorkflowKind = z.infer<typeof WorkflowKind>;

export const WorkflowStatus = z.enum([
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatus>;

export const WorkflowRunSchema = z.object({
  id: z.string().uuid(),
  kind: WorkflowKind,
  status: WorkflowStatus,
  currentStep: z.string(),
  context: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const ApprovalStatus = z.enum(["pending", "approved", "rejected", "changes_requested"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalKind = z.enum(["keyword", "draft", "images", "pins", "publish"]);
export type ApprovalKind = z.infer<typeof ApprovalKind>;

export const KeywordApprovalPayloadSchema = z.object({
  candidates: z.array(ScoredKeywordSchema).min(1).max(20),
});
export type KeywordApprovalPayload = z.infer<typeof KeywordApprovalPayloadSchema>;

export const KeywordApprovalDecisionSchema = z.object({
  chosenKeyword: z.string().min(1),
  brief: z.string().min(1),
});
export type KeywordApprovalDecision = z.infer<typeof KeywordApprovalDecisionSchema>;

export const DraftApprovalPayloadSchema = z.object({
  draft: BlogDraftSchema,
  chosenKeyword: z.string(),
  brief: z.string(),
});
export type DraftApprovalPayload = z.infer<typeof DraftApprovalPayloadSchema>;

export const DraftApprovalDecisionSchema = z.object({
  editedDraft: BlogDraftSchema,
});
export type DraftApprovalDecision = z.infer<typeof DraftApprovalDecisionSchema>;

export const ApprovalDecisionSchema = z.object({
  status: ApprovalStatus,
  data: z.unknown().optional(),
  notes: z.string().max(2000).optional(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  workflowRunId: z.string().uuid(),
  kind: ApprovalKind,
  payload: z.unknown(),
  status: ApprovalStatus,
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  decidedBy: z.string().nullable(),
  notes: z.string().nullable(),
  decisionData: z.unknown().nullable(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const StartBlogWorkflowInputSchema = z.object({
  region: z.string().length(2).default("US"),
});
export type StartBlogWorkflowInput = z.infer<typeof StartBlogWorkflowInputSchema>;

export const StartBlogWorkflowResultSchema = z.object({
  workflowRunId: z.string().uuid(),
  approvalId: z.string().uuid(),
});
export type StartBlogWorkflowResult = z.infer<typeof StartBlogWorkflowResultSchema>;

export const WordpressDraftRequestSchema = z.object({
  draft: BlogDraftSchema,
});
export type WordpressDraftRequest = z.infer<typeof WordpressDraftRequestSchema>;

export const WordpressDraftResponseSchema = z.object({
  postId: z.number().int().positive(),
  editUrl: z.string().url(),
  previewUrl: z.string().url(),
});
export type WordpressDraftResponse = z.infer<typeof WordpressDraftResponseSchema>;
