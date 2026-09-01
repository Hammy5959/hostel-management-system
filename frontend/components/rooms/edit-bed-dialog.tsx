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
import { ApiError, updateBed } from "@/lib/api";
import type { BedStatus, RoomDetailBed } from "@/lib/types";
import { BED_STATUS_OPTIONS } from "@/components/rooms/add-bed-dialog";

/** Edits an existing bed's own fields via the existing PATCH /beds/{id}
 * endpoint. Status is only editable here for a non-occupied bed — an
 * occupied bed's status is exclusively owned by the allocation RPCs
 * (via Transfer), so changing it through this generic edit would desync
 * the bed from its active allocation. */
export function EditBedDialog({
  open,
  onOpenChange,
  roomId,
  bed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  bed: RoomDetailBed | null;
}) {
  const queryClient = useQueryClient();
  const [bedNumber, setBedNumber] = useState("");
  const [status, setStatus] = useState<BedStatus>("available");
  const [description, setDescription] = useState("");
  const [bedNumberError, setBedNumberError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog is (re)opened for a (possibly
  // different) bed — the render-time reset pattern used across this app's
  // dialogs, since setState-in-useEffect is a lint error here.
  const [lastBedId, setLastBedId] = useState<string | null>(null);
  if (open && bed && bed.id !== lastBedId) {
    setLastBedId(bed.id);
    setBedNumber(bed.bed_number);
    setStatus(bed.status);
    setDescription(bed.description ?? "");
    setBedNumberError(null);
  } else if (!open && lastBedId !== null) {
    setLastBedId(null);
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!bed) return;
    if (!bedNumber.trim()) {
      setBedNumberError("Bed number is required");
      return;
    }
    setBedNumberError(null);
    setSubmitting(true);
    try {
      await updateBed(bed.id, {
        bed_number: bedNumber.trim(),
        ...(bed.status !== "occupied" ? { status } : {}),
        description: description || null,
      });
      toast.success("Bed updated.");
      queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("beds.update");
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
          <DialogTitle>Edit bed</DialogTitle>
          <DialogDescription>
            Update this bed&apos;s details. Changes appear on the room detail page immediately.
          </DialogDescription>
        </DialogHeader>

        {bed && (
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <Field data-invalid={!!bedNumberError}>
                <FieldLabel htmlFor="edit-bed-number">
                  Bed number <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="edit-bed-number"
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
                <FieldLabel htmlFor="edit-bed-status">Status</FieldLabel>
                {bed.status === "occupied" ? (
                  <p className="text-sm text-on-surface-variant">
                    This bed is occupied — use Transfer to change its status.
                  </p>
                ) : (
                  <Select
                    value={status}
                    onValueChange={(value) => value && setStatus(value as BedStatus)}
                  >
                    <SelectTrigger id="edit-bed-status" className="w-full">
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
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-bed-description">Description (optional)</FieldLabel>
                <Textarea
                  id="edit-bed-description"
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
                {submitting ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
