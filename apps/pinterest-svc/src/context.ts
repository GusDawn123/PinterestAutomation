import type { Database } from "./db.js";
import type { ApprovalService } from "./services/approvals.js";
import type { WorkflowService } from "./services/workflow.js";
import type { PinterestClient } from "./clients/pinterest.js";
import type { AnthropicClient } from "./clients/anthropic.js";
import type { WordpressClient } from "./clients/wordpress.js";

export interface ServiceContext {
  db: Database;
  approvals: ApprovalService;
  workflow: WorkflowService;
  pinterest: PinterestClient;
  anthropic: AnthropicClient;
  wordpress: WordpressClient;
  getBlogDraftPrompt: () => Promise<string>;
}
