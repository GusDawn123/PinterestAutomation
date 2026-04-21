"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  api,
  type ApprovalRequest,
  type PinsApprovalPayload,
} from "../../../lib/api";
import { PageContainer } from "../../../components/page-container";
import { PageHeader } from "../../../components/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { Badge } from "../../../components/ui/badge";
import { Skeleton } from "../../../components/ui/skeleton";
import { Switch } from "../../../components/ui/switch";
import { Label } from "../../../components/ui/label";

export default function PinsApprovalPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PinsApproval />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <PageContainer size="wide">
      <PageHeader title="Upload & review pins" description="Loading composed pins…" backHref="/approvals" />
      <div className="grid gap-4">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </PageContainer>
  );
}

function PinsApproval() {
  const params = useSearchParams();
  const router = useRouter();
  const approvalId = params.get("approvalId");
  const workflowRunId = params.get("runId");

  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
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
    if (!approvalId) {
      setError("Missing approvalId in URL");
      setLoading(false);
      return;
    }
    api
      .getApproval(approvalId)
      .then((a) => {
        setApproval(a);
        const p = a.payload as PinsApprovalPayload;
        setPayload(p);
        const initial: Record<number, number> = {};
        p.pins.forEach((pin) => {
          initial[pin.pinIndex] = 0;
        });
        setChoices(initial);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [approvalId]);

  const totalPins = payload?.pins.length ?? 0;
  const allChosen = useMemo(
    () => totalPins > 0 && Object.keys(choices).length === totalPins,
    [totalPins, choices],
  );
  const allUploaded = useMemo(
    () =>
      !!payload &&
      payload.pins.length > 0 &&
      payload.pins.every((p) => !!p.composedImageUrl),
    [payload],
  );

  async function handleUpload(pinIndex: number, file: File) {
    if (!workflowRunId) return;
    setUploading(pinIndex);
    setError(null);
    try {
      const { pin } = await api.uploadPin(workflowRunId, pinIndex, file);
      setPayload((prev) =>
        prev ? { ...prev, pins: prev.pins.map((p) => (p.pinIndex === pinIndex ? pin : p)) } : prev,
      );
      toast.success(`Pin #${pinIndex + 1} uploaded`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(null);
    }
  }

  async function handleRegenerate(pinIndex: number) {
    if (!workflowRunId) return;
    setRegenerating(pinIndex);
    setError(null);
    try {
      const { pin } = await api.regeneratePin(workflowRunId, pinIndex);
      setPayload((prev) =>
        prev ? { ...prev, pins: prev.pins.map((p) => (p.pinIndex === pinIndex ? pin : p)) } : prev,
      );
      setChoices((prev) => ({ ...prev, [pinIndex]: 0 }));
      toast.success(`Regenerated copy for pin #${pinIndex + 1}`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setRegenerating(null);
    }
  }

  async function handleSubmit() {
    if (!workflowRunId || !payload || !allChosen || !allUploaded) return;
    setSubmitting(true);
    setError(null);
    try {
      const decision = {
        autoPost,
        approvedPins: payload.pins.map((pin) => ({
          pinIndex: pin.pinIndex,
          chosenVariationIndex: choices[pin.pinIndex] ?? 0,
        })),
      };
      const result = await api.decidePins(workflowRunId, decision);
      setSuccess({ queued: result.queued.length });
      toast.success(`${result.queued.length} pins queued`);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error && !payload) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Upload & review pins" backHref="/approvals" />
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      </PageContainer>
    );
  }
  if (!payload) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Upload & review pins" backHref="/approvals" />
        <p className="text-sm text-muted-foreground">No pins payload.</p>
      </PageContainer>
    );
  }

  if (success) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Pins queued" backHref="/dashboard" backLabel="Dashboard" />
        <Card>
          <CardContent className="flex flex-col gap-4 py-6">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">
                {success.queued} pins have been scheduled to board {payload.boardId}.
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <a href="/calendar">View scheduled pins <ArrowRight className="h-4 w-4" /></a>
              </Button>
              <Button asChild variant="ghost">
                <a href="/dashboard">Back to dashboard</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const unuploadedCount = payload.pins.filter((p) => !p.composedImageUrl).length;
  const uploadedCount = totalPins - unuploadedCount;

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Upload & review pins"
        description="Design each pin in Canva and upload the PNG/JPG. Pick a title/description variation per pin. Regenerate copy if Claude's text needs another shot."
        backHref="/approvals"
        actions={
          <Badge variant={allUploaded ? "success" : "secondary"}>
            {uploadedCount}/{totalPins} uploaded
          </Badge>
        }
      />

      <div className="flex flex-col gap-4">
        {payload.pins.map((pin) => {
          const uploaded = !!pin.composedImageUrl;
          const isUploading = uploading === pin.pinIndex;
          const isRegenerating = regenerating === pin.pinIndex;
          return (
            <Card key={pin.pinIndex}>
              <CardContent className="flex flex-col gap-4 py-5 md:flex-row">
                <div className="flex flex-col gap-2 md:w-[240px] md:shrink-0">
                  {uploaded ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pin.composedImageUrl}
                      alt={`pin ${pin.pinIndex}`}
                      className="aspect-[2/3] w-full rounded-lg border border-border object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 text-muted-foreground">
                      <ImagePlus className="h-6 w-6" />
                      <span className="text-xs">Not uploaded</span>
                    </div>
                  )}
                  <PinFileInput
                    pinIndex={pin.pinIndex}
                    onFile={(f) => handleUpload(pin.pinIndex, f)}
                    disabled={isUploading || submitting || isRegenerating}
                    label={uploaded ? "Replace pin" : "Upload composed pin"}
                  />
                  {isUploading && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRegenerate(pin.pinIndex)}
                    disabled={regenerating !== null || submitting || isUploading}
                  >
                    {isRegenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    {isRegenerating ? "Regenerating…" : "Regenerate copy"}
                  </Button>
                </div>

                <div className="flex flex-1 flex-col gap-3">
                  <h3 className="text-base font-semibold">Pin #{pin.pinIndex + 1}</h3>
                  <div className="flex flex-col gap-2">
                    {pin.variations.map((v, idx) => {
                      const picked = choices[pin.pinIndex] === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setChoices((prev) => ({ ...prev, [pin.pinIndex]: idx }))}
                          aria-pressed={picked}
                          className={`rounded-lg border p-3 text-left transition-colors ${
                            picked ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
                          }`}
                        >
                          <div className="text-sm font-semibold">{v.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{v.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <Switch id="autopost" checked={autoPost} onCheckedChange={setAutoPost} />
        <Label htmlFor="autopost" className="cursor-pointer">
          Auto-schedule to best times (uses analytics slots)
        </Label>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {!allUploaded && (
        <p className="mt-2 text-sm text-warning">
          {unuploadedCount} pin{unuploadedCount === 1 ? "" : "s"} still need{unuploadedCount === 1 ? "s" : ""} an uploaded image.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          size="lg"
          variant="success"
          onClick={handleSubmit}
          disabled={
            !allChosen || !allUploaded || submitting || regenerating !== null || uploading !== null
          }
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {submitting ? "Scheduling…" : `Schedule ${totalPins} pin${totalPins === 1 ? "" : "s"}`}
        </Button>
        <Button size="lg" variant="ghost" onClick={() => router.push("/dashboard")}>
          Cancel
        </Button>
      </div>

      {approval && (
        <p className="mt-6 text-xs text-muted-foreground">
          Board {payload.boardId} · Approval {approval.id} · status {approval.status}
        </p>
      )}
    </PageContainer>
  );
}

function PinFileInput({
  pinIndex,
  onFile,
  disabled,
  label,
}: {
  pinIndex: number;
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
        aria-label={`upload pin ${pinIndex}`}
      >
        <Upload className="h-3.5 w-3.5" />
        {label}
      </Button>
    </>
  );
}
