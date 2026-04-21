"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type AffiliateProduct,
  type AffiliateRetailer,
  type AffiliatesApprovalPayload,
  type ApprovalRequest,
  type ImageAffiliateSlot,
} from "../../../lib/api";
import { PageContainer } from "../../../components/page-container";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Input } from "../../../components/ui/input";
import { Textarea } from "../../../components/ui/textarea";
import { Skeleton } from "../../../components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";

const RETAILERS: { value: AffiliateRetailer; label: string }[] = [
  { value: "amazon", label: "Amazon" },
  { value: "lowes", label: "Lowe's" },
  { value: "target", label: "Target" },
  { value: "dharma_crafts", label: "Dharma Crafts" },
  { value: "sounds_true", label: "Sounds True" },
  { value: "other", label: "Other" },
];

const LINK_RETAILERS: AffiliateRetailer[] = [
  "amazon",
  "lowes",
  "target",
  "dharma_crafts",
  "sounds_true",
];

function getRetailerSearchUrl(retailer: AffiliateRetailer, query: string): string {
  const q = encodeURIComponent(query);
  switch (retailer) {
    case "amazon":
      return `https://www.amazon.com/s?k=${q}&s=exact-aware-popularity-rank`;
    case "lowes":
      return `https://www.lowes.com/search?searchTerm=${q}&sortMethod=rating-desc`;
    case "target":
      return `https://www.target.com/s?searchTerm=${q}&sortBy=bestselling`;
    case "dharma_crafts":
      return `https://www.dharmacrafts.com/search?q=${q}`;
    case "sounds_true":
      return `https://www.soundstrue.com/search?q=${q}`;
    default:
      return `https://www.google.com/search?q=${q}`;
  }
}

function retailerLabel(retailer: AffiliateRetailer): string {
  return RETAILERS.find((r) => r.value === retailer)?.label ?? retailer;
}

type DraftProduct = AffiliateProduct & { id: string };

export default function AffiliatesApprovalPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AffiliatesApproval />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <PageContainer size="wide">
      <PageHeader title="Add affiliate products" description="Loading affiliate suggestions…" backHref="/approvals" />
      <div className="grid gap-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </PageContainer>
  );
}

function AffiliatesApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId");

  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [slots, setSlots] = useState<ImageAffiliateSlot[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ editUrl: string; previewUrl: string } | null>(null);

  useEffect(() => {
    if (!approvalId) {
      setError("Missing approvalId in URL");
      setLoading(false);
      return;
    }
    api
      .getApproval(approvalId)
      .then((a) => {
        setApproval(a);
        const payload = a.payload as AffiliatesApprovalPayload;
        setSlots(payload.slots);
        const seed: Record<number, DraftProduct[]> = {};
        for (const s of payload.slots) {
          seed[s.slotPosition] = (s.products ?? []).map((p, i) => ({
            ...p,
            id: `${s.slotPosition}-seed-${i}`,
          }));
        }
        setDrafts(seed);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  const canSubmit = useMemo(
    () =>
      slots.length > 0 &&
      slots.every((s) => (drafts[s.slotPosition] ?? []).every((p) => p.rawHtml.trim().length > 0)),
    [slots, drafts],
  );

  function addProduct(slotPosition: number) {
    setDrafts((prev) => {
      const list = prev[slotPosition] ?? [];
      if (list.length >= 5) return prev;
      return {
        ...prev,
        [slotPosition]: [
          ...list,
          {
            id: `${slotPosition}-${Date.now()}-${list.length}`,
            retailer: "amazon",
            rawHtml: "",
          },
        ],
      };
    });
  }

  function removeProduct(slotPosition: number, id: string) {
    setDrafts((prev) => ({
      ...prev,
      [slotPosition]: (prev[slotPosition] ?? []).filter((p) => p.id !== id),
    }));
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
            ...(p.displayLabel && p.displayLabel.trim() ? { displayLabel: p.displayLabel.trim() } : {}),
          })),
        })),
      };
      await api.decideAffiliates(workflowRunId, decision);
      const wp = await api.publishToWordpress(workflowRunId);
      setSuccess({ editUrl: wp.editUrl, previewUrl: wp.previewUrl });
      toast.success("Draft published to WordPress");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error && !slots.length) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Add affiliate products" backHref="/approvals" />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      </PageContainer>
    );
  }
  if (slots.length === 0) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Add affiliate products" backHref="/approvals" />
        <p className="text-sm text-muted-foreground">No affiliate slots found.</p>
      </PageContainer>
    );
  }

  if (success) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Draft saved to WordPress" backHref="/dashboard" backLabel="Dashboard" />
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                Affiliate blocks injected under each image. Review and publish from WordPress.
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href={success.editUrl} target="_blank" rel="noreferrer">
                  Edit in WordPress <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button asChild variant="ghost">
                <a href={success.previewUrl} target="_blank" rel="noreferrer">
                  Preview <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
            <div>
              <Button onClick={() => router.push(`/dashboard?runId=${workflowRunId ?? ""}`)}>
                Back to dashboard — next: compose pins
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Add affiliate products"
        description="Claude picked a few product queries per image. Open the retailer link (sorted by bestseller / rating where supported), grab the SiteStripe or partner-tool HTML, and paste it in. Up to 5 products per image."
        backHref="/approvals"
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-muted-foreground">
          Prefer 4★+ with many reviews — high-volume, mainstream products convert best.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {slots.map((slot) => {
          const products = drafts[slot.slotPosition] ?? [];
          return (
            <Card key={slot.slotPosition}>
              <CardContent className="flex flex-col gap-4 py-5 md:flex-row">
                <div className="md:w-[220px] md:shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slot.imageUrl}
                    alt={slot.altText ?? `slot ${slot.slotPosition}`}
                    className="aspect-square w-full rounded-lg border border-border object-cover"
                  />
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Slot {slot.slotPosition}</h3>
                    {slot.altText && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{slot.altText}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {slot.suggestedQueries.map((q, qi) => (
                      <QueryChip key={qi} query={q} />
                    ))}
                  </div>

                  <div className="flex flex-col gap-2">
                    {products.map((p, idx) => (
                      <ProductRow
                        key={p.id}
                        index={idx}
                        product={p}
                        onChange={(patch) => updateProduct(slot.slotPosition, p.id, patch)}
                        onRemove={() => removeProduct(slot.slotPosition, p.id)}
                      />
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addProduct(slot.slotPosition)}
                      disabled={products.length >= 5 || submitting}
                      className="border-dashed self-start"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {products.length >= 5 ? "Max 5 products" : "Add product"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" variant="success" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {submitting ? "Publishing…" : "Confirm affiliates → push to WordPress"}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
      </div>

      {approval && (
        <p className="mt-6 text-xs text-muted-foreground">
          Approval {approval.id} · status {approval.status}
        </p>
      )}
    </PageContainer>
  );
}

function QueryChip({ query }: { query: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
      <span className="font-medium">{query}</span>
      <span className="flex items-center gap-1">
        {LINK_RETAILERS.map((r) => (
          <a
            key={r}
            href={getRetailerSearchUrl(r, query)}
            target="_blank"
            rel="noreferrer"
            title={`Search ${retailerLabel(r)}`}
            className="rounded px-1 text-[0.65rem] text-primary hover:underline"
          >
            {retailerLabel(r)}
          </a>
        ))}
      </span>
    </div>
  );
}

function ProductRow({
  index,
  product,
  onChange,
  onRemove,
}: {
  index: number;
  product: DraftProduct;
  onChange: (patch: Partial<AffiliateProduct>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">#{index + 1}</span>
        <Select
          value={product.retailer}
          onValueChange={(v) => onChange({ retailer: v as AffiliateRetailer })}
        >
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RETAILERS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="text"
          placeholder="Display label (optional)"
          value={product.displayLabel ?? ""}
          onChange={(e) => onChange({ displayLabel: e.target.value })}
          className="h-8 flex-1 min-w-[160px] text-xs"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
          aria-label="Remove product"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        value={product.rawHtml}
        onChange={(e) => onChange({ rawHtml: e.target.value })}
        placeholder="Paste SiteStripe / partner-tool HTML snippet"
        rows={3}
        className="font-mono text-xs"
      />
    </div>
  );
}
