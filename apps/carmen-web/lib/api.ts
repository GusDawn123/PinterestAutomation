import type {
  ApprovalDecision,
  ApprovalRequest,
  BlogDraft,
  KeywordApprovalDecision,
  ScoredKeyword,
  StartBlogWorkflowResult,
  WorkflowRun,
} from "@pa/shared-types";

const BASE = process.env.NEXT_PUBLIC_PINTEREST_SVC_URL ?? "http://localhost:3001";

export async function fetchSvc<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`pinterest-svc ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  startBlogWorkflow: (region = "US") =>
    fetchSvc<StartBlogWorkflowResult>("/workflows/blog/start", {
      method: "POST",
      body: JSON.stringify({ region }),
    }),

  getApproval: (id: string) => fetchSvc<ApprovalRequest>(`/approvals/${id}`),

  listPendingApprovals: () =>
    fetchSvc<{ approvals: ApprovalRequest[] }>("/approvals"),

  decideApproval: (id: string, decision: ApprovalDecision) =>
    fetchSvc<ApprovalRequest>(`/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify(decision),
    }),

  submitKeyword: (workflowRunId: string, decision: KeywordApprovalDecision) =>
    fetchSvc<{ workflowRunId: string; approvalId: string; draft: BlogDraft }>(
      `/workflows/${workflowRunId}/draft`,
      {
        method: "POST",
        body: JSON.stringify(decision),
      },
    ),

  getWorkflow: (id: string) =>
    fetchSvc<{ run: WorkflowRun; approvals: ApprovalRequest[]; blogDraft: unknown }>(
      `/workflows/${id}`,
    ),

  publishToWordpress: (workflowRunId: string) =>
    fetchSvc<{ postId: number; editUrl: string; previewUrl: string }>(
      `/workflows/${workflowRunId}/wordpress-draft`,
      { method: "POST" },
    ),
};

export type { ApprovalRequest, BlogDraft, ScoredKeyword, WorkflowRun };
