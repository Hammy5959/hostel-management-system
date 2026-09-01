"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useForm, Controller } from "react-hook-form"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, updateAttendance } from "@/lib/api"
import type { AttendanceRecord, AttendanceStatus } from "@/lib/types"

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "On Leave" },
]

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

interface EditFormValues {
  status: AttendanceStatus
  remarks: string
}

export function EditAttendanceDialog({
  open,
  onOpenChange,
  record,
  residentName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: AttendanceRecord | null
  /** Resolved separately by the parent view — the record itself only carries resident_id. */
  residentName: string
}) {
  const queryClient = useQueryClient()

  const { control, register, handleSubmit, formState: { isSubmitting } } = useForm<EditFormValues>({
    values: {
      status: record?.status ?? "present",
      remarks: record?.remarks ?? "",
    },
  })

  async function onSubmit(values: EditFormValues) {
    if (!record) return
    try {
      await updateAttendance(record.id, {
        status: values.status,
        remarks: values.remarks || null,
      })
      toast.success("Attendance updated.")
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
      queryClient.invalidateQueries({ queryKey: ["attendance-report"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("attendance.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Attendance</DialogTitle>
          <DialogDescription>
            {record ? `${residentName} · ${formatDate(record.attendance_date)}` : "Update this attendance record."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-attendance-status">Status</FieldLabel>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <SelectTrigger id="edit-attendance-status" className="w-full">
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
                )}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-attendance-remarks">Remarks (Optional)</FieldLabel>
              <Textarea id="edit-attendance-remarks" rows={3} {...register("remarks")} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !record}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
