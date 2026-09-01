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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, markAttendance } from "@/lib/api"
import { fetchAttendanceEligibleResidentOptions } from "@/lib/hostel-options"
import { todayLocalDate } from "@/lib/utils"
import type { AttendanceStatus } from "@/lib/types"

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "On Leave" },
]

export function MarkAttendanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const [resident, setResident] = useState<ComboOption | null>(null)
  const [attendanceDate, setAttendanceDate] = useState(todayLocalDate)
  const [status, setStatus] = useState<AttendanceStatus>("present")
  const [remarks, setRemarks] = useState("")
  const [residentError, setResidentError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setResident(null)
    setAttendanceDate(todayLocalDate())
    setStatus("present")
    setRemarks("")
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
      await markAttendance({
        resident_id: resident.value,
        attendance_date: attendanceDate,
        status,
        remarks: remarks || null,
      })
      toast.success("Attendance marked.")
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("attendance.mark")
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
          <DialogTitle>Mark Attendance</DialogTitle>
          <DialogDescription>Record attendance for a single resident.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!residentError}>
              <FieldLabel htmlFor="mark-attendance-resident">
                Resident <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="mark-attendance-resident"
                value={resident}
                onChange={(next) => {
                  setResident(next)
                  if (next) setResidentError(null)
                }}
                fetchOptions={fetchAttendanceEligibleResidentOptions}
                placeholder="Search by name or student ID…"
              />
              <FieldError errors={[residentError ? { message: residentError } : undefined]} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="mark-attendance-date">Date</FieldLabel>
                <Input
                  id="mark-attendance-date"
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="mark-attendance-status">Status</FieldLabel>
                <Select value={status} onValueChange={(value) => value && setStatus(value as AttendanceStatus)}>
                  <SelectTrigger id="mark-attendance-status" className="w-full">
                    <SelectValue>
                      {(value: AttendanceStatus) => STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="mark-attendance-remarks">Remarks (Optional)</FieldLabel>
              <Textarea
                id="mark-attendance-remarks"
                rows={3}
                placeholder="Any notes about this record…"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Marking…" : "Mark Attendance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
