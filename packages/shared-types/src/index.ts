import { z } from "zod";

export const TrendingKeywordSchema = z.object({
  keyword: z.string().min(1),
  searchVolume: z.number().nonnegative(),
  trendScore: z.number(),
  competition: z.number().min(0).max(1),
});
export type TrendingKeyword = z.infer<typeof TrendingKeywordSchema>;

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

export const ApprovalStatus = z.enum(["pending", "approved", "rejected", "changes_requested"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalKind = z.enum([
  "keyword",
  "draft",
  "images",
  "pins",
  "publish",
]);
export type ApprovalKind = z.infer<typeof ApprovalKind>;

export const ApprovalRequestSchema = z.object({
  id: z.string().uuid(),
  workflowRunId: z.string(),
  kind: ApprovalKind,
  payload: z.unknown(),
  status: ApprovalStatus,
  createdAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  decidedBy: z.string().nullable(),
  notes: z.string().nullable(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
