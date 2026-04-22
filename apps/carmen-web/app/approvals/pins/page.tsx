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
    <Suspense
      fallback={
        <div className="page-inner">
          <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      }
    >
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
  const [regenPrompts, setRegenPrompts] = useState<Record<number, string>>({});
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
  const allUploaded = useMemo(
    () => !!payload && payload.pins.length > 0 && payload.pins.every((p) => !!p.composedImageUrl),
    [payload],
  );
  const allChosen = useMemo(
    () => totalPins > 0 && Object.keys(choices).length === totalPins,
    [totalPins, choices],
  );

  async function handleUpload(pinIndex: number, file: File) {
    if (!workflowRunId) return;
    setUploading(pinIndex);
    try {
      const { pin } = await api.uploadPin(workflowRunId, pinIndex, file);
      setPayload((prev) =>
        prev ? { ...prev, pins: prev.pins.map((p) => (p.pinIndex === pinIndex ? pin : p)) } : prev,
      );
      toast(`Pin #${pinIndex + 1} uploaded`);
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setUploading(null);
    }
  }

  async function handleRegenerate(pinIndex: number) {
    if (!workflowRunId) return;
    const instructions = (regenPrompts[pinIndex] ?? "").trim();
    setRegenerating(pinIndex);
    try {
      const { pin } = await api.regeneratePin(workflowRunId, pinIndex, {
        ...(instructions ? { instructions } : {}),
      });
      setPayload((prev) =>
        prev ? { ...prev, pins: prev.pins.map((p) => (p.pinIndex === pinIndex ? pin : p)) } : prev,
      );
      setChoices((prev) => ({ ...prev, [pinIndex]: 0 }));
      setRegenPrompts((prev) => ({ ...prev, [pinIndex]: "" }));
      toast(`Pin #${pinIndex + 1}: rewrote copy`);
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
        <h1 className="page-title">Pick <em>copy</em>, then upload the pin</h1>
        <div className="page-sub">
          Claude wrote a few title + description options for each pin. Pick the one you like (or regenerate with
          instructions). Take the final text to Canva, build your pin, then drop it back here.
        </div>
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
          const chosenIdx = choices[pin.pinIndex] ?? 0;
          const chosen = pin.variations[chosenIdx];
          return (
            <div key={pin.pinIndex} className="pin-slot">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>Pin {pin.pinIndex + 1}</div>
                {uploaded ? (
                  <span className="chip good">✓ uploaded</span>
                ) : chosen ? (
                  <span className="chip warn">copy picked · upload next</span>
                ) : (
                  <span className="chip plain">pick copy first</span>
                )}
              </div>

              {/* Step 1 — pick copy */}
              <div style={{ marginBottom: 18 }}>
                <div className="field-label">
                  <span>1 · Pick copy variation</span>
                  <span className="field-hint">{pin.variations.length} options from Claude</span>
                </div>
                {pin.variations.map((v, vi) => {
                  const picked = chosenIdx === vi;
                  return (
                    <button
                      key={vi}
                      type="button"
                      className={`copy-variation ${picked ? "selected" : ""}`}
                      onClick={() => setChoices((prev) => ({ ...prev, [pin.pinIndex]: vi }))}
                    >
                      <div className="v-num">v{vi + 1}</div>
                      <div className="v-text">{v.title}</div>
                      <div style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13, color: "var(--ink-muted)", marginTop: 4 }}>
                        {v.description}
                      </div>
                    </button>
                  );
                })}

                <div className="field-label" style={{ marginTop: 12 }}>
                  <span>Regenerate with instructions · optional</span>
                  <span className="field-hint">"make it punchier", "emphasize the linen"…</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    className="field"
                    value={regenPrompts[pin.pinIndex] ?? ""}
                    placeholder="Leave blank for a plain regenerate"
                    onChange={(e) => setRegenPrompts((prev) => ({ ...prev, [pin.pinIndex]: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ whiteSpace: "nowrap" }}
                    onClick={() => handleRegenerate(pin.pinIndex)}
                    disabled={isRegen || submitting || isUploading}
                  >
                    {isRegen ? "Regenerating…" : <><RefreshIcon /> Regenerate</>}
                  </button>
                </div>
              </div>

              {/* Step 2 — upload composed pin */}
              <div>
                <div className="field-label">
                  <span>2 · Upload composed pin</span>
                  <span className="field-hint">Copy the text above → build in Canva → drop the image here</span>
                </div>
                <PinDropZone
                  imageUrl={pin.composedImageUrl}
                  chosenTitle={chosen?.title ?? ""}
                  onFile={(f) => handleUpload(pin.pinIndex, f)}
                  disabled={isUploading || submitting || isRegen}
                  uploading={isUploading}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 80, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 12, background: "var(--bg-card)" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Auto-post at scheduled time</div>
          <div style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 2 }}>
            If off, the scheduler pauses for final confirm.
          </div>
        </div>
        <div className="switch">
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>
            {autoPost ? "ON" : "OFF"}
          </span>
          <button
            type="button"
            className={`toggle ${autoPost ? "on" : ""}`}
            onClick={() => setAutoPost((v) => !v)}
            aria-pressed={autoPost}
          />
        </div>
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
  chosenTitle,
  onFile,
  disabled,
  uploading,
}: {
  imageUrl: string;
  chosenTitle: string;
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
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="pin-layout">
        <div
          className={`pin-drop ${hasImg ? "has-image" : ""}`}
          onClick={() => !disabled && ref.current?.click()}
        >
          {hasImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={chosenTitle || "composed pin"}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }}
            />
          ) : (
            <>
              <div className="icon-big">↑</div>
              <div className="lbl">{uploading ? "Uploading…" : "Drop composed pin here"}</div>
              <div className="sub-lbl">1000 × 1500 · png / jpg</div>
            </>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          {hasImg && (
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}>
                preview on pin
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.3, color: "var(--ink-soft)" }}>
                {chosenTitle || "—"}
              </div>
            </>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={disabled}
            onClick={() => ref.current?.click()}
            style={{ alignSelf: "flex-start" }}
          >
            <UploadIcon /> {hasImg ? "Replace upload" : "Upload pin"}
          </button>
        </div>
      </div>
    </>
  );
}
