"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type ApprovalRequest, type PinQueueItem } from "../../lib/api";
import { useToast } from "../../components/toast";

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M5 12h14M13 6l6 6-6 6"/>
  </svg>
);

const KIND_ROUTE: Record<string, string> = {
  keyword:    "/approvals/keyword",
  draft:      "/approvals/draft",
  images:     "/approvals/images",
  affiliates: "/approvals/affiliates",
  pins:       "/approvals/pins",
  publish:    "/approvals/publish",
};

function formatDate() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(new Date());
}

function formatNextPin(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffM = Math.floor((diffMs % 3600000) / 60000);
  if (diffH > 0) return `in ${diffH}h ${diffM}m`;
  if (diffM > 0) return `in ${diffM}m`;
  return "soon";
}

export default function Dashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const [starting, setStarting] = useState(false);
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null);
  const [queue, setQueue] = useState<PinQueueItem[] | null>(null);

  useEffect(() => {
    api.listPendingApprovals().then(({ approvals }) => setApprovals(approvals)).catch(() => setApprovals([]));
    api.listQueuedPins().then(({ items }) => setQueue(items)).catch(() => setQueue([]));
  }, []);

  async function handleStart() {
    setStarting(true);
    try {
      const { workflowRunId, approvalId } = await api.startBlogWorkflow("US");
      toast("New workflow started — keyword batch is ready");
      router.push(`/approvals/keyword?approvalId=${approvalId}&runId=${workflowRunId}`);
    } catch (e) {
      toast((e as Error).message, "err");
      setStarting(false);
    }
  }

  const pendingCount = approvals?.length ?? null;
  const queuedCount = queue?.length ?? null;
  const nextPin = queue?.[0];

  return (
    <div className="page-inner">
      <div className="dash-hero">
        <div>
          <div className="eyebrow">{formatDate()}</div>
          <h2>
            Good morning, <em>Carmen</em>
            {pendingCount !== null && pendingCount > 0 ? ` — ${pendingCount} draft${pendingCount > 1 ? "s" : ""} want a look.` : "."}
          </h2>
          <div className="sub">
            {nextPin
              ? `Next pin ${formatNextPin(nextPin.scheduledAt)} · ${queuedCount} queued`
              : "No pins scheduled yet"}
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleStart} disabled={starting}>
          <PlusIcon /> {starting ? "Starting…" : "Start new post"}
        </button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="lbl">Drafts pending</div>
          <div className="val">
            {approvals === null ? <span className="skeleton" style={{ width: 40, display: "inline-block" }} /> : (pendingCount ?? 0)}
          </div>
          <div className="tiny">across {approvals === null ? "—" : new Set(approvals.map((a) => a.workflowRunId)).size} workflows</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Pins queued</div>
          <div className="val">
            {queue === null ? <span className="skeleton" style={{ width: 40, display: "inline-block" }} /> : (queuedCount ?? 0)}
          </div>
          <div className="tiny">{nextPin ? `next ${formatNextPin(nextPin.scheduledAt)}` : "none scheduled"}</div>
        </div>
        <div className="stat-card">
          <div className="lbl">Scheduler</div>
          <div className="val" style={{ fontSize: 22 }}>Live</div>
          <div className="tiny">Pinterest + WordPress wired</div>
        </div>
        <div className="stat-card">
          <div className="lbl">AI stack</div>
          <div className="val" style={{ fontSize: 22 }}>Ready</div>
          <div className="tiny">Claude · Ideogram</div>
        </div>
      </div>

      <div className="dash-row">
        <div>
          <div className="dash-col-title">
            <h3>Approvals waiting</h3>
            <button className="link-btn" onClick={() => router.push("/approvals")}>See all <ArrowIcon /></button>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {approvals === null ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="mini-queue-item">
                  <span className="skeleton" style={{ width: 60, height: 20, borderRadius: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: "80%", marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: "50%" }} />
                  </div>
                </div>
              ))
            ) : approvals.length === 0 ? (
              <div style={{ padding: "20px 14px", color: "var(--ink-muted)", fontSize: 13, textAlign: "center" }}>
                Inbox clear ✓
              </div>
            ) : (
              approvals.slice(0, 5).map((a) => {
                const href = `${KIND_ROUTE[a.kind] ?? "/approvals"}?approvalId=${a.id}&runId=${a.workflowRunId}`;
                return (
                  <div key={a.id} className="mini-queue-item" onClick={() => router.push(href)}>
                    <span className={`stage-pill ${a.kind}`}>{a.kind}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="mini-title">{a.kind} approval</div>
                      <div className="mini-meta">{new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                    <button className="btn btn-ghost" style={{ padding: "4px 8px" }}>
                      <ArrowIcon />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div>
          <div className="dash-col-title">
            <h3>Next up</h3>
            <button className="link-btn" onClick={() => router.push("/calendar")}>Calendar <ArrowIcon /></button>
          </div>
          <div className="card" style={{ overflow: "hidden" }}>
            {queue === null ? (
              [0, 1, 2].map((i) => (
                <div key={i} className="mini-queue-item">
                  <div style={{ width: 44 }}>
                    <div className="skeleton" style={{ width: 32, height: 22, marginBottom: 4 }} />
                    <div className="skeleton" style={{ width: 32, height: 12 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ width: "70%", marginBottom: 6 }} />
                    <div className="skeleton" style={{ width: "45%" }} />
                  </div>
                </div>
              ))
            ) : queue.length === 0 ? (
              <div style={{ padding: "20px 14px", color: "var(--ink-muted)", fontSize: 13, textAlign: "center" }}>
                No pins scheduled
              </div>
            ) : (
              queue.slice(0, 5).map((p) => {
                const d = new Date(p.scheduledAt);
                return (
                  <div key={p.id} className="mini-queue-item">
                    <div style={{ width: 44, textAlign: "center" }}>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, lineHeight: 1 }}>{d.getDate()}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-muted)" }}>
                        {d.toLocaleString("en-US", { month: "short" }).toUpperCase()}
                      </div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="mini-title">{p.title}</div>
                      <div className="mini-meta">{d.getHours()}:00 · {p.boardId}</div>
                    </div>
                    <span className="chip plain">queued</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
