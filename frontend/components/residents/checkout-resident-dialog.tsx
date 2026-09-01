"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"

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
import type { Allocation, Resident } from "@/lib/types"

/** Checkout confirmation — shows what will be released and a soft dues
 * warning (never blocks Confirm) when the resident's active allocation
 * carries an unpaid payment_status. Mirrors ReviewLeaveRequestDialog's
 * confirm-with-notes shape. */
export function CheckoutResidentDialog({
  open,
  onOpenChange,
  resident,
  allocation,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  resident: Resident | null
  allocation: Allocation | null
  loading: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState("")
  const name = resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "this resident"
  const roomLabel = allocation
    ? [allocation.room?.building_name, allocation.room?.room_number ? `Room ${allocation.room.room_number}` : null, allocation.bed?.bed_number ? `Bed ${allocation.bed.bed_number}` : null]
        .filter(Boolean)
        .join(" · ")
    : null
  const hasDues =
    !!allocation?.payment_status &&
    allocation.payment_status.status !== "paid" &&
    allocation.payment_status.status !== "no_dues"

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setReason("")
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check Out {name}</DialogTitle>
          <DialogDescription>
            {roomLabel
              ? `This will release ${roomLabel} and mark ${name} as checked out.`
              : `This will mark ${name} as checked out.`}
          </DialogDescription>
        </DialogHeader>

        {hasDues && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              This resident has outstanding dues ({allocation!.payment_status!.label}). You can still check them out —
              this is a warning, not a block.
            </p>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="checkout-reason">Reason (Optional)</FieldLabel>
          <Textarea
            id="checkout-reason"
            rows={3}
            placeholder="e.g., Program completed, transferred to another hostel…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={loading} onClick={() => onConfirm(reason)}>
            {loading ? "Checking out…" : "Confirm Check Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
