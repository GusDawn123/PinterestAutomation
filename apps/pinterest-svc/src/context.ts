import type { Database } from "./db.js";
import type { ApprovalService } from "./services/approvals.js";
import type { WorkflowService } from "./services/workflow.js";
import type { PinsQueueService } from "./services/pins-queue.js";
import type { AnalyticsService } from "./services/analytics.js";
import type { RecommenderService } from "./services/recommender.js";
import type { PinterestClient } from "./clients/pinterest.js";
import type { AnthropicClient } from "./clients/anthropic.js";
import type { WordpressClient } from "./clients/wordpress.js";
import type { UndetectableClient } from "./clients/undetectable.js";
import type { ExifStripper } from "./exif.js";
import type { Alerter } from "./alerting.js";

export interface ServiceContext {
  db: Database;
  approvals: ApprovalService;
  workflow: WorkflowService;
  pinsQueue: PinsQueueService;
  analytics: AnalyticsService;
  recommender: RecommenderService;
  pinterest: PinterestClient;
  anthropic: AnthropicClient;
  wordpress: WordpressClient;
  undetectable: UndetectableClient;
  exif: ExifStripper;
  alerter: Alerter;
  getBlogDraftPrompt: () => Promise<string>;
  getAltTextPrompt: () => Promise<string>;
  getInterlinkPrompt: () => Promise<string>;
  getPinCopyPrompt: () => Promise<string>;
  getAffiliateQueriesPrompt: () => Promise<string>;
  downloadImage?: (url: string) => Promise<{ data: Buffer; contentType: string }>;
}
