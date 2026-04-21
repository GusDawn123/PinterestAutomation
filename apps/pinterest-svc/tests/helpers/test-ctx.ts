import { vi } from "vitest";
import type { ServiceContext } from "../../src/context.js";
import type { ApprovalService } from "../../src/services/approvals.js";
import type { WorkflowService } from "../../src/services/workflow.js";
import type { PinterestClient } from "../../src/clients/pinterest.js";
import type { AnthropicClient } from "../../src/clients/anthropic.js";
import type { WordpressClient } from "../../src/clients/wordpress.js";

type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...args: A) => R>>
    : T[K];
};

export interface MockCtx {
  ctx: ServiceContext;
  approvals: Mocked<ApprovalService>;
  workflow: Mocked<WorkflowService>;
  pinterest: Mocked<PinterestClient>;
  anthropic: Mocked<AnthropicClient>;
  wordpress: Mocked<WordpressClient>;
  getBlogDraftPrompt: ReturnType<typeof vi.fn>;
}

export function makeMockCtx(): MockCtx {
  const approvals = {
    create: vi.fn(),
    get: vi.fn(),
    listPending: vi.fn(),
    listByRun: vi.fn(),
    decide: vi.fn(),
  } as unknown as Mocked<ApprovalService>;

  const workflow = {
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    saveBlogDraft: vi.fn(),
    updateBlogDraftWpId: vi.fn(),
    getBlogDraftByRun: vi.fn(),
  } as unknown as Mocked<WorkflowService>;

  const pinterest = {
    getAccessToken: vi.fn(),
    getTrendingKeywords: vi.fn(),
  } as unknown as Mocked<PinterestClient>;

  const anthropic = {
    generateBlogDraft: vi.fn(),
  } as unknown as Mocked<AnthropicClient>;

  const wordpress = {
    createDraft: vi.fn(),
    upsertTagsByName: vi.fn(),
    findCategoryByName: vi.fn(),
  } as unknown as Mocked<WordpressClient>;

  const getBlogDraftPrompt = vi.fn().mockResolvedValue("system prompt");

  const ctx: ServiceContext = {
    db: {} as ServiceContext["db"],
    approvals: approvals as unknown as ApprovalService,
    workflow: workflow as unknown as WorkflowService,
    pinterest: pinterest as unknown as PinterestClient,
    anthropic: anthropic as unknown as AnthropicClient,
    wordpress: wordpress as unknown as WordpressClient,
    getBlogDraftPrompt,
  };

  return { ctx, approvals, workflow, pinterest, anthropic, wordpress, getBlogDraftPrompt };
}
