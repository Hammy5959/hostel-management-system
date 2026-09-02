"use client"

import { useState, type SubmitEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createGatePass } from "@/lib/api"
import { fetchVisitorEligibleResidentOptions } from "@/lib/hostel-options"

/** Local `datetime-local` input value ("yyyy-MM-ddThh:mm") from an ISO
 * timestamp, or "" if unset. Mirrors visitor-form-dialog.tsx's helper. */
function toLocalInputValue(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Create-only — the backend has no gate-pass update endpoint, so unlike
 * VisitorFormDialog there is no edit mode (matches the Leave Requests
 * precedent, which also has no edit dialog). Remounted via `key` in the
 * parent each time it opens so fields always start blank. */
export function GatePassFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>New Gate Pass</DialogTitle>
          <DialogDescription>Request a gate pass for a resident leaving the hostel.</DialogDescription>
        </DialogHeader>

        {open && <GatePassForm onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function GatePassForm({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()

  const [resident, setResident] = useState<ComboOption | null>(null)
  const [reason, setReason] = useState("")
  const [destination, setDestination] = useState("")
  const [departureAt, setDepartureAt] = useState(toLocalInputValue(null))
  const [expectedReturnAt, setExpectedReturnAt] = useState(toLocalInputValue(null))
  const [notes, setNotes] = useState("")
  const [residentError, setResidentError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!resident) {
      setResidentError("Resident is required")
      return
    }
    if (!reason.trim()) {
      setReasonError("Reason is required")
      return
    }
    setResidentError(null)
    setReasonError(null)
    setSubmitting(true)
    try {
      await createGatePass({
        resident_id: resident.value,
        reason: reason.trim(),
        destination: destination || null,
        departure_at: departureAt ? new Date(departureAt).toISOString() : null,
        expected_return_at: expectedReturnAt ? new Date(expectedReturnAt).toISOString() : null,
        notes: notes || null,
      })
      toast.success("Gate pass requested.")
      queryClient.invalidateQueries({ queryKey: ["gate-passes"] })
      queryClient.invalidateQueries({ queryKey: ["gate-passes-stat"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("gate_passes.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <FieldGroup>
          <Field data-invalid={!!residentError}>
            <FieldLabel htmlFor="gate-pass-form-resident">
              Resident <span className="text-destructive">*</span>
            </FieldLabel>
            <EntityCombobox
              id="gate-pass-form-resident"
              value={resident}
              onChange={(next) => {
                setResident(next)
                if (next) setResidentError(null)
              }}
              fetchOptions={fetchVisitorEligibleResidentOptions}
              placeholder="Search by name or student ID…"
            />
            <FieldError errors={[residentError ? { message: residentError } : undefined]} />
          </Field>

          <Field data-invalid={!!reasonError}>
            <FieldLabel htmlFor="gate-pass-form-reason">
              Reason <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="gate-pass-form-reason"
              rows={2}
              placeholder="e.g. Going home, medical appointment…"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (e.target.value.trim()) setReasonError(null)
              }}
            />
            <FieldError errors={[reasonError ? { message: reasonError } : undefined]} />
          </Field>

          <Field>
            <FieldLabel htmlFor="gate-pass-form-destination">Destination (Optional)</FieldLabel>
            <Input
              id="gate-pass-form-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Lahore"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="gate-pass-form-departure">Departure At (Optional)</FieldLabel>
              <Input
                id="gate-pass-form-departure"
                type="datetime-local"
                value={departureAt}
                onChange={(e) => setDepartureAt(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="gate-pass-form-return">Expected Return (Optional)</FieldLabel>
              <Input
                id="gate-pass-form-return"
                type="datetime-local"
                value={expectedReturnAt}
                onChange={(e) => setExpectedReturnAt(e.target.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="gate-pass-form-notes">Notes (Optional)</FieldLabel>
            <Textarea
              id="gate-pass-form-notes"
              rows={2}
              placeholder="Anything else staff should know…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </FieldGroup>
      </div>

      <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Requesting…" : "Request Gate Pass"}
        </Button>
      </DialogFooter>
    </form>
  )
}
