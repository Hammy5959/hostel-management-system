"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { fetchVisitorEligibleResidentOptions, fetchStaffAssigneeOptions, fetchMaintenanceRoomOptions } from "@/lib/hostel-options"
import type { Asset } from "@/lib/types"

type TargetType = "resident" | "staff" | "room"

const TARGET_OPTIONS: { value: TargetType; label: string }[] = [
  { value: "resident", label: "Resident" },
  { value: "staff", label: "Staff Member" },
  { value: "room", label: "Room" },
]

export interface AssignAssetResult {
  targetType: TargetType
  targetId: string
  conditionOnAssignment: string
  notes: string
}

/** Assign an available asset to a resident, staff member, or room — the
 * backend's AssignmentCreate requires at least one of resident_id/staff_id/
 * room_id, so exactly one target field is sent based on the selected type.
 * Remounted via `key` in the parent each time it opens for a different
 * asset, same as AssignTicketDialog/RejectGatePassDialog. */
export function AssignAssetDialog({
  open,
  onOpenChange,
  asset,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  loading: boolean
  onConfirm: (result: AssignAssetResult) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>
            Assign {asset?.name ?? "this asset"} to a resident, staff member, or room.
          </DialogDescription>
        </DialogHeader>

        {open && <AssignForm loading={loading} onConfirm={onConfirm} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function AssignForm({
  loading,
  onConfirm,
  onOpenChange,
}: {
  loading: boolean
  onConfirm: (result: AssignAssetResult) => void
  onOpenChange: (open: boolean) => void
}) {
  const [targetType, setTargetType] = useState<TargetType>("resident")
  const [target, setTarget] = useState<ComboOption | null>(null)
  const [conditionOnAssignment, setConditionOnAssignment] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const fetchOptions =
    targetType === "resident"
      ? fetchVisitorEligibleResidentOptions
      : targetType === "staff"
        ? fetchStaffAssigneeOptions
        : fetchMaintenanceRoomOptions

  return (
    <>
      <Field>
        <FieldLabel htmlFor="assign-asset-target-type">Assign To</FieldLabel>
        <Select
          value={targetType}
          onValueChange={(value) => {
            if (!value) return
            setTargetType(value as TargetType)
            setTarget(null)
            setError(null)
          }}
        >
          <SelectTrigger id="assign-asset-target-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="assign-asset-target">
          {TARGET_OPTIONS.find((o) => o.value === targetType)?.label} <span className="text-destructive">*</span>
        </FieldLabel>
        <EntityCombobox
          key={targetType}
          id="assign-asset-target"
          value={target}
          onChange={(next) => {
            setTarget(next)
            if (next) setError(null)
          }}
          fetchOptions={fetchOptions}
          placeholder="Search…"
        />
        <FieldError errors={[error ? { message: error } : undefined]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="assign-asset-condition">Condition on Assignment (Optional)</FieldLabel>
        <Input
          id="assign-asset-condition"
          value={conditionOnAssignment}
          onChange={(e) => setConditionOnAssignment(e.target.value)}
          placeholder="e.g. Good"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="assign-asset-notes">Notes (Optional)</FieldLabel>
        <Textarea
          id="assign-asset-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={loading}
          onClick={() => {
            if (!target) {
              setError("Select a target")
              return
            }
            onConfirm({ targetType, targetId: target.value, conditionOnAssignment: conditionOnAssignment.trim(), notes: notes.trim() })
          }}
        >
          {loading ? "Assigning…" : "Assign"}
        </Button>
      </DialogFooter>
    </>
  )
}
