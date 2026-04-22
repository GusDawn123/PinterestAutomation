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

export const ImageSlotDraftSchema = z.object({
  slotPosition: z.number().int().nonnegative(),
  promptHint: z.string(),
  uploadedImageUrl: z.string().default(""),
  title: z.string().default(""),
  altText: z.string().default(""),
  detectedTags: z.array(z.string()).default([]),
});
export type ImageSlotDraft = z.infer<typeof ImageSlotDraftSchema>;

export const ImagesApprovalPayloadSchema = z.object({
  slots: z.array(ImageSlotDraftSchema).min(1),
});
export type ImagesApprovalPayload = z.infer<typeof ImagesApprovalPayloadSchema>;

export const ImagesApprovalDecisionSchema = z.object({
  slots: z
    .array(
      z.object({
        slotPosition: z.number().int().nonnegative(),
        titleOverride: z.string().max(200).optional(),
        altTextOverride: z.string().max(500).optional(),
      }),
    )
    .min(1),
});
export type ImagesApprovalDecision = z.infer<typeof ImagesApprovalDecisionSchema>;

export const ChosenImageSchema = z.object({
  slotPosition: z.number().int().nonnegative(),
  imageUrl: z.string().url(),
  prompt: z.string(),
  title: z.string().default(""),
  altText: z.string().default(""),
  detectedTags: z.array(z.string()).default([]),
});
export type ChosenImage = z.infer<typeof ChosenImageSchema>;

export const AffiliateRetailerEnum = z.enum([
  "amazon",
  "lowes",
  "target",
  "dharma_crafts",
  "sounds_true",
  "other",
]);
export type AffiliateRetailer = z.infer<typeof AffiliateRetailerEnum>;

export const AffiliateProductSchema = z.object({
  retailer: AffiliateRetailerEnum,
  rawHtml: z.string().min(1).max(20_000),
  displayLabel: z.string().max(200).optional(),
});
export type AffiliateProduct = z.infer<typeof AffiliateProductSchema>;

export const ImageAffiliateSlotSchema = z.object({
  slotPosition: z.number().int().nonnegative(),
  imageUrl: z.string().url(),
  altText: z.string().optional(),
  suggestedQueries: z.array(z.string().min(1).max(200)).min(1).max(5),
  products: z.array(AffiliateProductSchema).max(5).default([]),
});
export type ImageAffiliateSlot = z.infer<typeof ImageAffiliateSlotSchema>;

export const AffiliatesApprovalPayloadSchema = z.object({
  slots: z.array(ImageAffiliateSlotSchema).min(1),
});
export type AffiliatesApprovalPayload = z.infer<typeof AffiliatesApprovalPayloadSchema>;

export const AffiliatesApprovalDecisionSchema = z.object({
  slots: z
    .array(
      z.object({
        slotPosition: z.number().int().nonnegative(),
        products: z.array(AffiliateProductSchema).max(5).default([]),
      }),
    )
    .min(1),
});
export type AffiliatesApprovalDecision = z.infer<typeof AffiliatesApprovalDecisionSchema>;

export const AffiliateQueriesResultSchema = z.object({
  queries: z.array(z.string().min(1).max(200)).min(1).max(5),
});
export type AffiliateQueriesResult = z.infer<typeof AffiliateQueriesResultSchema>;

export const ImageAnalysisRequestSchema = z.object({
  imageUrl: z.string().url(),
  blogTitle: z.string().min(1),
  primaryKeyword: z.string().min(1),
  promptHint: z.string().default(""),
  instructions: z.string().max(500).optional(),
});
export type ImageAnalysisRequest = z.infer<typeof ImageAnalysisRequestSchema>;

export const ImageAnalysisResultSchema = z.object({
  title: z.string().max(200),
  altText: z.string().max(500),
  detectedTags: z.array(z.string().min(1).max(60)).max(8).default([]),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string().optional(),
});
export type ImageAnalysisResult = z.infer<typeof ImageAnalysisResultSchema>;

export const InterlinkCandidatePostSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  publishedAt: z.string().datetime().optional(),
});
export type InterlinkCandidatePost = z.infer<typeof InterlinkCandidatePostSchema>;

export const InterlinkRequestSchema = z.object({
  draft: BlogDraftSchema,
  candidatePosts: z.array(InterlinkCandidatePostSchema),
  maxLinks: z.number().int().min(1).max(10).default(5),
});
export type InterlinkRequest = z.infer<typeof InterlinkRequestSchema>;

export const InterlinkSelectionSchema = z.object({
  url: z.string().url(),
  anchor: z.string().min(1),
  sectionIndex: z.number().int().nonnegative(),
  reason: z.string(),
});
export type InterlinkSelection = z.infer<typeof InterlinkSelectionSchema>;

export const InterlinkResultSchema = z.object({
  selections: z.array(InterlinkSelectionSchema),
});
export type InterlinkResult = z.infer<typeof InterlinkResultSchema>;

export const HumanizeRequestSchema = z.object({
  text: z.string().min(1).max(50_000),
  readability: z.enum(["high_school", "university", "doctorate", "journalist", "marketing"]).default("high_school"),
  purpose: z.enum(["general_writing", "essay", "article", "blog", "marketing", "story", "cover_letter", "report"]).default("blog"),
});
export type HumanizeRequest = z.infer<typeof HumanizeRequestSchema>;

export const HumanizeResultSchema = z.object({
  humanizedText: z.string().min(1),
  documentId: z.string(),
});
export type HumanizeResult = z.infer<typeof HumanizeResultSchema>;

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

export const PinCopyVariationSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
});
export type PinCopyVariation = z.infer<typeof PinCopyVariationSchema>;

export const PinCopyRequestSchema = z.object({
  blogHeadline: z.string().min(1),
  blogUrl: z.string().url(),
  primaryKeyword: z.string().min(1),
  relatedKeywords: z.array(z.string()).default([]),
  imageUrl: z.string().url(),
  imageAltText: z.string().optional(),
  variationsPerImage: z.number().int().min(1).max(5).default(3),
  instructions: z.string().max(500).optional(),
});
export type PinCopyRequest = z.infer<typeof PinCopyRequestSchema>;

export const PinCopyResultSchema = z.object({
  imageUrl: z.string().url(),
  variations: z.array(PinCopyVariationSchema).min(1).max(5),
});
export type PinCopyResult = z.infer<typeof PinCopyResultSchema>;

export const ComposedPinSchema = z.object({
  pinIndex: z.number().int().nonnegative(),
  sourceImageUrl: z.string().url(),
  composedImageUrl: z.string().default(""),
  variations: z.array(PinCopyVariationSchema).min(1).max(5),
  needsManualCompose: z.boolean().optional(),
});
export type ComposedPin = z.infer<typeof ComposedPinSchema>;

export const PinsApprovalPayloadSchema = z.object({
  blogPostId: z.number().int().positive().optional(),
  blogUrl: z.string().url(),
  boardId: z.string().min(1),
  pins: z.array(ComposedPinSchema).min(1),
});
export type PinsApprovalPayload = z.infer<typeof PinsApprovalPayloadSchema>;

export const PinApprovalItemSchema = z.object({
  pinIndex: z.number().int().nonnegative(),
  chosenVariationIndex: z.number().int().min(0).max(4),
  edited: PinCopyVariationSchema.optional(),
});
export type PinApprovalItem = z.infer<typeof PinApprovalItemSchema>;

export const PinsApprovalDecisionSchema = z.object({
  approvedPins: z.array(PinApprovalItemSchema).min(1),
  autoPost: z.boolean().default(true),
});
export type PinsApprovalDecision = z.infer<typeof PinsApprovalDecisionSchema>;

export const SchedulePinRequestSchema = z.object({
  imageUrl: z.string().url(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  boardId: z.string().min(1),
  linkBackUrl: z.string().url(),
  scheduledAt: z.string().datetime(),
  blogPostId: z.number().int().positive().optional(),
});
export type SchedulePinRequest = z.infer<typeof SchedulePinRequestSchema>;

export const PinQueueItemSchema = z.object({
  id: z.string().uuid(),
  imageUrl: z.string().url(),
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  boardId: z.string(),
  linkBackUrl: z.string().url(),
  scheduledAt: z.string().datetime(),
  postedAt: z.string().datetime().nullable(),
  pinterestPinId: z.string().nullable(),
  blogPostId: z.number().int().positive().nullable(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
});
export type PinQueueItem = z.infer<typeof PinQueueItemSchema>;

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

export const StartPinsWorkflowInputSchema = z.object({
  blogWorkflowRunId: z.string().uuid(),
  boardId: z.string().min(1),
  autoPost: z.boolean().default(true),
});
export type StartPinsWorkflowInput = z.infer<typeof StartPinsWorkflowInputSchema>;

export const StartPinsWorkflowResultSchema = z.object({
  workflowRunId: z.string().uuid(),
  approvalId: z.string().uuid(),
  pinCount: z.number().int().nonnegative(),
});
export type StartPinsWorkflowResult = z.infer<typeof StartPinsWorkflowResultSchema>;

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

export const ApprovalKind = z.enum([
  "keyword",
  "draft",
  "images",
  "affiliates",
  "pins",
  "publish",
]);
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
