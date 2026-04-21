"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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
  const [value, setValue] = React.useState<string>(toLocalInput(currentIso));

  React.useEffect(() => {
    if (open) setValue(toLocalInput(currentIso));
  }, [open, currentIso]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value) return;
    const iso = new Date(value).toISOString();
    await onSubmit(iso);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Reschedule pin</DialogTitle>
            <DialogDescription>
              Pick a new date and time. Stored as UTC on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 grid gap-2">
            <Label htmlFor="reschedule-at">New time</Label>
            <Input
              id="reschedule-at"
              type="datetime-local"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value || submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
