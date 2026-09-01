"use client";

import { useState, type SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { markPermissionDenied } from "@/lib/permissions";
import { ApiError, createBed } from "@/lib/api";
import type { BedStatus } from "@/lib/types";

export const BED_STATUS_OPTIONS: { value: BedStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" },
];

/** Creates a real `beds` row for this room via the existing POST /beds
 * endpoint — the room detail page's summary cards and bed grid are entirely
 * backend-derived, so a new bed only ever shows up here because it actually
 * exists in the database. */
export function AddBedDialog({
  open,
  onOpenChange,
  roomId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
}) {
  const queryClient = useQueryClient();
  const [bedNumber, setBedNumber] = useState("");
  const [status, setStatus] = useState<BedStatus>("available");
  const [description, setDescription] = useState("");
  const [bedNumberError, setBedNumberError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog is (re)opened, mirroring the
  // render-time reset pattern already used by the other room dialogs.
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setBedNumber("");
    setStatus("available");
    setDescription("");
    setBedNumberError(null);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!bedNumber.trim()) {
      setBedNumberError("Bed number is required");
      return;
    }
    setBedNumberError(null);
    setSubmitting(true);
    try {
      await createBed({
        room_id: roomId,
        bed_number: bedNumber.trim(),
        status,
        description: description || null,
      });
      toast.success("Bed added.");
      queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("beds.create");
        }
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add bed</DialogTitle>
          <DialogDescription>
            Create a new bed in this room. It will immediately count toward the room&apos;s
            summary and appear in the bed grid below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!bedNumberError}>
              <FieldLabel htmlFor="add-bed-number">
                Bed number <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="add-bed-number"
                placeholder="e.g. 402-A"
                value={bedNumber}
                onChange={(e) => {
                  setBedNumber(e.target.value);
                  if (e.target.value.trim()) setBedNumberError(null);
                }}
                aria-invalid={!!bedNumberError}
              />
              <FieldError errors={[bedNumberError ? { message: bedNumberError } : undefined]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="add-bed-status">Status</FieldLabel>
              <Select value={status} onValueChange={(value) => value && setStatus(value as BedStatus)}>
                <SelectTrigger id="add-bed-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BED_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="add-bed-description">Description (optional)</FieldLabel>
              <Textarea
                id="add-bed-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Adding…" : "Add Bed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
