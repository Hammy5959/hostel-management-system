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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import type { Asset } from "@/lib/types"

/** Return an assigned asset — POST /asset-assignments/{id}/return takes
 * `{ condition_on_return?, notes? }`. Remounted via `key` in the parent
 * each time it opens for a different asset, same as RejectGatePassDialog. */
export function ReturnAssetDialog({
  open,
  onOpenChange,
  asset,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  loading: boolean
  onConfirm: (conditionOnReturn: string, notes: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return asset</DialogTitle>
          <DialogDescription>
            Mark {asset?.name ?? "this asset"} as returned. It will become available again.
          </DialogDescription>
        </DialogHeader>

        {open && <ReturnForm loading={loading} onConfirm={onConfirm} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function ReturnForm({
  loading,
  onConfirm,
  onOpenChange,
}: {
  loading: boolean
  onConfirm: (conditionOnReturn: string, notes: string) => void
  onOpenChange: (open: boolean) => void
}) {
  const [conditionOnReturn, setConditionOnReturn] = useState("")
  const [notes, setNotes] = useState("")

  return (
    <>
      <Field>
        <FieldLabel htmlFor="return-asset-condition">Condition on Return (Optional)</FieldLabel>
        <Input
          id="return-asset-condition"
          value={conditionOnReturn}
          onChange={(e) => setConditionOnReturn(e.target.value)}
          placeholder="e.g. Minor scratches"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="return-asset-notes">Notes (Optional)</FieldLabel>
        <Textarea
          id="return-asset-notes"
          rows={2}
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
          disabled={loading}
          onClick={() => onConfirm(conditionOnReturn.trim(), notes.trim())}
        >
          {loading ? "Returning…" : "Return Asset"}
        </Button>
      </DialogFooter>
    </>
  )
}
