"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, ImagePlus, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, type ApprovalRequest, type ImageSlotDraft } from "../../../lib/api";
import { PageContainer } from "../../../components/page-container";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Textarea } from "../../../components/ui/textarea";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";

interface ImagesPayload {
  slots: ImageSlotDraft[];
}

export default function ImageApprovalPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ImageApproval />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <PageContainer size="wide">
      <PageHeader title="Upload blog images" description="Loading image slots…" backHref="/approvals" />
      <div className="grid gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </PageContainer>
  );
}

function ImageApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId");

  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [slots, setSlots] = useState<ImageSlotDraft[]>([]);
  const [altOverrides, setAltOverrides] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        const payload = a.payload as ImagesPayload;
        setSlots(payload.slots);
        const seed: Record<number, string> = {};
        for (const s of payload.slots) {
          if (s.altTextSuggestion) seed[s.slotPosition] = s.altTextSuggestion;
        }
        setAltOverrides(seed);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  const allUploaded = useMemo(
    () => slots.length > 0 && slots.every((s) => !!s.uploadedImageUrl),
    [slots],
  );

  async function handleUpload(slotPosition: number, file: File) {
    if (!workflowRunId) return;
    setUploading(slotPosition);
    setError(null);
    try {
      const { slot } = await api.uploadImage(workflowRunId, slotPosition, file);
      setSlots((prev) => prev.map((s) => (s.slotPosition === slotPosition ? slot : s)));
      if (slot.altTextSuggestion) {
        setAltOverrides((prev) => ({
          ...prev,
          [slotPosition]: prev[slotPosition] ?? slot.altTextSuggestion ?? "",
        }));
      }
      toast.success(`Slot ${slotPosition} uploaded`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  }

  async function handleSubmit() {
    if (!workflowRunId || !allUploaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const decision = {
        slots: slots.map((s) => {
          const edited = altOverrides[s.slotPosition]?.trim();
          const suggested = s.altTextSuggestion?.trim() ?? "";
          return edited && edited !== suggested
            ? { slotPosition: s.slotPosition, altTextOverride: edited }
            : { slotPosition: s.slotPosition };
        }),
      };
      await api.decideImages(workflowRunId, decision);
      const { approvalId: affiliateApprovalId } = await api.startAffiliates(workflowRunId);
      router.push(`/approvals/affiliates?approvalId=${affiliateApprovalId}&runId=${workflowRunId}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error && !slots.length) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Upload blog images" backHref="/approvals" />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      </PageContainer>
    );
  }
  if (slots.length === 0) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Upload blog images" backHref="/approvals" />
        <p className="text-sm text-muted-foreground">No image slots found.</p>
      </PageContainer>
    );
  }

  const uploadedCount = slots.filter((s) => !!s.uploadedImageUrl).length;

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Upload blog images"
        description="Generate each image yourself (ChatGPT, Midjourney, etc.) and upload one per slot. Alt-text is auto-suggested after upload — tweak it if you want."
        backHref="/approvals"
        actions={
          <Badge variant={allUploaded ? "success" : "secondary"}>
            {uploadedCount}/{slots.length} uploaded
          </Badge>
        }
      />

      <div className="flex flex-col gap-4">
        {slots.map((slot) => {
          const uploaded = !!slot.uploadedImageUrl;
          const isUploading = uploading === slot.slotPosition;
          return (
            <Card key={slot.slotPosition}>
              <CardContent className="flex flex-col gap-4 py-5 md:flex-row">
                <div className="md:w-[240px] md:shrink-0">
                  {uploaded ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slot.uploadedImageUrl}
                      alt={altOverrides[slot.slotPosition] ?? slot.altTextSuggestion ?? `slot ${slot.slotPosition}`}
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground">
                      <ImagePlus className="h-6 w-6" />
                      <span className="text-xs">Not uploaded</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">Slot {slot.slotPosition}</h3>
                    {uploaded && (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" /> uploaded
                      </Badge>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{slot.promptHint}</p>

                  <div className="flex flex-wrap items-center gap-2">
                    <FileInput
                      slotPosition={slot.slotPosition}
                      onFile={(f) => handleUpload(slot.slotPosition, f)}
                      disabled={isUploading || submitting}
                      label={uploaded ? "Replace" : "Upload image"}
                    />
                    {isUploading && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Uploading & generating alt text…
                      </span>
                    )}
                  </div>

                  {uploaded && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`alt-${slot.slotPosition}`} className="text-xs text-muted-foreground">
                        Alt text
                      </Label>
                      <Textarea
                        id={`alt-${slot.slotPosition}`}
                        rows={2}
                        value={altOverrides[slot.slotPosition] ?? ""}
                        onChange={(e) =>
                          setAltOverrides((prev) => ({ ...prev, [slot.slotPosition]: e.target.value }))
                        }
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          size="lg"
          variant="success"
          onClick={handleSubmit}
          disabled={!allUploaded || submitting || uploading !== null}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {submitting ? "Saving…" : "Confirm images → next: affiliates"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={() => router.push("/dashboard")}>
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

function FileInput({
  slotPosition,
  onFile,
  disabled,
  label,
}: {
  slotPosition: number;
  onFile: (file: File) => void;
  disabled: boolean;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        aria-label={`upload image for slot ${slotPosition}`}
      >
        <Upload className="h-3.5 w-3.5" />
        {label}
      </Button>
    </>
  );
}
