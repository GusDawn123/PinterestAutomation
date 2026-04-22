"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type PinsApprovalPayload } from "../../../lib/api";
import { StageRail } from "../../../components/stage-rail";
import { ActionBar } from "../../../components/action-bar";
import { useToast } from "../../../components/toast";

const UploadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);
const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
  </svg>
);

export default function PinsApprovalPage() {
  return (
    <Suspense fallback={<div className="page-inner"><div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} /><div className="skeleton" style={{ height: 300 }} /></div>}>
      <PinsApproval />
    </Suspense>
  );
}

function PinsApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId") ?? "";

  const [payload, setPayload] = useState<PinsApprovalPayload | null>(null);
  const [choices, setChoices] = useState<Record<number, number>>({});
  const [autoPost, setAutoPost] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ queued: number } | null>(null);

  useEffect(() => {
    if (!approvalId) { setError("Missing approvalId"); setLoading(false); return; }
    api.getApproval(approvalId)
      .then((a) => {
        const p = a.payload as PinsApprovalPayload;
        setPayload(p);
        const init: Record<number, number> = {};
        p.pins.forEach((pin) => { init[pin.pinIndex] = 0; });
        setChoices(init);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  const totalPins = payload?.pins.length ?? 0;
  const allUploaded = useMemo(() => !!payload && payload.pins.length > 0 && payload.pins.every((p) => !!p.composedImageUrl), [payload]);
  const allChosen = useMemo(() => totalPins > 0 && Object.keys(choices).length === totalPins, [totalPins, choices]);

  async function handleUpload(pinIndex: number, file: File) {
    if (!workflowRunId) return;
    setUploading(pinIndex);
    try {
      const { pin } = await api.uploadPin(workflowRunId, pinIndex, file);
      setPayload((prev) => prev ? { ...prev, pins: prev.pins.map((p) => (p.pinIndex === pinIndex ? pin : p)) } : prev);
      toast(`Pin #${pinIndex + 1} uploaded`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setUploading(null);
    }
  }

  async function handleRegenerate(pinIndex: number) {
    if (!workflowRunId) return;
    setRegenerating(pinIndex);
    try {
      const { pin } = await api.regeneratePin(workflowRunId, pinIndex);
      setPayload((prev) => prev ? { ...prev, pins: prev.pins.map((p) => (p.pinIndex === pinIndex ? pin : p)) } : prev);
      setChoices((prev) => ({ ...prev, [pinIndex]: 0 }));
      toast(`Regenerated copy for pin #${pinIndex + 1}`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setRegenerating(null);
    }
  }

  async function handleSubmit() {
    if (!workflowRunId || !payload || !allChosen || !allUploaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.decidePins(workflowRunId, {
        autoPost,
        approvedPins: payload.pins.map((pin) => ({
          pinIndex: pin.pinIndex,
          chosenVariationIndex: choices[pin.pinIndex] ?? 0,
        })),
      });
      setSuccess({ queued: result.queued.length });
      toast(`${result.queued.length} pins queued`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, "err");
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="page-inner">
      <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
      <div className="skeleton" style={{ width: 200, height: 48, marginBottom: 24 }} />
      {[0, 1].map((i) => <div key={i} className="skeleton" style={{ height: 240, marginBottom: 12, borderRadius: 12 }} />)}
    </div>
  );

  if (success) return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Complete</div>
        <h1 className="page-title">{success.queued} pins <em>queued</em></h1>
      </div>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ color: "var(--green)", fontFamily: "var(--font-serif)", fontSize: 18, marginBottom: 16 }}>
          ✓ {success.queued} pins scheduled to board {payload?.boardId}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" onClick={() => router.push("/calendar")}>View schedule →</button>
          <button className="btn btn-ghost" onClick={() => router.push("/dashboard")}>Dashboard</button>
        </div>
      </div>
    </div>
  );

  if (!payload) return (
    <div className="page-inner">
      <div className="state"><div className="mk">!</div><h3>No pins payload</h3><p>{error}</p></div>
    </div>
  );

  const uploadedCount = payload.pins.filter((p) => !!p.composedImageUrl).length;

  return (
    <div className="page-inner">
      <StageRail current="/approvals/pins" runId={workflowRunId} />

      <div className="page-header">
        <div className="page-eyebrow">Stage 5 of 6</div>
        <h1 className="page-title">Upload <em>pins</em></h1>
        <div className="page-sub">Design each pin in Canva and upload the PNG/JPG. Pick a copy variation per pin.</div>
      </div>

      {error && <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div className="section-label">Composed pins</div>
        <span className={`chip ${allUploaded ? "good" : "plain"}`}>{uploadedCount}/{totalPins} uploaded</span>
      </div>

      <div style={{ marginBottom: 24 }}>
        {payload.pins.map((pin) => {
          const uploaded = !!pin.composedImageUrl;
          const isUploading = uploading === pin.pinIndex;
          const isRegen = regenerating === pin.pinIndex;
          return (
            <div key={pin.pinIndex} className="pin-slot">
              <div className="pin-layout">
                <div>
                  <PinDropZone
                    imageUrl={pin.composedImageUrl}
                    pinIndex={pin.pinIndex}
                    onFile={(f) => handleUpload(pin.pinIndex, f)}
                    disabled={isUploading || submitting || isRegen}
                    uploading={isUploading}
                  />
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 12, padding: "5px 10px" }}
                      onClick={() => handleRegenerate(pin.pinIndex)}
                      disabled={isRegen || submitting || isUploading}
                    >
                      {isRegen ? "Regenerating…" : <><RefreshIcon /> Regenerate copy</>}
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-muted)", marginBottom: 10 }}>
                    Pin #{pin.pinIndex + 1} · choose variation
                  </div>
                  {pin.variations.map((v, idx) => {
                    const picked = choices[pin.pinIndex] === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        className={`copy-variation ${picked ? "selected" : ""}`}
                        onClick={() => setChoices((prev) => ({ ...prev, [pin.pinIndex]: idx }))}
                      >
                        <div className="v-num">Variation {idx + 1}</div>
                        <div className="v-text">{v.title}</div>
                        <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-muted)", marginTop: 4 }}>{v.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {!uploaded && (
                <div style={{ marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent-ink)", background: "var(--accent-soft)", padding: "6px 10px", borderRadius: 6 }}>
                  Upload a composed image to continue
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 80 }}>
        <label className="switch" style={{ cursor: "pointer" }}>
          <button
            type="button"
            className={`toggle ${autoPost ? "on" : ""}`}
            onClick={() => setAutoPost((v) => !v)}
            aria-pressed={autoPost}
          />
          <span style={{ fontSize: 13 }}>Auto-schedule to best times (uses analytics slots)</span>
        </label>
      </div>

      <ActionBar
        onApprove={handleSubmit}
        approveLabel={`Schedule ${totalPins} pin${totalPins !== 1 ? "s" : ""}`}
        onBack="/approvals"
        metaText={`Board ${payload.boardId}`}
        disabled={!allChosen || !allUploaded || regenerating !== null || uploading !== null}
        loading={submitting}
      />
    </div>
  );
}

function PinDropZone({
  imageUrl,
  pinIndex,
  onFile,
  disabled,
  uploading,
}: {
  imageUrl: string;
  pinIndex: number;
  onFile: (f: File) => void;
  disabled: boolean;
  uploading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const hasImg = !!imageUrl;
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
      />
      <div
        className={`pin-drop ${hasImg ? "has-image" : ""}`}
        onClick={() => !disabled && ref.current?.click()}
      >
        {hasImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`pin ${pinIndex}`} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} />
        ) : (
          <>
            <div className="icon-big">P</div>
            <div className="lbl">{uploading ? "Uploading…" : "Upload composed pin"}</div>
            <div className="sub-lbl">PNG · JPG · WEBP</div>
          </>
        )}
      </div>
      {hasImg && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: "5px 10px", marginTop: 6, width: "100%", justifyContent: "center" }} disabled={disabled} onClick={() => ref.current?.click()}>
          <UploadIcon /> Replace image
        </button>
      )}
    </>
  );
}
