"use client";

import { useRouter } from "next/navigation";

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

interface ActionBarProps {
  onApprove: () => void;
  approveLabel?: string;
  onReject?: () => void;
  onBack?: string | (() => void);
  metaText?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function ActionBar({
  onApprove,
  approveLabel = "Approve & continue",
  onReject,
  onBack,
  metaText,
  disabled,
  loading,
}: ActionBarProps) {
  const router = useRouter();

  const handleBack = () => {
    if (!onBack) return;
    if (typeof onBack === "string") router.push(onBack);
    else onBack();
  };

  return (
    <div className="action-bar">
      {onBack && (
        <button className="btn btn-ghost" onClick={handleBack}>
          ← Back
        </button>
      )}
      {metaText && <span className="meta">{metaText}</span>}
      <div className="spacer" />
      {onReject && (
        <button className="btn btn-danger" onClick={onReject}>
          <XIcon /> Reject <span className="btn-kbd">R</span>
        </button>
      )}
      <button
        className="btn btn-primary btn-lg"
        onClick={onApprove}
        disabled={disabled || loading}
      >
        {loading ? (
          <span style={{ opacity: 0.7 }}>Working…</span>
        ) : (
          <>
            <CheckIcon /> {approveLabel} <span className="btn-kbd">⏎</span>
          </>
        )}
      </button>
    </div>
  );
}
