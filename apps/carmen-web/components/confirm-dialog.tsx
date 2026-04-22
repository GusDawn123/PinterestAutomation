"use client";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  confirming = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  confirming?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="aff-modal-wrap"
      onClick={(e) => { if (e.target === e.currentTarget && !confirming) onOpenChange(false); }}
    >
      <div className="aff-modal">
        <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 6 }}>{title}</div>
        {description && <div style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 18, lineHeight: 1.5 }}>{description}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
