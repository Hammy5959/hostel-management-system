"use client"

import { useId, useState, type SubmitEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
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
import { ApiError, bulkMarkAttendance } from "@/lib/api"
import { fetchAttendanceEligibleResidentOptions } from "@/lib/hostel-options"
import { todayLocalDate } from "@/lib/utils"
import type { AttendanceStatus } from "@/lib/types"

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "On Leave" },
]

interface RollCallRow {
  key: string
  resident: ComboOption | null
  status: AttendanceStatus
  remarks: string
}

function newRow(): RollCallRow {
  return { key: crypto.randomUUID(), resident: null, status: "present", remarks: "" }
}

export function BulkMarkDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const idPrefix = useId()
  const [attendanceDate, setAttendanceDate] = useState(todayLocalDate)
  const [rows, setRows] = useState<RollCallRow[]>([newRow()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setAttendanceDate(todayLocalDate())
    setRows([newRow()])
    setError(null)
  }

  function updateRow(key: string, patch: Partial<RollCallRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.key !== key) : prev))
  }

  function fetchOptionsExcluding(currentKey: string) {
    const chosenIds = new Set(
      rows.filter((row) => row.key !== currentKey && row.resident).map((row) => row.resident!.value),
    )
    return async (search: string) => {
      const options = await fetchAttendanceEligibleResidentOptions(search)
      return options.filter((option) => !chosenIds.has(option.value))
    }
  }

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    const records = rows
      .filter((row) => row.resident)
      .map((row) => ({
        resident_id: row.resident!.value,
        attendance_date: attendanceDate,
        status: row.status,
        remarks: row.remarks || null,
      }))
    if (records.length === 0) {
      setError("Add at least one resident.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const result = await bulkMarkAttendance({ records })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] })
      if (result.skipped_count > 0) {
        const names = result.skipped
          .map((s) => rows.find((r) => r.resident?.value === s.resident_id)?.resident?.label ?? "a resident")
          .join(", ")
        toast.success(
          `${result.created_count} marked. ${result.skipped_count} skipped (already marked): ${names}.`,
        )
      } else {
        toast.success(`${result.created_count} residents marked for ${attendanceDate}.`)
      }
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Mark Attendance</DialogTitle>
          <DialogDescription>
            Mark attendance for a whole floor or room in one go — add each resident and their status.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <Field className="sm:max-w-50">
              <FieldLabel htmlFor={`${idPrefix}-date`}>Date</FieldLabel>
              <Input
                id={`${idPrefix}-date`}
                type="date"
                value={attendanceDate}
                onChange={(e) => setAttendanceDate(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => prev.map((row) => ({ ...row, status: "present" })))}
            >
              Mark all Present
            </Button>
          </div>

          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {rows.map((row, index) => (
              <div key={row.key} className="flex items-start gap-2 rounded-lg border border-outline-variant p-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <EntityCombobox
                    value={row.resident}
                    onChange={(next) => updateRow(row.key, { resident: next })}
                    fetchOptions={fetchOptionsExcluding(row.key)}
                    placeholder="Search by name or student ID…"
                  />
                  <div className="flex gap-2">
                    <Select
                      value={row.status}
                      onValueChange={(value) => value && updateRow(row.key, { status: value as AttendanceStatus })}
                    >
                      <SelectTrigger className="w-36" aria-label={`Status for resident ${index + 1}`}>
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
                    <Input
                      value={row.remarks}
                      onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                      placeholder="Remarks (optional)"
                      aria-label={`Remarks for resident ${index + 1}`}
                      className="flex-1"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove resident"
                  onClick={() => removeRow(row.key)}
                  disabled={rows.length === 1}
                  className="mt-1 shrink-0 text-on-surface-variant hover:text-destructive"
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setRows((prev) => [...prev, newRow()])}
          >
            <Plus aria-hidden className="size-4" />
            Add resident
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Marking…" : `Mark ${rows.filter((r) => r.resident).length || ""} Residents`.trim()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
