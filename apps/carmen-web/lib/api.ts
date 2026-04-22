import type {
  AffiliateProduct,
  AffiliateRetailer,
  AffiliatesApprovalDecision,
  AffiliatesApprovalPayload,
  ApprovalDecision,
  ApprovalRequest,
  BlogDraft,
  ComposedPin,
  ImageAffiliateSlot,
  ImageSlotDraft,
  ImagesApprovalDecision,
  KeywordApprovalDecision,
  PinQueueItem,
  PinsApprovalDecision,
  PinsApprovalPayload,
  RecommendedSlot,
  ScoredKeyword,
  StartBlogWorkflowResult,
  StartPinsWorkflowInput,
  StartPinsWorkflowResult,
  WorkflowRun,
} from "@pa/shared-types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

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

  startImages: (workflowRunId: string) =>
    fetchSvc<{ workflowRunId: string; approvalId: string; slots: ImageSlotDraft[] }>(
      `/workflows/${workflowRunId}/images/start`,
      { method: "POST" },
    ),

  uploadImage: async (workflowRunId: string, slotPosition: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `${BASE}/workflows/${workflowRunId}/images/${slotPosition}/upload`,
      { method: "POST", body: form, cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(
        `pinterest-svc /images/${slotPosition}/upload ${res.status}: ${await res.text()}`,
      );
    }
    return (await res.json()) as { slot: ImageSlotDraft };
  },

  reanalyzeImage: (
    workflowRunId: string,
    slotPosition: number,
    body: { instructions?: string } = {},
  ) =>
    fetchSvc<{ slot: ImageSlotDraft }>(
      `/workflows/${workflowRunId}/images/${slotPosition}/reanalyze`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),

  clearImage: (workflowRunId: string, slotPosition: number) =>
    fetchSvc<{ slot: ImageSlotDraft }>(
      `/workflows/${workflowRunId}/images/${slotPosition}/upload`,
      { method: "DELETE" },
    ),

  decideImages: (workflowRunId: string, decision: ImagesApprovalDecision) =>
    fetchSvc<{ workflowRunId: string; chosenImages: unknown[] }>(
      `/workflows/${workflowRunId}/images/decide`,
      {
        method: "POST",
        body: JSON.stringify(decision),
      },
    ),

  startAffiliates: (workflowRunId: string) =>
    fetchSvc<{ workflowRunId: string; approvalId: string; slotCount: number }>(
      `/workflows/${workflowRunId}/affiliates/start`,
      { method: "POST" },
    ),

  decideAffiliates: (workflowRunId: string, decision: AffiliatesApprovalDecision) =>
    fetchSvc<{ workflowRunId: string; slotCount: number }>(
      `/workflows/${workflowRunId}/affiliates/decide`,
      {
        method: "POST",
        body: JSON.stringify(decision),
      },
    ),

  publishToWordpress: (workflowRunId: string) =>
    fetchSvc<{ postId: number; editUrl: string; previewUrl: string }>(
      `/workflows/${workflowRunId}/wordpress-draft`,
      { method: "POST" },
    ),

  startPins: (
    blogWorkflowRunId: string,
    body: Omit<StartPinsWorkflowInput, "blogWorkflowRunId">,
  ) =>
    fetchSvc<StartPinsWorkflowResult>(`/workflows/${blogWorkflowRunId}/pins/start`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  regeneratePin: (
    workflowRunId: string,
    pinIndex: number,
    opts: { instructions?: string } = {},
  ) =>
    fetchSvc<{ pin: PinsApprovalPayload["pins"][number] }>(
      `/workflows/${workflowRunId}/pins/regenerate`,
      {
        method: "POST",
        body: JSON.stringify({
          pinIndex,
          ...(opts.instructions ? { instructions: opts.instructions } : {}),
        }),
      },
    ),

  uploadPin: async (workflowRunId: string, pinIndex: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(
      `${BASE}/workflows/${workflowRunId}/pins/${pinIndex}/upload`,
      { method: "POST", body: form, cache: "no-store" },
    );
    if (!res.ok) {
      throw new Error(
        `pinterest-svc /pins/${pinIndex}/upload ${res.status}: ${await res.text()}`,
      );
    }
    return (await res.json()) as { pin: ComposedPin };
  },

  decidePins: (workflowRunId: string, decision: PinsApprovalDecision) =>
    fetchSvc<{ workflowRunId: string; queued: string[] }>(
      `/workflows/${workflowRunId}/pins/decide`,
      {
        method: "POST",
        body: JSON.stringify(decision),
      },
    ),

  listQueuedPins: () => fetchSvc<{ items: PinQueueItem[] }>("/pins/queue"),
  listPostedPins: () => fetchSvc<{ items: PinQueueItem[] }>("/pins/posted"),

  reschedulePin: (pinQueueId: string, scheduledAt: string) =>
    fetchSvc<{ id: string; scheduledAt: string }>(`/pins/${pinQueueId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt }),
    }),

  cancelPin: (pinQueueId: string) =>
    fetchSvc<{ ok: true }>(`/pins/${pinQueueId}`, { method: "DELETE" }),

  listRecommendedSlots: (boardId: string) =>
    fetchSvc<{ slots: RecommendedSlot[] }>(
      `/analytics/slots?boardId=${encodeURIComponent(boardId)}`,
    ),

  listAnalytics: () =>
    fetchSvc<{ items: Array<Record<string, unknown>> }>("/analytics/pins"),
};

export type {
  AffiliateProduct,
  AffiliateRetailer,
  AffiliatesApprovalDecision,
  AffiliatesApprovalPayload,
  ApprovalRequest,
  BlogDraft,
  ComposedPin,
  ImageAffiliateSlot,
  ImageSlotDraft,
  PinQueueItem,
  PinsApprovalPayload,
  RecommendedSlot,
  ScoredKeyword,
  WorkflowRun,
};
