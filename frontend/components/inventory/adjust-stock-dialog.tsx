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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { InventoryItem } from "@/lib/types"

/** Delta-based stock adjustment — POST /inventory-items/{id}/adjust takes
 * `{ delta, reason? }`; the backend rejects delta === 0 (`invalid_delta`)
 * and a delta that would take quantity below zero (`insufficient_stock`),
 * both surfaced by the parent via the standard toast.error(err.message)
 * path. This dialog pre-empts the zero-delta case client-side (disabled
 * submit) since it's cheap to catch before a round trip. Remounted via
 * `key` in the parent each time it opens for a different item, same as
 * RejectGatePassDialog/AssignTicketDialog. */
export function AdjustStockDialog({
  open,
  onOpenChange,
  item,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
  loading: boolean
  onConfirm: (delta: number, reason: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {item ? `Current quantity: ${item.quantity}${item.unit ? ` ${item.unit}` : ""}.` : "Adjust stock quantity."}
          </DialogDescription>
        </DialogHeader>

        {open && item && <AdjustForm item={item} loading={loading} onConfirm={onConfirm} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function AdjustForm({
  item,
  loading,
  onConfirm,
  onOpenChange,
}: {
  item: InventoryItem
  loading: boolean
  onConfirm: (delta: number, reason: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [deltaInput, setDeltaInput] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)

  const delta = Number(deltaInput)
  const isValidDelta = deltaInput.trim() !== "" && Number.isFinite(delta) && Number.isInteger(delta) && delta !== 0
  const resultingQuantity = isValidDelta ? item.quantity + delta : item.quantity

  return (
    <>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="adjust-stock-delta">
          Amount <span className="text-destructive">*</span>
        </FieldLabel>
        <Input
          id="adjust-stock-delta"
          type="number"
          step={1}
          value={deltaInput}
          onChange={(e) => {
            setDeltaInput(e.target.value)
            setError(null)
          }}
          placeholder="e.g. 20 to add stock, -5 to remove"
        />
        <p className="text-xs text-on-surface-variant">
          Use a positive number for stock arriving, negative for stock used.
          {isValidDelta && (
            <>
              {" "}
              Resulting quantity:{" "}
              <strong className={resultingQuantity < 0 ? "text-destructive" : "text-on-surface"}>
                {resultingQuantity}
              </strong>
              {item.unit ? ` ${item.unit}` : ""}.
            </>
          )}
        </p>
        <FieldError errors={[error ? { message: error } : undefined]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="adjust-stock-reason">Reason (Optional)</FieldLabel>
        <Textarea
          id="adjust-stock-reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. New delivery, used for room 204 repair…"
        />
      </Field>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={loading || !isValidDelta}
          onClick={() => {
            if (!isValidDelta) {
              setError("Enter a non-zero whole number")
              return
            }
            onConfirm(delta, reason.trim())
          }}
        >
          {loading ? "Saving…" : "Adjust Stock"}
        </Button>
      </DialogFooter>
    </>
  )
}
