"use client"

import { useState, type SubmitEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { Label } from "@/components/ui/label"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, checkInVisitor, createVisitor, updateVisitor } from "@/lib/api"
import { fetchVisitorEligibleResidentOptions } from "@/lib/hostel-options"
import type { Visitor } from "@/lib/types"

/** Local `datetime-local` input value ("yyyy-MM-ddThh:mm") from an ISO
 * timestamp, or "" if unset — the inverse of the submit-time
 * `new Date(...).toISOString()` conversion below. */
function toLocalInputValue(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Shared create/edit visitor form. `visitor: null` registers a new guest;
 * a `Visitor` edits that one instead — mirrors the RoomFormDialog pattern
 * (`components/rooms/room-form-dialog.tsx`), so there is exactly one
 * visitor-editing implementation in the app. Resident is fixed once
 * registered — editing never reassigns who's being visited, so in edit mode
 * the resident picker is replaced by a read-only "Visiting" field.
 *
 * The actual form is a separate component, remounted (via `key` below) each
 * time it opens for a different target — that lets every field start from
 * a plain `useState(initialValue)` computed once at mount instead of an
 * effect that calls setState to resync on every open, which is both extra
 * code and something this project's lint config (react-hooks/set-state-in-effect)
 * flags as an anti-pattern. */
export function VisitorFormDialog({
  open,
  onOpenChange,
  visitor,
  residentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  visitor: Visitor | null
  /** Resolved by the parent — only needed in edit mode. */
  residentName?: string
}) {
  const isEdit = !!visitor
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Visitor" : "Register Visitor"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this visitor's details." : "Add a guest visiting a resident."}
          </DialogDescription>
        </DialogHeader>

        {open && (
          <VisitorForm
            key={visitor?.id ?? "create"}
            visitor={visitor}
            residentName={residentName}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function VisitorForm({
  visitor,
  residentName,
  onOpenChange,
}: {
  visitor: Visitor | null
  residentName?: string
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!visitor

  const [resident, setResident] = useState<ComboOption | null>(null)
  const [visitorName, setVisitorName] = useState(visitor?.visitor_name ?? "")
  const [visitorPhone, setVisitorPhone] = useState(visitor?.visitor_phone ?? "")
  const [relationship, setRelationship] = useState(visitor?.relationship ?? "")
  const [identificationType, setIdentificationType] = useState(visitor?.identification_type ?? "")
  const [identificationNumber, setIdentificationNumber] = useState(visitor?.identification_number ?? "")
  const [purpose, setPurpose] = useState(visitor?.purpose ?? "")
  const [expectedAt, setExpectedAt] = useState(toLocalInputValue(visitor?.expected_at ?? null))
  const [checkInNow, setCheckInNow] = useState(false)
  const [residentError, setResidentError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!isEdit && !resident) {
      setResidentError("Resident is required")
      return
    }
    if (!visitorName.trim()) {
      setNameError("Visitor name is required")
      return
    }
    setResidentError(null)
    setNameError(null)
    setSubmitting(true)
    try {
      if (isEdit && visitor) {
        await updateVisitor(visitor.id, {
          visitor_name: visitorName.trim(),
          visitor_phone: visitorPhone || null,
          relationship: relationship || null,
          identification_type: identificationType || null,
          identification_number: identificationNumber || null,
          purpose: purpose || null,
          expected_at: expectedAt ? new Date(expectedAt).toISOString() : null,
        })
        toast.success("Visitor updated.")
      } else {
        const created = await createVisitor({
          resident_id: resident!.value,
          visitor_name: visitorName.trim(),
          visitor_phone: visitorPhone || null,
          relationship: relationship || null,
          identification_type: identificationType || null,
          identification_number: identificationNumber || null,
          purpose: purpose || null,
          expected_at: checkInNow ? null : expectedAt ? new Date(expectedAt).toISOString() : null,
        })
        if (checkInNow) {
          await checkInVisitor({ visitor_id: created.id })
        }
        toast.success(checkInNow ? "Visitor registered and checked in." : "Visitor registered.")
      }
      queryClient.invalidateQueries({ queryKey: ["visitors"] })
      queryClient.invalidateQueries({ queryKey: ["visitor-logs"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("visitors.create")
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
          {isEdit ? (
            <Field>
              <FieldLabel>Visiting</FieldLabel>
              <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-on-surface-variant">
                {residentName || "—"}
              </p>
            </Field>
          ) : (
            <Field data-invalid={!!residentError}>
              <FieldLabel htmlFor="visitor-form-resident">
                Resident <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="visitor-form-resident"
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
          )}

          <Field data-invalid={!!nameError}>
            <FieldLabel htmlFor="visitor-form-name">
              Visitor Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="visitor-form-name"
              value={visitorName}
              onChange={(e) => {
                setVisitorName(e.target.value)
                if (e.target.value.trim()) setNameError(null)
              }}
              placeholder="Full name"
            />
            <FieldError errors={[nameError ? { message: nameError } : undefined]} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="visitor-form-phone">Phone (Optional)</FieldLabel>
              <Input
                id="visitor-form-phone"
                type="tel"
                value={visitorPhone}
                onChange={(e) => setVisitorPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="visitor-form-relationship">Relationship (Optional)</FieldLabel>
              <Input
                id="visitor-form-relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. Parent, Friend"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="visitor-form-id-type">ID Type (Optional)</FieldLabel>
              <Input
                id="visitor-form-id-type"
                value={identificationType}
                onChange={(e) => setIdentificationType(e.target.value)}
                placeholder="e.g. Driver's License"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="visitor-form-id-number">ID Number (Optional)</FieldLabel>
              <Input
                id="visitor-form-id-number"
                value={identificationNumber}
                onChange={(e) => setIdentificationNumber(e.target.value)}
                placeholder="ID number"
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="visitor-form-purpose">Purpose (Optional)</FieldLabel>
            <Textarea
              id="visitor-form-purpose"
              rows={2}
              placeholder="Reason for the visit…"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </Field>

          {!isEdit && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="visitor-form-check-in-now"
                checked={checkInNow}
                onCheckedChange={(checked) => setCheckInNow(checked === true)}
              />
              <Label htmlFor="visitor-form-check-in-now" className="text-sm font-normal">
                Check in immediately
              </Label>
            </div>
          )}

          {!(!isEdit && checkInNow) && (
            <Field>
              <FieldLabel htmlFor="visitor-form-expected-at">Expected At (Optional)</FieldLabel>
              <Input
                id="visitor-form-expected-at"
                type="datetime-local"
                value={expectedAt}
                onChange={(e) => setExpectedAt(e.target.value)}
              />
            </Field>
          )}
        </FieldGroup>
      </div>

      <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "Register Visitor"}
        </Button>
      </DialogFooter>
    </form>
  )
}
