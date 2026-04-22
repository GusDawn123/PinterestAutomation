"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type PinQueueItem } from "../../lib/api";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { RescheduleDialog } from "../../components/reschedule-dialog";
import { useToast } from "../../components/toast";

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
  </svg>
);

export default function Calendar() {
  const { toast } = useToast();
  const [items, setItems] = useState<PinQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<PinQueueItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PinQueueItem | null>(null);

  async function refresh() {
    try {
      const { items } = await api.listQueuedPins();
      setItems(items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const grouped = useMemo(() => {
    const buckets = new Map<string, PinQueueItem[]>();
    for (const item of items) {
      const key = item.scheduledAt.slice(0, 10);
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  async function handleReschedule(iso: string) {
    if (!rescheduleTarget) return;
    setActioning(rescheduleTarget.id);
    try {
      await api.reschedulePin(rescheduleTarget.id, iso);
      await refresh();
      toast("Pin rescheduled");
      setRescheduleTarget(null);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setActioning(null);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setActioning(cancelTarget.id);
    try {
      await api.cancelPin(cancelTarget.id);
      await refresh();
      toast("Pin cancelled");
      setCancelTarget(null);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setActioning(null);
    }
  }

  if (loading) return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Calendar</div>
        <h1 className="page-title">Scheduled <em>pins</em></h1>
      </div>
      {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 80, marginBottom: 10, borderRadius: 12 }} />)}
    </div>
  );

  return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Calendar</div>
        <h1 className="page-title">
          <em>{items.length}</em> pin{items.length !== 1 ? "s" : ""} scheduled
        </h1>
        <div className="page-sub">Upcoming Pinterest posts. Reschedule or cancel individual pins.</div>
      </div>

      {error && <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>{error}</div>}

      {items.length === 0 && !error && (
        <div className="state">
          <div className="mk">✦</div>
          <h3>Queue is empty</h3>
          <p>Once pins are approved with auto-post, they land here for rescheduling.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        {grouped.map(([date, dayItems]) => (
          <div key={date}>
            <div className="section-label" style={{ marginBottom: 12 }}>{formatDate(date)}</div>
            <div className="card" style={{ overflow: "hidden" }}>
              {dayItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 72px 1fr auto",
                    gap: 14,
                    alignItems: "center",
                    padding: "14px 16px",
                    borderBottom: idx < dayItems.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)", textAlign: "center" }}>
                    {item.scheduledAt.slice(11, 16)}
                    <div style={{ fontSize: 10 }}>UTC</div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: "1px solid var(--border)" }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="chip plain">Board {item.boardId}</span>
                      {item.attempts > 0 && <span className="chip warn">{item.attempts} attempt{item.attempts !== 1 ? "s" : ""}</span>}
                      {item.lastError && <span style={{ fontSize: 11, color: "var(--red)", fontFamily: "var(--font-mono)" }}>{item.lastError.slice(0, 50)}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => setRescheduleTarget(item)}
                      disabled={actioning === item.id}
                    >
                      <RefreshIcon /> Reschedule
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: "5px 10px", fontSize: 12 }}
                      onClick={() => setCancelTarget(item)}
                      disabled={actioning === item.id}
                    >
                      <TrashIcon /> Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <RescheduleDialog
        open={rescheduleTarget !== null}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        currentIso={rescheduleTarget?.scheduledAt}
        onSubmit={handleReschedule}
        submitting={actioning === rescheduleTarget?.id}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Cancel scheduled pin?"
        description={cancelTarget ? `"${cancelTarget.title}" will be removed from the queue.` : undefined}
        confirmLabel="Cancel pin"
        cancelLabel="Keep"
        destructive
        onConfirm={handleCancel}
        confirming={actioning === cancelTarget?.id}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : DAY_FMT.format(d);
}
