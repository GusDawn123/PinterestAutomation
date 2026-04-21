import { describe, it, expect, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../src/server.js";
import { makeMockCtx, type MockCtx } from "../helpers/test-ctx.js";

let mock: MockCtx;
const app = await buildServer({ ctx: (mock = makeMockCtx()).ctx });

beforeEach(() => {
  mock.approvals.listPending.mockReset();
  mock.approvals.get.mockReset();
  mock.approvals.decide.mockReset();
});

afterAll(async () => {
  await app.close();
});

const sampleApproval = {
  id: "00000000-0000-4000-8000-000000000001",
  workflowRunId: "00000000-0000-4000-8000-000000000002",
  kind: "keyword" as const,
  payload: { candidates: [] },
  status: "pending" as const,
  createdAt: new Date().toISOString(),
  decidedAt: null,
  decidedBy: null,
  notes: null,
  decisionData: null,
};

describe("GET /approvals", () => {
  it("returns pending approvals", async () => {
    mock.approvals.listPending.mockResolvedValue([sampleApproval] as never);
    const res = await app.inject({ method: "GET", url: "/approvals" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { approvals: unknown[] }).approvals).toHaveLength(1);
  });
});

describe("GET /approvals/:id", () => {
  it("returns 404 when not found", async () => {
    mock.approvals.get.mockResolvedValue(null);
    const res = await app.inject({
      method: "GET",
      url: "/approvals/00000000-0000-4000-8000-000000000001",
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns the approval", async () => {
    mock.approvals.get.mockResolvedValue(sampleApproval as never);
    const res = await app.inject({
      method: "GET",
      url: `/approvals/${sampleApproval.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { id: string }).id).toBe(sampleApproval.id);
  });
});

describe("POST /approvals/:id/decide", () => {
  it("rejects pending as decision", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/approvals/${sampleApproval.id}/decide`,
      payload: { status: "pending" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("decides an approval", async () => {
    const decided = { ...sampleApproval, status: "approved" };
    mock.approvals.decide.mockResolvedValue(decided as never);

    const res = await app.inject({
      method: "POST",
      url: `/approvals/${sampleApproval.id}/decide`,
      payload: { status: "approved", notes: "looks good" },
    });

    expect(res.statusCode).toBe(200);
    expect((res.json() as { status: string }).status).toBe("approved");
    expect(mock.approvals.decide).toHaveBeenCalledWith({
      approvalId: sampleApproval.id,
      status: "approved",
      decisionData: undefined,
      notes: "looks good",
    });
  });
});
