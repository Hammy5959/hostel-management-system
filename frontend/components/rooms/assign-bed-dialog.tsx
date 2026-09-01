"use client";

import { useRef, useState, type SubmitEvent } from "react";
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
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox";
import { markPermissionDenied } from "@/lib/permissions";
import { ApiError, createAllocation, searchAdmissions } from "@/lib/api";
import { fetchAllocatableResidentOptions } from "@/lib/hostel-options";
import { todayLocalDate } from "@/lib/utils";
import type { RoomDetailBed } from "@/lib/types";

export function AssignBedDialog({
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
  const [resident, setResident] = useState<ComboOption | null>(null);
  const [admissionId, setAdmissionId] = useState<string | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState<string | null>(null);
  const [admissionLoading, setAdmissionLoading] = useState(false);
  const admissionRequestId = useRef(0);
  const [allocatedFrom, setAllocatedFrom] = useState(todayLocalDate);
  const [reason, setReason] = useState("");
  const [residentError, setResidentError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog is (re)opened for a new bed, mirroring
  // the render-time reset pattern already used by RoomFormDialog.
  const [lastBedId, setLastBedId] = useState<string | null>(null);
  if (open && (bed?.id ?? null) !== lastBedId) {
    setLastBedId(bed?.id ?? null);
    setResident(null);
    admissionRequestId.current += 1;
    setAdmissionId(null);
    setAdmissionNumber(null);
    setAdmissionLoading(false);
    setAllocatedFrom(todayLocalDate());
    setReason("");
    setResidentError(null);
  }

  // The resident dropdown (fetchAllocatableResidentOptions) already only
  // offers residents with exactly one unused approved admission, so once a
  // resident is picked, that admission is resolved and linked automatically
  // — no separate manual admission picker needed.
  async function onResidentChange(next: ComboOption | null) {
    setResident(next);
    if (next) setResidentError(null);
    setAdmissionId(null);
    setAdmissionNumber(null);
    const requestId = ++admissionRequestId.current;
    if (!next) {
      setAdmissionLoading(false);
      return;
    }
    setAdmissionLoading(true);
    try {
      const result = await searchAdmissions({
        resident_id: next.value,
        status: "approved",
        available_for_allocation: true,
        per_page: 1,
      });
      if (admissionRequestId.current !== requestId) return;
      const admission = result.items[0];
      setAdmissionId(admission?.id ?? null);
      setAdmissionNumber(admission?.admission_number ?? null);
    } catch {
      // Leave admissionId unset — submission will surface the backend's
      // admission_required/admission_not_approved safety net instead.
    } finally {
      if (admissionRequestId.current === requestId) setAdmissionLoading(false);
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!bed) return;
    if (!resident) {
      setResidentError("Resident is required");
      return;
    }
    setResidentError(null);
    setSubmitting(true);
    try {
      await createAllocation({
        resident_id: resident.value,
        room_id: roomId,
        bed_id: bed.id,
        admission_id: admissionId,
        allocated_from: allocatedFrom,
        reason: reason || null,
      });
      toast.success("Bed assigned.");
      queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("allocations.create");
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
          <DialogTitle>Assign bed {bed ? `${bed.bed_number}` : ""}</DialogTitle>
          <DialogDescription>
            Select a resident to move into this bed. This uses the same allocation workflow as
            the rest of the app.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!residentError}>
              <FieldLabel htmlFor="assign-resident">
                Resident <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="assign-resident"
                value={resident}
                onChange={onResidentChange}
                fetchOptions={fetchAllocatableResidentOptions}
                placeholder="Search residents…"
              />
              <FieldError errors={[residentError ? { message: residentError } : undefined]} />
            </Field>

            {resident && (
              <p className="text-sm text-on-surface-variant">
                {admissionLoading
                  ? "Resolving approved admission…"
                  : admissionNumber
                    ? `Admission ${admissionNumber} will be linked automatically.`
                    : "No approved admission found for this resident."}
              </p>
            )}

            <Field>
              <FieldLabel htmlFor="assign-from">Move-in date</FieldLabel>
              <Input
                id="assign-from"
                type="date"
                value={allocatedFrom}
                onChange={(e) => setAllocatedFrom(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="assign-reason">Reason (optional)</FieldLabel>
              <Textarea
                id="assign-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Assigning…" : "Assign Bed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
