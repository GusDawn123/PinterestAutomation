import { vi } from "vitest";
import type { ServiceContext } from "../../src/context.js";
import type { ApprovalService } from "../../src/services/approvals.js";
import type { WorkflowService } from "../../src/services/workflow.js";
import type { PinsQueueService } from "../../src/services/pins-queue.js";
import type { AnalyticsService } from "../../src/services/analytics.js";
import type { RecommenderService } from "../../src/services/recommender.js";
import type { PinterestClient } from "../../src/clients/pinterest.js";
import type { AnthropicClient } from "../../src/clients/anthropic.js";
import type { WordpressClient } from "../../src/clients/wordpress.js";
import type { UndetectableClient } from "../../src/clients/undetectable.js";
import type { ExifStripper } from "../../src/exif.js";
import type { Alerter } from "../../src/alerting.js";

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K];
};

export interface MockCtx {
  ctx: ServiceContext;
  approvals: Mocked<ApprovalService>;
  workflow: Mocked<WorkflowService>;
  pinsQueue: Mocked<PinsQueueService>;
  analytics: Mocked<AnalyticsService>;
  recommender: Mocked<RecommenderService>;
  pinterest: Mocked<PinterestClient>;
  anthropic: Mocked<AnthropicClient>;
  wordpress: Mocked<WordpressClient>;
  undetectable: Mocked<UndetectableClient>;
  exif: Mocked<ExifStripper>;
  alerter: Mocked<Alerter>;
  getBlogDraftPrompt: ReturnType<typeof vi.fn>;
  getImageAnalysisPrompt: ReturnType<typeof vi.fn>;
  getInterlinkPrompt: ReturnType<typeof vi.fn>;
  getPinCopyPrompt: ReturnType<typeof vi.fn>;
  getAffiliateQueriesPrompt: ReturnType<typeof vi.fn>;
  downloadImage: ReturnType<typeof vi.fn>;
}

export function makeMockCtx(): MockCtx {
  const approvals = {
    create: vi.fn(),
    get: vi.fn(),
    listPending: vi.fn(),
    listByRun: vi.fn(),
    updatePayload: vi.fn(),
    decide: vi.fn(),
  } as unknown as Mocked<ApprovalService>;

  const workflow = {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    saveBlogDraft: vi.fn(),
    updateBlogDraftImages: vi.fn(),
    updateBlogDraftAffiliates: vi.fn(),
    updateBlogDraftWpId: vi.fn(),
    getBlogDraftByRun: vi.fn(),
  } as unknown as Mocked<WorkflowService>;

  const pinsQueue = {
    enqueue: vi.fn(),
    listDue: vi.fn(),
    listUpcoming: vi.fn(),
    listPosted: vi.fn(),
    markPosted: vi.fn(),
    markAttemptFailed: vi.fn(),
    reschedule: vi.fn(),
    cancel: vi.fn(),
  } as unknown as Mocked<PinsQueueService>;

  const analytics = {
    record: vi.fn(),
    latestForPin: vi.fn(),
    all: vi.fn(),
  } as unknown as Mocked<AnalyticsService>;

  const recommender = {
    recompute: vi.fn(),
    listForBoard: vi.fn(),
    nextSlotFor: vi.fn(),
  } as unknown as Mocked<RecommenderService>;

  const pinterest = {
    getAccessToken: vi.fn(),
    getTrendingKeywords: vi.fn(),
    createPin: vi.fn(),
    getPinAnalytics: vi.fn(),
  } as unknown as Mocked<PinterestClient>;

  const anthropic = {
    generateBlogDraft: vi.fn(),
    analyzeImage: vi.fn(),
    generatePinCopy: vi.fn(),
    pickInterlinks: vi.fn(),
    suggestAffiliateQueries: vi.fn(),
  } as unknown as Mocked<AnthropicClient>;

  const wordpress = {
    createDraft: vi.fn(),
    uploadMedia: vi.fn(),
    upsertTagsByName: vi.fn(),
    findCategoryByName: vi.fn(),
  } as unknown as Mocked<WordpressClient>;

  const undetectable = {
    humanize: vi.fn(),
  } as unknown as Mocked<UndetectableClient>;

  const exif = {
    stripFile: vi.fn().mockResolvedValue({ stripped: true }),
    stripBuffer: vi.fn().mockImplementation(async (data: Buffer) => data),
  } as unknown as Mocked<ExifStripper>;

  const alerter = {
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as Mocked<Alerter>;

  const getBlogDraftPrompt = vi.fn().mockResolvedValue("system prompt");
  const getImageAnalysisPrompt = vi.fn().mockResolvedValue("image analysis prompt");
  const getInterlinkPrompt = vi.fn().mockResolvedValue("interlink prompt");
  const getPinCopyPrompt = vi.fn().mockResolvedValue("pin copy prompt");
  const getAffiliateQueriesPrompt = vi.fn().mockResolvedValue("affiliate queries prompt");
  const downloadImage = vi
    .fn()
    .mockResolvedValue({ data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), contentType: "image/jpeg" });

  const ctx: ServiceContext = {
    db: {} as ServiceContext["db"],
    approvals: approvals as unknown as ApprovalService,
    workflow: workflow as unknown as WorkflowService,
    pinsQueue: pinsQueue as unknown as PinsQueueService,
    analytics: analytics as unknown as AnalyticsService,
    recommender: recommender as unknown as RecommenderService,
    pinterest: pinterest as unknown as PinterestClient,
    anthropic: anthropic as unknown as AnthropicClient,
    wordpress: wordpress as unknown as WordpressClient,
    undetectable: undetectable as unknown as UndetectableClient,
    exif: exif as unknown as ExifStripper,
    alerter: alerter as unknown as Alerter,
    getBlogDraftPrompt,
    getImageAnalysisPrompt,
    getInterlinkPrompt,
    getPinCopyPrompt,
    getAffiliateQueriesPrompt,
    downloadImage,
  };

  return {
    ctx,
    approvals,
    workflow,
    pinsQueue,
    analytics,
    recommender,
    pinterest,
    anthropic,
    wordpress,
    undetectable,
    exif,
    alerter,
    getBlogDraftPrompt,
    getImageAnalysisPrompt,
    getInterlinkPrompt,
    getPinCopyPrompt,
    getAffiliateQueriesPrompt,
    downloadImage,
  };
}
