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
import { ApiError, createLeaveRequest } from "@/lib/api"
import { fetchLeaveEligibleResidentOptions } from "@/lib/hostel-options"
import { todayLocalDate } from "@/lib/utils"

export function NewLeaveRequestDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [resident, setResident] = useState<ComboOption | null>(null)
  const [startDate, setStartDate] = useState(todayLocalDate)
  const [endDate, setEndDate] = useState(todayLocalDate)
  const [reason, setReason] = useState("")
  const [destination, setDestination] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [residentError, setResidentError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setResident(null)
    setStartDate(todayLocalDate())
    setEndDate(todayLocalDate())
    setReason("")
    setDestination("")
    setContactPhone("")
    setResidentError(null)
    setReasonError(null)
    setDateError(null)
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()

    let valid = true
    if (!resident) {
      setResidentError("Resident is required")
      valid = false
    }
    if (!reason.trim()) {
      setReasonError("Reason is required")
      valid = false
    }
    if (endDate < startDate) {
      setDateError("End date cannot be before start date")
      valid = false
    }
    if (!valid) return

    setResidentError(null)
    setReasonError(null)
    setDateError(null)
    setSubmitting(true)
    try {
      await createLeaveRequest({
        resident_id: resident!.value,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
        destination: destination.trim() || null,
        contact_phone: contactPhone.trim() || null,
      })
      toast.success("Leave request submitted.")
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] })
      queryClient.invalidateQueries({ queryKey: ["leave-report"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("leave_requests.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Leave Request</DialogTitle>
          <DialogDescription>Submit a leave request on behalf of a resident.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!residentError}>
              <FieldLabel htmlFor="new-leave-resident">
                Resident <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="new-leave-resident"
                value={resident}
                onChange={(next) => {
                  setResident(next)
                  if (next) setResidentError(null)
                }}
                fetchOptions={fetchLeaveEligibleResidentOptions}
                placeholder="Search by name or student ID…"
              />
              <FieldError errors={[residentError ? { message: residentError } : undefined]} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field data-invalid={!!dateError}>
                <FieldLabel htmlFor="new-leave-start-date">Start Date</FieldLabel>
                <Input
                  id="new-leave-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value)
                    setDateError(null)
                  }}
                />
              </Field>

              <Field data-invalid={!!dateError}>
                <FieldLabel htmlFor="new-leave-end-date">End Date</FieldLabel>
                <Input
                  id="new-leave-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value)
                    setDateError(null)
                  }}
                />
                <FieldError errors={[dateError ? { message: dateError } : undefined]} />
              </Field>
            </div>

            <Field data-invalid={!!reasonError}>
              <FieldLabel htmlFor="new-leave-reason">
                Reason <span className="text-destructive">*</span>
              </FieldLabel>
              <Textarea
                id="new-leave-reason"
                rows={3}
                placeholder="e.g., Family medical emergency…"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (e.target.value.trim()) setReasonError(null)
                }}
              />
              <FieldError errors={[reasonError ? { message: reasonError } : undefined]} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="new-leave-destination">Destination (Optional)</FieldLabel>
                <Input
                  id="new-leave-destination"
                  placeholder="e.g., Hometown, Seattle"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="new-leave-contact-phone">Contact Phone (Optional)</FieldLabel>
                <Input
                  id="new-leave-contact-phone"
                  type="tel"
                  placeholder="e.g., +1 555 0100"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </Field>
            </div>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
