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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  EntityCombobox,
  type ComboOption,
} from "@/components/hostel/entity-combobox";
import { markPermissionDenied } from "@/lib/permissions";
import { ApiError, createAllocation, searchAdmissions } from "@/lib/api";
import {
  fetchAllocatableResidentOptions,
  fetchBedOptions,
  fetchBuildingOptions,
  fetchFloorOptions,
  fetchRoomOptions,
} from "@/lib/hostel-options";
import { todayLocalDate } from "@/lib/utils";

export function AllocateBedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [resident, setResident] = useState<ComboOption | null>(null);
  const [admissionId, setAdmissionId] = useState<string | null>(null);
  const [admissionNumber, setAdmissionNumber] = useState<string | null>(null);
  const [admissionLoading, setAdmissionLoading] = useState(false);
  const admissionRequestId = useRef(0);
  const [building, setBuilding] = useState<ComboOption | null>(null);
  const [floor, setFloor] = useState<ComboOption | null>(null);
  const [room, setRoom] = useState<ComboOption | null>(null);
  const [bed, setBed] = useState<ComboOption | null>(null);
  const [allocatedFrom, setAllocatedFrom] = useState(todayLocalDate);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form every time the dialog is (re)opened — mirrors the
  // render-time reset pattern used by AssignBedDialog/TransferBedDialog.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setResident(null);
    admissionRequestId.current += 1;
    setAdmissionId(null);
    setAdmissionNumber(null);
    setAdmissionLoading(false);
    setBuilding(null);
    setFloor(null);
    setRoom(null);
    setBed(null);
    setAllocatedFrom(todayLocalDate());
    setReason("");
    setFormError(null);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  // The resident dropdown (fetchAllocatableResidentOptions) already only
  // offers residents with exactly one unused approved admission, so once a
  // resident is picked, that admission is resolved and linked automatically
  // — no separate manual admission picker needed.
  async function onResidentChange(next: ComboOption | null) {
    setResident(next);
    if (next) setFormError(null);
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
    if (!resident || !room || !bed) {
      setFormError("Resident, room and bed are all required.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await createAllocation({
        resident_id: resident.value,
        room_id: room.value,
        bed_id: bed.value,
        admission_id: admissionId,
        allocated_from: allocatedFrom,
        reason: reason || null,
      });
      toast.success("Bed allocated.");
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
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
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>Allocate a bed</DialogTitle>
          <DialogDescription>
            Pick a resident and a vacant bed to create a new active allocation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <Field data-invalid={!!formError && !resident}>
                <FieldLabel htmlFor="allocate-resident">
                  Resident <span className="text-destructive">*</span>
                </FieldLabel>
                <EntityCombobox
                  id="allocate-resident"
                  value={resident}
                  onChange={onResidentChange}
                  fetchOptions={fetchAllocatableResidentOptions}
                  placeholder="Search residents…"
                />
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
                <FieldLabel htmlFor="allocate-building">Building</FieldLabel>
                <EntityCombobox
                  id="allocate-building"
                  value={building}
                  onChange={(next) => {
                    setBuilding(next);
                    setFloor(null);
                    setRoom(null);
                    setBed(null);
                  }}
                  fetchOptions={fetchBuildingOptions}
                  placeholder="Select a building…"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="allocate-floor">Floor</FieldLabel>
                <EntityCombobox
                  id="allocate-floor"
                  value={floor}
                  onChange={(next) => {
                    setFloor(next);
                    setRoom(null);
                    setBed(null);
                  }}
                  fetchOptions={fetchFloorOptions(building?.value)}
                  placeholder={building ? "Select a floor…" : "Pick a building first"}
                  disabled={!building}
                />
              </Field>

              <Field data-invalid={!!formError && !room}>
                <FieldLabel htmlFor="allocate-room">
                  Room <span className="text-destructive">*</span>
                </FieldLabel>
                <EntityCombobox
                  id="allocate-room"
                  value={room}
                  onChange={(next) => {
                    setRoom(next);
                    setBed(null);
                    if (next) setFormError(null);
                  }}
                  fetchOptions={fetchRoomOptions(floor?.value, { activeOnly: true })}
                  placeholder={floor ? "Select a room…" : "Pick a floor first"}
                  disabled={!floor}
                />
              </Field>

              <Field data-invalid={!!formError && !bed}>
                <FieldLabel htmlFor="allocate-bed">
                  Bed <span className="text-destructive">*</span>
                </FieldLabel>
                <EntityCombobox
                  id="allocate-bed"
                  value={bed}
                  onChange={(next) => {
                    setBed(next);
                    if (next) setFormError(null);
                  }}
                  fetchOptions={fetchBedOptions(room?.value, { availableOnly: true })}
                  placeholder={room ? "Select a vacant bed…" : "Pick a room first"}
                  disabled={!room}
                />
                <FieldError errors={[formError ? { message: formError } : undefined]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="allocate-from">Move-in date</FieldLabel>
                <Input
                  id="allocate-from"
                  type="date"
                  value={allocatedFrom}
                  onChange={(e) => setAllocatedFrom(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="allocate-reason">Reason (optional)</FieldLabel>
                <Textarea
                  id="allocate-reason"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="mt-0 shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Allocating…" : "Allocate Bed"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
