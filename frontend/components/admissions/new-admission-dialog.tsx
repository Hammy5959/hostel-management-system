"use client"

import { useState, type SubmitEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createAdmission } from "@/lib/api"
import { fetchEligibleResidentOptions } from "@/lib/hostel-options"
import { todayLocalDate } from "@/lib/utils"

export function NewAdmissionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [resident, setResident] = useState<ComboOption | null>(null)
  const [admissionNumber, setAdmissionNumber] = useState("")
  const [applicationDate, setApplicationDate] = useState(todayLocalDate)
  const [admissionDate, setAdmissionDate] = useState("")
  const [notes, setNotes] = useState("")
  const [residentError, setResidentError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setResident(null)
    setAdmissionNumber("")
    setApplicationDate(todayLocalDate())
    setAdmissionDate("")
    setNotes("")
    setResidentError(null)
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!resident) {
      setResidentError("Resident is required")
      return
    }
    setResidentError(null)
    setSubmitting(true)
    try {
      await createAdmission({
        resident_id: resident.value,
        admission_number: admissionNumber || null,
        application_date: applicationDate || undefined,
        admission_date: admissionDate || null,
        notes: notes || null,
      })
      toast.success("Admission created.")
      queryClient.invalidateQueries({ queryKey: ["admissions"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("admissions.create")
        }
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
          <DialogTitle>New Admission</DialogTitle>
          <DialogDescription>
            Start an admission application for an existing resident.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!residentError}>
              <FieldLabel htmlFor="admission-resident">
                Resident <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="admission-resident"
                value={resident}
                onChange={(next) => {
                  setResident(next)
                  if (next) setResidentError(null)
                }}
                fetchOptions={fetchEligibleResidentOptions}
                placeholder="Search by name or student ID…"
              />
              <FieldError errors={[residentError ? { message: residentError } : undefined]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="admission-number">Admission Number (Optional)</FieldLabel>
              <Input
                id="admission-number"
                placeholder="Leave blank to auto-generate (ADM-…)"
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="admission-application-date">Application Date</FieldLabel>
                <Input
                  id="admission-application-date"
                  type="date"
                  value={applicationDate}
                  onChange={(e) => setApplicationDate(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="admission-admission-date">Admission Date</FieldLabel>
                <Input
                  id="admission-admission-date"
                  type="date"
                  value={admissionDate}
                  onChange={(e) => setAdmissionDate(e.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="admission-notes">Notes / Special Requests</FieldLabel>
              <Textarea
                id="admission-notes"
                rows={3}
                placeholder="Enter any specific requirements or notes here…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create Admission"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
