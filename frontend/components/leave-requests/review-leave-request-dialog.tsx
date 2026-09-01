"use client"

import { useState } from "react"

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
import { Field, FieldLabel } from "@/components/ui/field"
import type { LeaveRequest } from "@/lib/types"

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

/** Shared approve/reject confirm-with-notes dialog — mirrors
 * RejectAdmissionDialog's notes-textarea pattern, parameterized so a single
 * component covers both leave-request transitions. */
export function ReviewLeaveRequestDialog({
  open,
  onOpenChange,
  mode,
  leave,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "approve" | "reject"
  leave: LeaveRequest | null
  loading: boolean
  onConfirm: (notes: string) => void
}) {
  const [notes, setNotes] = useState("")
  const isApprove = mode === "approve"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setNotes("")
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isApprove ? "Approve Leave Request" : "Reject Leave Request"}</DialogTitle>
          <DialogDescription>
            {isApprove
              ? "You are about to approve this leave request"
              : "You are about to reject this leave request"}
            {leave ? ` (${formatDate(leave.start_date)} – ${formatDate(leave.end_date)})` : ""}.{" "}
            {isApprove
              ? "You may add optional notes for the resident's record."
              : "Please provide a reason for this rejection, if any."}
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="review-leave-notes">Review Notes (Optional)</FieldLabel>
          <Textarea
            id="review-leave-notes"
            rows={4}
            placeholder={isApprove ? "Any notes about this approval…" : "e.g., Overlaps with exam schedule…"}
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
            variant={isApprove ? "default" : "destructive"}
            className={isApprove ? "bg-emerald-600 text-white hover:bg-emerald-700" : undefined}
            disabled={loading}
            onClick={() => onConfirm(notes)}
          >
            {loading ? "Working…" : isApprove ? "Confirm Approval" : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
