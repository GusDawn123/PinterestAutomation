"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, type ImageSlotDraft } from "../../../lib/api";
import { StageRail } from "../../../components/stage-rail";
import { ActionBar } from "../../../components/action-bar";
import { useToast } from "../../../components/toast";

interface ImagesPayload { slots: ImageSlotDraft[]; }

type SlotStatus = "empty" | "uploading" | "analyzing" | "ready";

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

export default function ImagesApprovalPage() {
  return (
    <Suspense
      fallback={
        <div className="page-inner">
          <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      }
    >
      <ImagesApproval />
    </Suspense>
  );
}

function ImagesApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId") ?? "";

  const [slots, setSlots] = useState<ImageSlotDraft[]>([]);
  const [txStatus, setTxStatus] = useState<Record<number, SlotStatus>>({});
  const [reanalyzePrompts, setReanalyzePrompts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!approvalId) {
      setError("Missing approvalId");
      setLoading(false);
      return;
    }
    api
      .getApproval(approvalId)
      .then((a) => {
        const payload = a.payload as ImagesPayload;
        setSlots(payload.slots);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  const slotStatus = (slot: ImageSlotDraft): SlotStatus => {
    const tx = txStatus[slot.slotPosition];
    if (tx === "uploading" || tx === "analyzing") return tx;
    if (!slot.uploadedImageUrl) return "empty";
    return "ready";
  };

  const readySlots = useMemo(
    () => slots.filter((s) => s.uploadedImageUrl && s.title.trim().length > 0).length,
    [slots],
  );
  const allReady = useMemo(
    () =>
      slots.length > 0 &&
      slots.every(
        (s) => s.uploadedImageUrl.length > 0 && s.title.trim().length > 0 && s.altText.trim().length > 0,
      ),
    [slots],
  );

  function patchSlot(slot: ImageSlotDraft) {
    setSlots((xs) => xs.map((s) => (s.slotPosition === slot.slotPosition ? slot : s)));
  }

  function setTx(slotPos: number, status: SlotStatus | null) {
    setTxStatus((prev) => {
      if (!status) {
        const { [slotPos]: _drop, ...rest } = prev;
        return rest;
      }
      return { ...prev, [slotPos]: status };
    });
  }

  async function handleUpload(slotPosition: number, file: File) {
    if (!workflowRunId) return;
    setTx(slotPosition, "uploading");
    try {
      // Two-phase UX: show "uploading…" briefly, then "analyzing…" while vision runs.
      setTimeout(() => setTx(slotPosition, "analyzing"), 400);
      const { slot } = await api.uploadImage(workflowRunId, slotPosition, file);
      patchSlot(slot);
      setTx(slotPosition, null);
      toast(
        slot.title
          ? `Slot ${slotPosition + 1}: Claude wrote the copy`
          : `Slot ${slotPosition + 1} uploaded — analysis failed, edit manually`,
      );
    } catch (e) {
      setTx(slotPosition, null);
      toast((e as Error).message, "err");
    }
  }

  async function handleReanalyze(slotPosition: number) {
    if (!workflowRunId) return;
    const instructions = (reanalyzePrompts[slotPosition] ?? "").trim();
    setTx(slotPosition, "analyzing");
    try {
      const { slot } = await api.reanalyzeImage(workflowRunId, slotPosition, {
        ...(instructions ? { instructions } : {}),
      });
      patchSlot(slot);
      setTx(slotPosition, null);
      setReanalyzePrompts((prev) => ({ ...prev, [slotPosition]: "" }));
      toast(`Slot ${slotPosition + 1}: rewrote title + alt`);
    } catch (e) {
      setTx(slotPosition, null);
      toast((e as Error).message, "err");
    }
  }

  async function handleReplace(slotPosition: number) {
    if (!workflowRunId) return;
    try {
      const { slot } = await api.clearImage(workflowRunId, slotPosition);
      patchSlot(slot);
      setReanalyzePrompts((prev) => ({ ...prev, [slotPosition]: "" }));
    } catch (e) {
      toast((e as Error).message, "err");
    }
  }

  async function handleSubmit() {
    if (!workflowRunId || !allReady) return;
    setSubmitting(true);
    setError(null);
    try {
      const decision = {
        slots: slots.map((s) => ({
          slotPosition: s.slotPosition,
          titleOverride: s.title,
          altTextOverride: s.altText,
        })),
      };
      await api.decideImages(workflowRunId, decision);
      const { approvalId: affId } = await api.startAffiliates(workflowRunId);
      router.push(`/approvals/affiliates?approvalId=${affId}&runId=${workflowRunId}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast(msg, "err");
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="page-inner">
        <div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} />
        <div className="skeleton" style={{ width: 300, height: 48, marginBottom: 24 }} />
        {[0, 1].map((i) => (
          <div key={i} className="img-slot">
            <div className="img-slot-thumb">
              <div className="skeleton" style={{ height: "100%", borderRadius: 8 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 14, marginBottom: 10 }} />
              <div className="skeleton" style={{ height: 60 }} />
            </div>
          </div>
        ))}
      </div>
    );

  return (
    <div className="page-inner">
      <StageRail current="/approvals/images" runId={workflowRunId} />

      <div className="page-header">
        <div className="page-eyebrow">Stage 3 of 6</div>
        <h1 className="page-title">
          <em>{readySlots}</em> of {slots.length} image{slots.length !== 1 ? "s" : ""} ready
        </h1>
        <div className="page-sub">
          Upload your own photography for each slot. Claude reads the photo, reads the draft, and writes a
          pin title + alt description using your keyword. You always have the last word.
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--red-soft)",
            color: "var(--red)",
            borderRadius: 10,
            marginBottom: 20,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginBottom: 80 }}>
        {slots.map((slot) => (
          <ImageSlot
            key={slot.slotPosition}
            slot={slot}
            status={slotStatus(slot)}
            reanalyzePrompt={reanalyzePrompts[slot.slotPosition] ?? ""}
            onUpload={(f) => handleUpload(slot.slotPosition, f)}
            onReanalyze={() => handleReanalyze(slot.slotPosition)}
            onReplace={() => handleReplace(slot.slotPosition)}
            onEditTitle={(v) => patchSlot({ ...slot, title: v })}
            onEditAlt={(v) => patchSlot({ ...slot, altText: v })}
            onEditReanalyzePrompt={(v) =>
              setReanalyzePrompts((prev) => ({ ...prev, [slot.slotPosition]: v }))
            }
            disabled={submitting}
          />
        ))}
      </div>

      <ActionBar
        onApprove={handleSubmit}
        approveLabel="Confirm images → affiliates"
        onBack="/approvals"
        disabled={!allReady}
        loading={submitting}
        metaText={allReady ? undefined : `${slots.length - readySlots} slot${slots.length - readySlots !== 1 ? "s" : ""} remaining`}
      />
    </div>
  );
}

function ImageSlot({
  slot,
  status,
  reanalyzePrompt,
  onUpload,
  onReanalyze,
  onReplace,
  onEditTitle,
  onEditAlt,
  onEditReanalyzePrompt,
  disabled,
}: {
  slot: ImageSlotDraft;
  status: SlotStatus;
  reanalyzePrompt: string;
  onUpload: (f: File) => void;
  onReanalyze: () => void;
  onReplace: () => void;
  onEditTitle: (v: string) => void;
  onEditAlt: (v: string) => void;
  onEditReanalyzePrompt: (v: string) => void;
  disabled: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { slotPosition, promptHint, uploadedImageUrl, title, altText, detectedTags } = slot;
  const ready = status === "ready";

  return (
    <div className={`img-slot ${ready ? "approved" : ""}`}>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />

      <div
        className="img-slot-thumb"
        style={status === "empty" ? { cursor: "pointer" } : undefined}
        onClick={() => status === "empty" && !disabled && fileRef.current?.click()}
      >
        {status === "empty" && (
          <div className="img-slot-thumb empty" style={{ position: "absolute", inset: 0 }}>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontStyle: "italic", color: "var(--accent)", marginBottom: 4 }}>↑</div>
            <div>Drop photo or click</div>
            <div className="field-hint" style={{ marginTop: 4 }}>jpg / png · up to 15 MB</div>
          </div>
        )}
        {(status === "uploading" || status === "analyzing") && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "var(--bg-sunken)" }}>
            <div className="skeleton" style={{ width: "80%", height: 12 }} />
          </div>
        )}
        {ready && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={uploadedImageUrl}
              alt={altText || `slot ${slotPosition}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
            />
            <div className="img-slot-num">#{String(slotPosition + 1).padStart(2, "0")}</div>
          </>
        )}
      </div>

      <div className="img-slot-main">
        <div className="field-label">
          <span>Slot {slotPosition + 1}{promptHint ? ` · ${promptHint}` : ""}</span>
          {status === "ready" && <span className="chip good">✓ AI copy ready</span>}
          {status === "analyzing" && (
            <span className="chip warn">
              <span className="pulse-dot" style={{ width: 6, height: 6, background: "var(--accent)" }} />
              Claude is looking…
            </span>
          )}
          {status === "uploading" && <span className="chip plain">uploading…</span>}
          {status === "empty" && <span className="chip plain">no file</span>}
        </div>

        {status === "empty" && (
          <div
            style={{
              padding: "12px 0 2px",
              color: "var(--ink-muted)",
              fontSize: 13,
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
            }}
          >
            {promptHint
              ? `Suggested: a photo that shows ${promptHint}. Upload whatever fits your post — Claude adapts to what you give it.`
              : "Once you upload, Claude will read the photo and draft a title + alt text using the post's keyword."}
          </div>
        )}

        {status === "analyzing" && (
          <div className="ai-working">
            <div className="ai-steps">
              <div className="ai-step done">✓ Uploaded to WordPress media</div>
              <div className="ai-step active">
                <span className="pulse-dot" style={{ width: 6, height: 6, background: "var(--accent)" }} />
                Vision pass — Claude is reading the photo
              </div>
              <div className="ai-step pending">· Writing title + alt text from the keyword</div>
            </div>
          </div>
        )}

        {ready && (
          <>
            {detectedTags.length > 0 && (
              <>
                <div className="field-label" style={{ marginTop: 12 }}>
                  <span>Claude detected</span>
                  <span className="field-hint">{detectedTags.length} visual elements</span>
                </div>
                <div className="detect-tags">
                  {detectedTags.map((t) => (
                    <span key={t} className="detect-tag">
                      {t}
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className="field-label" style={{ marginTop: 14 }}>
              <span>Pin title · AI-generated</span>
              <span className="field-hint">{title.length} chars</span>
            </div>
            <input
              className="field serif"
              value={title}
              onChange={(e) => onEditTitle(e.target.value)}
              style={{ fontSize: 18, padding: "10px 12px" }}
            />

            <div className="field-label" style={{ marginTop: 10 }}>
              <span>Alt / description · AI-generated</span>
              <span className="field-hint">{altText.length} chars · ≤ 125 ideal</span>
            </div>
            <textarea
              className="field"
              value={altText}
              onChange={(e) => onEditAlt(e.target.value)}
              style={{ minHeight: 64 }}
            />

            <div className="field-label" style={{ marginTop: 14 }}>
              <span>Rewrite title + alt · optional instructions</span>
              <span className="field-hint">"more whimsical", "focus on the lamp"…</span>
            </div>
            <input
              className="field"
              value={reanalyzePrompt}
              placeholder="Leave blank for a plain re-analysis"
              onChange={(e) => onEditReanalyzePrompt(e.target.value)}
            />
          </>
        )}

        <div className="img-slot-actions" style={{ marginTop: status === "empty" ? 12 : 14 }}>
          {status === "empty" && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
            >
              <UploadIcon /> Upload photo
            </button>
          )}
          {ready && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onReanalyze}
                disabled={disabled}
              >
                <RefreshIcon /> Rewrite title + alt
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onReplace}
                disabled={disabled}
              >
                <UploadIcon /> Replace photo
              </button>
            </>
          )}
          {(status === "uploading" || status === "analyzing") && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)" }}>
              working…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
