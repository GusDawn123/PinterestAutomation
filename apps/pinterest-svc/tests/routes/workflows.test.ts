import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";
import type { BlogDraft } from "@pa/shared-types";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.pinterest.getTrendingKeywords.mockReset();
  mock.workflow.create.mockReset();
  mock.workflow.update.mockReset();
  mock.workflow.get.mockReset();
  mock.workflow.saveBlogDraft.mockReset();
  mock.approvals.create.mockReset();
  mock.approvals.listByRun.mockReset();
  mock.approvals.decide.mockReset();
  mock.anthropic.generateBlogDraft.mockReset();
});

afterAll(async () => {
  await app.close();
});

const SAMPLE_DRAFT: BlogDraft = {
  headline: "Cozy",
  urlSlug: "cozy",
  bodyMarkdown: "Body.",
  metaDescription: "Meta.",
  socialDescription: "Social.",
  category: "Home",
  tags: ["cozy"],
  imageSlots: [],
};

describe("POST /workflows/blog/start", () => {
  it("creates a run, fetches trending keywords, creates a keyword approval", async () => {
    mock.pinterest.getTrendingKeywords.mockResolvedValue([
      { keyword: "cozy", searchVolume: 1000, trendScore: 1.2, competition: 0.3 },
      { keyword: "bright", searchVolume: 500, trendScore: 1.0, competition: 0.5 },
    ] as never);
    mock.workflow.create.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000100",
    } as never);
    mock.workflow.update.mockResolvedValue({} as never);
    mock.approvals.create.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000200",
    } as never);

    const res = await app.inject({
      method: "POST",
      url: "/workflows/blog/start",
      payload: { region: "US" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { workflowRunId: string; approvalId: string };
    expect(body.workflowRunId).toBe("00000000-0000-4000-8000-000000000100");
    expect(body.approvalId).toBe("00000000-0000-4000-8000-000000000200");

    expect(mock.pinterest.getTrendingKeywords).toHaveBeenCalledWith("US");
    expect(mock.workflow.create).toHaveBeenCalledWith("blog", "awaiting_keyword", {
      region: "US",
    });
    const approvalCall = mock.approvals.create.mock.calls[0]![0] as {
      kind: string;
      payload: { candidates: unknown[] };
    };
    expect(approvalCall.kind).toBe("keyword");
    expect(approvalCall.payload.candidates).toHaveLength(2);
  });
});

describe("POST /workflows/:id/draft", () => {
  const runId = "00000000-0000-4000-8000-000000000300";

  it("resolves pending keyword approval, calls Claude, creates draft approval", async () => {
    mock.workflow.get.mockResolvedValue({
      id: runId,
      kind: "blog",
      status: "awaiting_approval",
      currentStep: "awaiting_keyword",
      context: { region: "US" },
    } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000400",
        kind: "keyword",
        status: "pending",
      },
    ] as never);
    mock.approvals.decide.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);
    mock.anthropic.generateBlogDraft.mockResolvedValue(SAMPLE_DRAFT);
    mock.workflow.saveBlogDraft.mockResolvedValue({} as never);
    mock.approvals.create.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000500",
    } as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/draft`,
      payload: { chosenKeyword: "cozy", brief: "a warm guide for small spaces" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { draft: BlogDraft };
    expect(body.draft.headline).toBe("Cozy");

    expect(mock.approvals.decide).toHaveBeenCalledWith({
      approvalId: "00000000-0000-4000-8000-000000000400",
      status: "approved",
      decisionData: { chosenKeyword: "cozy", brief: "a warm guide for small spaces" },
    });
    expect(mock.anthropic.generateBlogDraft).toHaveBeenCalledWith(
      { keyword: "cozy", brief: "a warm guide for small spaces" },
      "system prompt",
    );
    expect(mock.workflow.saveBlogDraft).toHaveBeenCalledWith(
      runId,
      "cozy",
      "a warm guide for small spaces",
      SAMPLE_DRAFT,
    );
  });

  it("404s when workflow is missing", async () => {
    mock.workflow.get.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/draft`,
      payload: { chosenKeyword: "cozy", brief: "x" },
    });
    expect(res.statusCode).toBe(404);
  });
});
