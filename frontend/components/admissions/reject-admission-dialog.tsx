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
import type { AdmissionFull } from "@/lib/types"

export function RejectAdmissionDialog({
  open,
  onOpenChange,
  admission,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  admission: AdmissionFull | null
  loading: boolean
  onConfirm: (notes: string) => void
}) {
  const [notes, setNotes] = useState("")

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
          <DialogTitle>Reject Admission</DialogTitle>
          <DialogDescription>
            You are about to reject the admission application
            {admission ? ` for ${admission.admission_number}` : ""}. Please provide a reason for
            this rejection, if any.
          </DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor="reject-notes">Reason / Notes</FieldLabel>
          <Textarea
            id="reject-notes"
            rows={4}
            placeholder="e.g., Incomplete documentation, capacity reached…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={() => onConfirm(notes)}
          >
            {loading ? "Rejecting…" : "Confirm Rejection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
