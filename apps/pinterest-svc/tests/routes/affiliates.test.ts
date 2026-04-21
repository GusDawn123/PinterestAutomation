import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";
import type { AffiliatesApprovalPayload, ChosenImage } from "@pa/shared-types";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.workflow.get.mockReset();
  mock.workflow.getBlogDraftByRun.mockReset();
  mock.workflow.update.mockReset();
  mock.workflow.updateBlogDraftAffiliates.mockReset();
  mock.approvals.listByRun.mockReset();
  mock.approvals.create.mockReset();
  mock.approvals.updatePayload.mockReset();
  mock.approvals.decide.mockReset();
  mock.anthropic.suggestAffiliateQueries.mockReset();
});

afterAll(async () => {
  await app.close();
});

const runId = "00000000-0000-4000-8000-000000000f00";
const draftId = "00000000-0000-4000-8000-000000000f01";
const approvalId = "00000000-0000-4000-8000-000000000f02";

const CHOSEN: ChosenImage[] = [
  {
    slotPosition: 0,
    imageUrl: "https://cdn.ideogram.ai/a.png",
    prompt: "a",
    altText: "cozy nook with plants",
  },
  {
    slotPosition: 1,
    imageUrl: "https://cdn.ideogram.ai/b.png",
    prompt: "b",
  },
];

describe("POST /workflows/:id/affiliates/start", () => {
  it("calls anthropic per chosen image and creates affiliates approval", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      draft: { headline: "Cozy nook ideas" },
      chosenImages: CHOSEN,
    } as never);
    mock.approvals.listByRun.mockResolvedValue([] as never);
    mock.anthropic.suggestAffiliateQueries
      .mockResolvedValueOnce({ queries: ["woven basket", "linen throw"] } as never)
      .mockResolvedValueOnce({ queries: ["hanging planter"] } as never);
    mock.approvals.create.mockResolvedValue({ id: approvalId } as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/start`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { workflowRunId: string; approvalId: string; slotCount: number };
    expect(body.workflowRunId).toBe(runId);
    expect(body.approvalId).toBe(approvalId);
    expect(body.slotCount).toBe(2);

    expect(mock.anthropic.suggestAffiliateQueries).toHaveBeenCalledTimes(2);
    expect(mock.anthropic.suggestAffiliateQueries).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        imageUrl: "https://cdn.ideogram.ai/a.png",
        blogHeadline: "Cozy nook ideas",
        primaryKeyword: "cozy nook",
        altText: "cozy nook with plants",
      }),
      expect.any(String),
    );

    const approvalArg = mock.approvals.create.mock.calls[0]![0] as {
      kind: string;
      payload: AffiliatesApprovalPayload;
    };
    expect(approvalArg.kind).toBe("affiliates");
    expect(approvalArg.payload.slots).toHaveLength(2);
    expect(approvalArg.payload.slots[0]!.slotPosition).toBe(0);
    expect(approvalArg.payload.slots[0]!.suggestedQueries).toEqual(["woven basket", "linen throw"]);
    expect(approvalArg.payload.slots[0]!.products).toEqual([]);
    expect(approvalArg.payload.slots[1]!.suggestedQueries).toEqual(["hanging planter"]);

    expect(mock.workflow.update).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        currentStep: "awaiting_affiliates_approval",
        status: "awaiting_approval",
      }),
    );
  });

  it("returns existing pending approval without calling anthropic again (idempotent)", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy nook",
      draft: { headline: "Cozy nook ideas" },
      chosenImages: CHOSEN,
    } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "affiliates",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              imageUrl: "https://cdn.ideogram.ai/a.png",
              suggestedQueries: ["woven basket"],
              products: [],
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/start`,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { approvalId: string; slotCount: number };
    expect(body.approvalId).toBe(approvalId);
    expect(body.slotCount).toBe(1);
    expect(mock.anthropic.suggestAffiliateQueries).not.toHaveBeenCalled();
    expect(mock.approvals.create).not.toHaveBeenCalled();
  });

  it("400s when blog draft has no chosen images", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({
      id: draftId,
      keyword: "cozy",
      draft: { headline: "x" },
      chosenImages: [],
    } as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/start`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(mock.anthropic.suggestAffiliateQueries).not.toHaveBeenCalled();
  });

  it("404s when workflow missing", async () => {
    mock.workflow.get.mockResolvedValue(null);
    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/start`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /workflows/:id/affiliates/decide", () => {
  it("persists products, updates approval, and advances workflow", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({ id: draftId } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "affiliates",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              imageUrl: "https://cdn.ideogram.ai/a.png",
              suggestedQueries: ["woven basket"],
              products: [],
            },
            {
              slotPosition: 1,
              imageUrl: "https://cdn.ideogram.ai/b.png",
              suggestedQueries: ["hanging planter"],
              products: [],
            },
          ],
        },
      },
    ] as never);
    mock.workflow.updateBlogDraftAffiliates.mockResolvedValue({} as never);
    mock.approvals.updatePayload.mockResolvedValue({} as never);
    mock.approvals.decide.mockResolvedValue({} as never);
    mock.workflow.update.mockResolvedValue({} as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/decide`,
      payload: {
        slots: [
          {
            slotPosition: 0,
            products: [
              { retailer: "amazon", rawHtml: "<div>amazon widget</div>" },
              { retailer: "target", rawHtml: "<span>target item</span>" },
            ],
          },
          { slotPosition: 1, products: [] },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { slotCount: number };
    expect(body.slotCount).toBe(2);

    const [draftArg, affiliates] = mock.workflow.updateBlogDraftAffiliates.mock.calls[0]!;
    expect(draftArg).toBe(draftId);
    expect(affiliates).toEqual([
      {
        slotPosition: 0,
        products: [
          { retailer: "amazon", rawHtml: "<div>amazon widget</div>" },
          { retailer: "target", rawHtml: "<span>target item</span>" },
        ],
      },
      { slotPosition: 1, products: [] },
    ]);

    expect(mock.approvals.decide).toHaveBeenCalledWith(
      expect.objectContaining({ approvalId, status: "approved" }),
    );
    expect(mock.workflow.update).toHaveBeenCalledWith(
      runId,
      expect.objectContaining({
        currentStep: "affiliates_approved",
        status: "running",
      }),
    );
  });

  it("400s on unknown slot position", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({ id: draftId } as never);
    mock.approvals.listByRun.mockResolvedValue([
      {
        id: approvalId,
        kind: "affiliates",
        status: "pending",
        payload: {
          slots: [
            {
              slotPosition: 0,
              imageUrl: "https://cdn.ideogram.ai/a.png",
              suggestedQueries: ["x"],
              products: [],
            },
          ],
        },
      },
    ] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/decide`,
      payload: {
        slots: [{ slotPosition: 9, products: [] }],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(mock.workflow.updateBlogDraftAffiliates).not.toHaveBeenCalled();
  });

  it("404s when no pending affiliates approval exists", async () => {
    mock.workflow.get.mockResolvedValue({ id: runId, kind: "blog" } as never);
    mock.workflow.getBlogDraftByRun.mockResolvedValue({ id: draftId } as never);
    mock.approvals.listByRun.mockResolvedValue([] as never);

    const res = await app.inject({
      method: "POST",
      url: `/workflows/${runId}/affiliates/decide`,
      payload: { slots: [{ slotPosition: 0, products: [] }] },
    });
    expect(res.statusCode).toBe(404);
  });
});
