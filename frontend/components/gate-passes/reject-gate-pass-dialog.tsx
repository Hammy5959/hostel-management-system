"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

/** Reject confirmation with an optional note — POST /gate-passes/{id}/reject
 * accepts `{ notes? }`, unlike approve which takes no body at all. Remounted
 * via `key` in the parent each time it opens for a different target, same
 * as VisitorFormDialog, so the note field always starts blank. */
export function RejectGatePassDialog({
  open,
  onOpenChange,
  passNumber,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  passNumber: string
  loading: boolean
  onConfirm: (notes: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject gate pass</DialogTitle>
          <DialogDescription>
            Reject {passNumber || "this gate pass"}. You may optionally add a reason for the resident&apos;s record.
          </DialogDescription>
        </DialogHeader>

        {open && <RejectForm loading={loading} onConfirm={onConfirm} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function RejectForm({
  loading,
  onConfirm,
  onOpenChange,
}: {
  loading: boolean
  onConfirm: (notes: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [notes, setNotes] = useState("")

  return (
    <>
      <Field>
        <FieldLabel htmlFor="reject-gate-pass-notes">Reason (Optional)</FieldLabel>
        <Textarea
          id="reject-gate-pass-notes"
          rows={3}
          placeholder="Why is this gate pass being rejected?"
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
          variant="destructive"
          onClick={() => onConfirm(notes.trim())}
          disabled={loading}
        >
          {loading ? "Rejecting…" : "Reject Gate Pass"}
        </Button>
      </DialogFooter>
    </>
  )
}
