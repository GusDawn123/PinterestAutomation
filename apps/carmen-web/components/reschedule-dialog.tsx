"use client";

import { useEffect, useState } from "react";

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RescheduleDialog({
  open,
  onOpenChange,
  currentIso,
  onSubmit,
  submitting = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentIso?: string;
  onSubmit: (iso: string) => void | Promise<void>;
  submitting?: boolean;
}) {
  const [value, setValue] = useState(toLocalInput(currentIso));

  useEffect(() => {
    if (open) setValue(toLocalInput(currentIso));
  }, [open, currentIso]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    await onSubmit(new Date(value).toISOString());
  }

  if (!open) return null;

  return (
    <div
      className="aff-modal-wrap"
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onOpenChange(false); }}
    >
      <div className="aff-modal">
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 4 }}>Reschedule pin</div>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 18 }}>Pick a new date and time. Stored as UTC on the server.</div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <div className="field-label"><span>New time</span></div>
            <input
              type="datetime-local"
              className="field"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!value || submitting}>
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
