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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { fetchStaffAssigneeOptions } from "@/lib/hostel-options"

/** Assign a maintenance ticket to a staff member — PATCH /maintenance-tickets/{id}
 * with { assigned_to, status: "assigned" } together, since the backend only
 * derives assigned_at when both land in the same update (see
 * maintenance_tickets/service.py's update_ticket). Remounted via `key` in the
 * parent each time it opens for a different ticket, same as RejectGatePassDialog. */
export function AssignTicketDialog({
  open,
  onOpenChange,
  ticketTitle,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketTitle: string
  loading: boolean
  onConfirm: (staffId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign ticket</DialogTitle>
          <DialogDescription>
            Choose a staff member to assign {ticketTitle || "this ticket"} to.
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
  onConfirm: (staffId: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [staff, setStaff] = useState<ComboOption | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="assign-ticket-staff">
          Staff Member <span className="text-destructive">*</span>
        </FieldLabel>
        <EntityCombobox
          id="assign-ticket-staff"
          value={staff}
          onChange={(next) => {
            setStaff(next)
            if (next) setError(null)
          }}
          fetchOptions={fetchStaffAssigneeOptions}
          placeholder="Search staff by name…"
          emptyMessage="No active staff found."
        />
        <FieldError errors={[error ? { message: error } : undefined]} />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={loading}
          onClick={() => {
            if (!staff) {
              setError("Select a staff member")
              return
            }
            onConfirm(staff.value)
          }}
        >
          {loading ? "Assigning…" : "Assign"}
        </Button>
      </DialogFooter>
    </>
  )
}
