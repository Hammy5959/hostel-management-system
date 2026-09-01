"use client";

import { useState, type SubmitEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { ApiError, transferAllocation } from "@/lib/api";
import {
  fetchBedOptions,
  fetchBuildingOptions,
  fetchFloorOptions,
  fetchRoomOptions,
} from "@/lib/hostel-options";
import type { Allocation } from "@/lib/types";

export function TransferAllocationDialog({
  open,
  onOpenChange,
  allocation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allocation: Allocation | null;
}) {
  const queryClient = useQueryClient();
  const [building, setBuilding] = useState<ComboOption | null>(null);
  const [floor, setFloor] = useState<ComboOption | null>(null);
  const [room, setRoom] = useState<ComboOption | null>(null);
  const [newBed, setNewBed] = useState<ComboOption | null>(null);
  const [reason, setReason] = useState("");
  const [bedError, setBedError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the dialog is (re)opened for a new allocation —
  // mirrors the render-time reset pattern used by TransferBedDialog.
  const [lastAllocationId, setLastAllocationId] = useState<string | null>(null);
  if (open && (allocation?.id ?? null) !== lastAllocationId) {
    setLastAllocationId(allocation?.id ?? null);
    setBuilding(null);
    setFloor(null);
    setRoom(null);
    setNewBed(null);
    setReason("");
    setBedError(null);
  }

  const residentName = allocation?.resident
    ? [allocation.resident.first_name, allocation.resident.last_name].filter(Boolean).join(" ")
    : null;

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!allocation) return;
    if (!room || !newBed) {
      setBedError("A destination room and bed are required");
      return;
    }
    setBedError(null);
    setSubmitting(true);
    try {
      await transferAllocation(allocation.id, {
        new_room_id: room.value,
        new_bed_id: newBed.value,
        reason: reason || null,
      });
      toast.success("Resident transferred.");
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("allocations.transfer");
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
          <DialogTitle>Transfer {residentName ?? "resident"}</DialogTitle>
          <DialogDescription>
            Move this resident to a different bed. The current bed is freed automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="alloc-transfer-building">Building</FieldLabel>
              <EntityCombobox
                id="alloc-transfer-building"
                value={building}
                onChange={(next) => {
                  setBuilding(next);
                  setFloor(null);
                  setRoom(null);
                  setNewBed(null);
                }}
                fetchOptions={fetchBuildingOptions}
                placeholder="Select a building…"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="alloc-transfer-floor">Floor</FieldLabel>
              <EntityCombobox
                id="alloc-transfer-floor"
                value={floor}
                onChange={(next) => {
                  setFloor(next);
                  setRoom(null);
                  setNewBed(null);
                }}
                fetchOptions={fetchFloorOptions(building?.value)}
                placeholder={building ? "Select a floor…" : "Pick a building first"}
                disabled={!building}
              />
            </Field>

            <Field data-invalid={!!bedError}>
              <FieldLabel htmlFor="alloc-transfer-room">
                Room <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="alloc-transfer-room"
                value={room}
                onChange={(next) => {
                  setRoom(next);
                  setNewBed(null);
                  if (next) setBedError(null);
                }}
                fetchOptions={fetchRoomOptions(floor?.value, { activeOnly: true })}
                placeholder={floor ? "Select a room…" : "Pick a floor first"}
                disabled={!floor}
              />
            </Field>

            <Field data-invalid={!!bedError}>
              <FieldLabel htmlFor="alloc-transfer-bed">
                Bed <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="alloc-transfer-bed"
                value={newBed}
                onChange={(next) => {
                  setNewBed(next);
                  if (next) setBedError(null);
                }}
                fetchOptions={fetchBedOptions(room?.value, { availableOnly: true })}
                placeholder={room ? "Select a vacant bed…" : "Pick a room first"}
                disabled={!room}
              />
              <FieldError errors={[bedError ? { message: bedError } : undefined]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="alloc-transfer-reason">Reason (optional)</FieldLabel>
              <Textarea
                id="alloc-transfer-reason"
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
              {submitting ? "Transferring…" : "Transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
