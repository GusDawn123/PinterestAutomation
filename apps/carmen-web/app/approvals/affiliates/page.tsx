"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  api,
  type AffiliateProduct,
  type AffiliateRetailer,
  type AffiliatesApprovalPayload,
  type ImageAffiliateSlot,
} from "../../../lib/api";
import { StageRail } from "../../../components/stage-rail";
import { ActionBar } from "../../../components/action-bar";
import { useToast } from "../../../components/toast";

const RETAILERS: { value: AffiliateRetailer; label: string }[] = [
  { value: "amazon",       label: "Amazon" },
  { value: "lowes",        label: "Lowe's" },
  { value: "target",       label: "Target" },
  { value: "dharma_crafts",label: "Dharma Crafts" },
  { value: "sounds_true",  label: "Sounds True" },
  { value: "other",        label: "Other" },
];

const LINK_RETAILERS: AffiliateRetailer[] = ["amazon", "lowes", "target", "dharma_crafts", "sounds_true"];

function retailerLabel(r: AffiliateRetailer) { return RETAILERS.find((x) => x.value === r)?.label ?? r; }

function retailerUrl(retailer: AffiliateRetailer, q: string): string {
  const enc = encodeURIComponent(q);
  switch (retailer) {
    case "amazon":       return `https://www.amazon.com/s?k=${enc}&s=exact-aware-popularity-rank`;
    case "lowes":        return `https://www.lowes.com/search?searchTerm=${enc}&sortMethod=rating-desc`;
    case "target":       return `https://www.target.com/s?searchTerm=${enc}&sortBy=bestselling`;
    case "dharma_crafts":return `https://www.dharmacrafts.com/search?q=${enc}`;
    case "sounds_true":  return `https://www.soundstrue.com/search?q=${enc}`;
    default:             return `https://www.google.com/search?q=${enc}`;
  }
}

type DraftProduct = AffiliateProduct & { id: string };

export default function AffiliatesApprovalPage() {
  return (
    <Suspense fallback={<div className="page-inner"><div className="skeleton" style={{ height: 56, borderRadius: 12, marginBottom: 28 }} /><div className="skeleton" style={{ height: 300 }} /></div>}>
      <AffiliatesApproval />
    </Suspense>
  );
}

function AffiliatesApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId") ?? "";

  const [slots, setSlots] = useState<ImageAffiliateSlot[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftProduct[]>>({});
  const [activeSlot, setActiveSlot] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ editUrl: string; previewUrl: string } | null>(null);
  const [modal, setModal] = useState<{ slotPosition: number; productId: string } | null>(null);

  useEffect(() => {
    if (!approvalId) { setError("Missing approvalId"); setLoading(false); return; }
    api.getApproval(approvalId)
      .then((a) => {
        const payload = a.payload as AffiliatesApprovalPayload;
        setSlots(payload.slots);
        const seed: Record<number, DraftProduct[]> = {};
        for (const s of payload.slots) {
          seed[s.slotPosition] = (s.products ?? []).map((p, i) => ({ ...p, id: `${s.slotPosition}-seed-${i}` }));
        }
        setDrafts(seed);
        setActiveSlot(payload.slots[0]?.slotPosition ?? 0);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  function slotDone(pos: number) {
    return (drafts[pos] ?? []).length > 0 && (drafts[pos] ?? []).every((p) => p.rawHtml.trim().length > 0);
  }

  const canSubmit = useMemo(
    () => slots.length > 0 && slots.every((s) => slotDone(s.slotPosition)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, drafts],
  );

  function addProduct(slotPosition: number) {
    setDrafts((prev) => {
      const list = prev[slotPosition] ?? [];
      if (list.length >= 5) return prev;
      return { ...prev, [slotPosition]: [...list, { id: `${slotPosition}-${Date.now()}`, retailer: "amazon" as AffiliateRetailer, rawHtml: "" }] };
    });
  }

  function removeProduct(slotPosition: number, id: string) {
    setDrafts((prev) => ({ ...prev, [slotPosition]: (prev[slotPosition] ?? []).filter((p) => p.id !== id) }));
  }

  function updateProduct(slotPosition: number, id: string, patch: Partial<AffiliateProduct>) {
    setDrafts((prev) => ({
      ...prev,
      [slotPosition]: (prev[slotPosition] ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  async function handleSubmit() {
    if (!workflowRunId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const decision = {
        slots: slots.map((s) => ({
          slotPosition: s.slotPosition,
          products: (drafts[s.slotPosition] ?? []).map(({ id: _id, ...p }) => ({
            retailer: p.retailer,
            rawHtml: p.rawHtml.trim(),
            ...(p.displayLabel?.trim() ? { displayLabel: p.displayLabel.trim() } : {}),
          })),
        })),
      };
      await api.decideAffiliates(workflowRunId, decision);
      const wp = await api.publishToWordpress(workflowRunId);
      setSuccess({ editUrl: wp.editUrl, previewUrl: wp.previewUrl });
      toast("Published to WordPress");
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
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  );

  if (success) return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Complete</div>
        <h1 className="page-title">Off to <em>WordPress</em></h1>
      </div>
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ marginBottom: 16, color: "var(--green)", fontFamily: "var(--font-serif)", fontSize: 18 }}>✓ Affiliate blocks injected</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={success.editUrl} target="_blank" rel="noreferrer" className="btn btn-primary">Edit in WordPress</a>
          <a href={success.previewUrl} target="_blank" rel="noreferrer" className="btn btn-ghost">Preview</a>
          <button className="btn btn-ghost" onClick={() => router.push("/dashboard")}>Dashboard — next: compose pins</button>
        </div>
      </div>
    </div>
  );

  const currentSlot = slots.find((s) => s.slotPosition === activeSlot);
  const currentProducts = drafts[activeSlot] ?? [];
  const modalProduct = modal ? (drafts[modal.slotPosition] ?? []).find((p) => p.id === modal.productId) : null;

  return (
    <div className="page-inner">
      <StageRail current="/approvals/affiliates" runId={workflowRunId} />

      <div className="page-header">
        <div className="page-eyebrow">Stage 4 of 6</div>
        <h1 className="page-title">Add <em>affiliates</em></h1>
        <div className="page-sub">Pick 4★+ products from each suggested search. Paste the SiteStripe HTML below each image slot.</div>
      </div>

      {error && <div style={{ padding: "12px 16px", background: "var(--red-soft)", color: "var(--red)", borderRadius: 10, marginBottom: 20, fontSize: 13 }}>{error}</div>}

      {/* Slot tabs */}
      <div className="aff-tabs">
        {slots.map((s) => {
          const done = slotDone(s.slotPosition);
          const active = s.slotPosition === activeSlot;
          return (
            <button
              key={s.slotPosition}
              type="button"
              className={`aff-tab ${active ? "active" : ""} ${done ? "done" : ""}`}
              onClick={() => setActiveSlot(s.slotPosition)}
            >
              <div className="aff-tab-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.imageUrl} alt={s.altText ?? `slot ${s.slotPosition}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {done && <div className="aff-tab-check">✓</div>}
              </div>
              <div className="aff-tab-body">
                <div className="aff-tab-n">Slot {s.slotPosition + 1}</div>
                <div className="aff-tab-lbl">{(drafts[s.slotPosition] ?? []).length} product{(drafts[s.slotPosition] ?? []).length !== 1 ? "s" : ""}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Slot detail */}
      {currentSlot && (
        <div className="aff-detail" style={{ marginBottom: 80 }}>
          <div className="aff-detail-head">
            <div className="aff-detail-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentSlot.imageUrl} alt={currentSlot.altText ?? `slot ${activeSlot}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, marginBottom: 8 }}>Image {activeSlot + 1}</div>
              {currentSlot.altText && <div style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 10, fontStyle: "italic" }}>{currentSlot.altText}</div>}
              <div className="aff-detected">
                <span className="aff-detected-lbl">Suggested searches</span>
                {currentSlot.suggestedQueries.map((q, qi) => (
                  <div key={qi} style={{ position: "relative" }}>
                    <span className="aff-query">{q}</span>
                    <div className="aff-queries" style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {LINK_RETAILERS.map((r) => (
                        <a
                          key={r}
                          href={retailerUrl(r, q)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--accent-ink)", background: "var(--accent-soft)", padding: "1px 6px", borderRadius: 4, textDecoration: "none" }}
                        >
                          {retailerLabel(r)}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="aff-product-list">
            {currentProducts.map((p, idx) => (
              <div key={p.id} className={`aff-product-card ${p.rawHtml.trim() ? "picked" : ""}`}>
                <span className="aff-product-retailer">{retailerLabel(p.retailer)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="aff-product-label">{p.displayLabel || `Product ${idx + 1}`}</div>
                  {p.rawHtml.trim()
                    ? <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--green)", marginTop: 2 }}>✓ HTML pasted</div>
                    : <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-faint)", marginTop: 2 }}>No HTML yet</div>
                  }
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setModal({ slotPosition: activeSlot, productId: p.id })}>
                    {p.rawHtml.trim() ? "Edit" : "Paste HTML"}
                  </button>
                  <button type="button" className="btn btn-danger" style={{ padding: "4px 8px" }} onClick={() => removeProduct(activeSlot, p.id)}>×</button>
                </div>
              </div>
            ))}

            {currentProducts.length === 0 && (
              <div className="aff-none">
                <span style={{ color: "var(--ink-muted)", fontSize: 13 }}>No products yet — add up to 5 per slot.</span>
                <button type="button" className="btn btn-ghost" onClick={() => addProduct(activeSlot)}>+ Add first product</button>
              </div>
            )}

            {currentProducts.length > 0 && currentProducts.length < 5 && (
              <button type="button" className="btn btn-ghost" style={{ borderStyle: "dashed", alignSelf: "flex-start" }} onClick={() => addProduct(activeSlot)}>
                + Add product
              </button>
            )}
          </div>
        </div>
      )}

      {/* Paste modal */}
      {modal && modalProduct && (
        <div className="aff-modal-wrap" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="aff-modal">
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, marginBottom: 4 }}>Paste affiliate HTML</div>
            <div style={{ marginBottom: 14 }}>
              <div className="field-label" style={{ marginBottom: 6 }}><span>Retailer</span></div>
              <select
                className="field"
                value={modalProduct.retailer}
                onChange={(e) => updateProduct(modal.slotPosition, modal.productId, { retailer: e.target.value as AffiliateRetailer })}
              >
                {RETAILERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div className="field-label"><span>Display label (optional)</span></div>
              <input className="field" value={modalProduct.displayLabel ?? ""} placeholder="Product name" onChange={(e) => updateProduct(modal.slotPosition, modal.productId, { displayLabel: e.target.value })} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div className="field-label">
                <span>SiteStripe / partner HTML</span>
                <span className="field-hint">{modalProduct.rawHtml.length} chars</span>
              </div>
              <textarea
                className="field mono"
                rows={6}
                value={modalProduct.rawHtml}
                placeholder="Paste HTML snippet here…"
                onChange={(e) => updateProduct(modal.slotPosition, modal.productId, { rawHtml: e.target.value })}
              />
              <div className="aff-modal-tip">Get this from SiteStripe (Amazon) or your retailer's partner tool. Look for the "Text" or "Text+Image" embed option.</div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => setModal(null)}>Save</button>
            </div>
          </div>
        </div>
      )}

      <ActionBar
        onApprove={handleSubmit}
        approveLabel="Confirm affiliates → push to WordPress"
        onBack="/approvals"
        disabled={!canSubmit}
        loading={submitting}
      />
    </div>
  );
}
