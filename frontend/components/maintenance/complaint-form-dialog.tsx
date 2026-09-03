"use client"

import { useState, type SubmitEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createComplaint, getAllocations, getRoom, updateComplaint } from "@/lib/api"
import { fetchMaintenanceEligibleResidentOptions, fetchMaintenanceRoomOptions } from "@/lib/hostel-options"
import type { Complaint, MaintenancePriority } from "@/lib/types"

const PRIORITY_OPTIONS: { value: MaintenancePriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

/** New Complaint / Edit Complaint form — only the fields ComplaintCreate/
 * ComplaintUpdate accept: resident, title, description, category, priority,
 * room. `complaint: null` files a new one; a `Complaint` edits that one
 * instead — mirrors VisitorFormDialog's create/edit dual-mode pattern.
 * Editing is only ever offered (by the parent) while a complaint is "open",
 * so this form doesn't re-check status itself. Resident is fixed once filed
 * — editing never reassigns who it's for — so in edit mode the resident
 * picker is replaced by a read-only "Filed by" field, same as
 * VisitorFormDialog's read-only "Visiting" field in edit mode.
 *
 * Remounted via `key` in the parent each time it opens for a different
 * target, same as VisitorFormDialog. */
export function ComplaintFormDialog({
  open,
  onOpenChange,
  complaint,
  residentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  complaint: Complaint | null
  /** Resolved by the parent — only needed in edit mode. */
  residentName?: string
}) {
  const isEdit = !!complaint
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Complaint" : "New Complaint"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this complaint's details." : "File a maintenance complaint on behalf of a resident."}
          </DialogDescription>
        </DialogHeader>

        {open && <ComplaintForm complaint={complaint} residentName={residentName} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function ComplaintForm({
  complaint,
  residentName,
  onOpenChange,
}: {
  complaint: Complaint | null
  residentName?: string
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!complaint

  const [resident, setResident] = useState<ComboOption | null>(null)
  const [title, setTitle] = useState(complaint?.title ?? "")
  const [description, setDescription] = useState(complaint?.description ?? "")
  const [category, setCategory] = useState(complaint?.category ?? "")
  const [priority, setPriority] = useState<MaintenancePriority>(complaint?.priority ?? "normal")

  const [residentError, setResidentError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Edit mode: resolve the complaint's existing room (if any) into a
  // ComboOption so the field starts prefilled instead of blank.
  const existingRoomQuery = useQuery({
    queryKey: ["room", complaint?.room_id],
    queryFn: () => getRoom(complaint!.room_id!),
    enabled: isEdit && !!complaint?.room_id,
    staleTime: 5 * 60_000,
  })
  // Create mode: the selected resident's current active allocation, used to
  // auto-fill Room — a convenience prefill, not a validation gate, so a
  // resident with no active allocation just leaves Room blank.
  const allocationQuery = useQuery({
    queryKey: ["resident-active-allocation", resident?.value],
    queryFn: () => getAllocations({ resident_id: resident!.value, active_only: true, per_page: 1 }),
    enabled: !isEdit && !!resident,
    staleTime: 5 * 60_000,
  })
  const autoRoom: ComboOption | null = isEdit
    ? existingRoomQuery.data
      ? {
          value: existingRoomQuery.data.id,
          label: existingRoomQuery.data.room_number,
          sublabel: existingRoomQuery.data.building_name ?? undefined,
        }
      : null
    : (() => {
        const allocation = allocationQuery.data?.items[0]
        if (!allocation) return null
        return {
          value: allocation.room_id,
          label: allocation.room?.room_number ?? "Room",
          sublabel: allocation.room?.building_name ?? undefined,
        }
      })()

  // `undefined` = the user hasn't touched Room for the current resident
  // selection, so it follows `autoRoom`; a `ComboOption` or `null` means the
  // user explicitly picked or cleared it. Resetting this back to `undefined`
  // when the resident changes (so a newly-selected resident's allocation
  // takes over) is done via React's documented "adjust state during render"
  // pattern below rather than a useEffect, since resetting state from inside
  // an effect in response to a prop/state change trips this project's
  // react-hooks/set-state-in-effect lint rule.
  const [roomOverride, setRoomOverride] = useState<ComboOption | null | undefined>(undefined)
  const [prevResidentValue, setPrevResidentValue] = useState(resident?.value)
  if (!isEdit && resident?.value !== prevResidentValue) {
    setPrevResidentValue(resident?.value)
    setRoomOverride(undefined)
  }

  const room = roomOverride !== undefined ? roomOverride : autoRoom
  const roomAutoFilled = roomOverride === undefined && !!autoRoom

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    let hasError = false
    if (!isEdit && !resident) {
      setResidentError("Resident is required")
      hasError = true
    }
    if (!title.trim()) {
      setTitleError("Title is required")
      hasError = true
    }
    if (!description.trim()) {
      setDescriptionError("Description is required")
      hasError = true
    }
    if (hasError) return

    setSubmitting(true)
    try {
      if (isEdit && complaint) {
        await updateComplaint(complaint.id, {
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || null,
          priority,
          room_id: room?.value ?? null,
        })
        toast.success("Complaint updated.")
      } else {
        await createComplaint({
          resident_id: resident!.value,
          title: title.trim(),
          description: description.trim(),
          category: category.trim() || null,
          priority,
          room_id: room?.value ?? null,
        })
        toast.success("Complaint filed.")
      }
      queryClient.invalidateQueries({ queryKey: ["complaints"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied(isEdit ? "complaints.update" : "complaints.create")
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
              <FieldLabel>Filed By</FieldLabel>
              <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-on-surface-variant">
                {residentName || "—"}
              </p>
            </Field>
          ) : (
            <Field data-invalid={!!residentError}>
              <FieldLabel htmlFor="complaint-form-resident">
                Resident <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="complaint-form-resident"
                value={resident}
                onChange={(next) => {
                  setResident(next)
                  if (next) setResidentError(null)
                }}
                fetchOptions={fetchMaintenanceEligibleResidentOptions}
                placeholder="Search by name or student ID…"
              />
              <FieldError errors={[residentError ? { message: residentError } : undefined]} />
            </Field>
          )}

          <Field data-invalid={!!titleError}>
            <FieldLabel htmlFor="complaint-form-title">
              Title <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="complaint-form-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (e.target.value.trim()) setTitleError(null)
              }}
              placeholder="e.g. Broken bed frame"
            />
            <FieldError errors={[titleError ? { message: titleError } : undefined]} />
          </Field>

          <Field data-invalid={!!descriptionError}>
            <FieldLabel htmlFor="complaint-form-description">
              Description <span className="text-destructive">*</span>
            </FieldLabel>
            <Textarea
              id="complaint-form-description"
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                if (e.target.value.trim()) setDescriptionError(null)
              }}
              placeholder="Describe the issue…"
            />
            <FieldError errors={[descriptionError ? { message: descriptionError } : undefined]} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="complaint-form-category">Category (Optional)</FieldLabel>
              <Input
                id="complaint-form-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Electrical"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="complaint-form-priority">Priority</FieldLabel>
              <Select value={priority} onValueChange={(value) => value && setPriority(value as MaintenancePriority)}>
                <SelectTrigger id="complaint-form-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="complaint-form-room">
              Room (Optional)
              {roomAutoFilled && (
                <span className="ml-1 font-normal text-on-surface-variant">— auto-filled from resident</span>
              )}
            </FieldLabel>
            <EntityCombobox
              id="complaint-form-room"
              value={room}
              onChange={setRoomOverride}
              fetchOptions={fetchMaintenanceRoomOptions}
              placeholder="Search by room number…"
            />
          </Field>
        </FieldGroup>
      </div>

      <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "File Complaint"}
        </Button>
      </DialogFooter>
    </form>
  )
}
