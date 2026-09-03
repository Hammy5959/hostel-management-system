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
import { ApiError, createAsset, getInventoryItem, updateAsset } from "@/lib/api"
import { fetchInventoryItemOptions } from "@/lib/hostel-options"
import { ASSET_STATUS_LABEL } from "@/components/assets/asset-status"
import type { Asset, AssetStatus } from "@/lib/types"

const STATUS_OPTIONS = (Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((value) => ({
  value,
  label: ASSET_STATUS_LABEL[value],
}))

/** New Asset / Edit Asset form — mirrors ComplaintFormDialog's/ItemFormDialog's
 * create/edit dual-mode pattern (`asset: null` creates, an `Asset` edits it).
 * Asset Number and the linked Inventory Item are fixed once created —
 * AssetUpdate on the backend doesn't accept either — so both are shown
 * read-only in edit mode, same convention as Inventory's fixed category.
 *
 * Remounted via `key` in the parent each time it opens for a different
 * target, same as every other form dialog in this app. */
export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
}) {
  const isEdit = !!asset
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Asset" : "New Asset"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this asset's details." : "Register a new durable asset."}
          </DialogDescription>
        </DialogHeader>

        {open && <AssetForm asset={asset} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function AssetForm({
  asset,
  onOpenChange,
}: {
  asset: Asset | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!asset

  const [inventoryItem, setInventoryItem] = useState<ComboOption | null>(null)
  const [assetNumber, setAssetNumber] = useState("")
  const [name, setName] = useState(asset?.name ?? "")
  const [serialNumber, setSerialNumber] = useState(asset?.serial_number ?? "")
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchase_date ?? "")
  const [purchaseCost, setPurchaseCost] = useState(asset?.purchase_cost != null ? String(asset.purchase_cost) : "")
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? "available")
  const [condition, setCondition] = useState(asset?.condition ?? "")
  const [notes, setNotes] = useState(asset?.notes ?? "")

  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Edit mode: resolve the asset's linked inventory item (if any) for
  // read-only display.
  const linkedItemQuery = useQuery({
    queryKey: ["inventory-item", asset?.inventory_item_id],
    queryFn: () => getInventoryItem(asset!.inventory_item_id!),
    enabled: isEdit && !!asset?.inventory_item_id,
    staleTime: 5 * 60_000,
  })

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError("Name is required")
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      if (isEdit && asset) {
        await updateAsset(asset.id, {
          name: name.trim(),
          serial_number: serialNumber.trim() || null,
          purchase_date: purchaseDate || null,
          purchase_cost: purchaseCost.trim() || null,
          status,
          condition: condition.trim() || null,
          notes: notes.trim() || null,
        })
        toast.success("Asset updated.")
      } else {
        await createAsset({
          inventory_item_id: inventoryItem?.value ?? null,
          asset_number: assetNumber.trim() || null,
          name: name.trim(),
          serial_number: serialNumber.trim() || null,
          purchase_date: purchaseDate || null,
          purchase_cost: purchaseCost.trim() || null,
          status,
          condition: condition.trim() || null,
          notes: notes.trim() || null,
        })
        toast.success("Asset created.")
      }
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("assets.manage")
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
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel>Asset Number</FieldLabel>
              {isEdit ? (
                <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 font-mono text-sm text-on-surface-variant">
                  {asset.asset_number}
                </p>
              ) : (
                <Input
                  value={assetNumber}
                  onChange={(e) => setAssetNumber(e.target.value)}
                  placeholder="Leave blank to auto-generate"
                />
              )}
            </Field>

            {isEdit ? (
              <Field>
                <FieldLabel>Inventory Item</FieldLabel>
                <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-on-surface-variant">
                  {asset.inventory_item_id ? (linkedItemQuery.data?.name ?? "Loading…") : "None"}
                </p>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="asset-form-inventory-item">Inventory Item (Optional)</FieldLabel>
                <EntityCombobox
                  id="asset-form-inventory-item"
                  value={inventoryItem}
                  onChange={setInventoryItem}
                  fetchOptions={fetchInventoryItemOptions}
                  placeholder="Link to an inventory item…"
                />
              </Field>
            )}
          </div>

          <Field data-invalid={!!nameError}>
            <FieldLabel htmlFor="asset-form-name">
              Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="asset-form-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (e.target.value.trim()) setNameError(null)
              }}
              placeholder="e.g. Ergonomic Study Chair"
            />
            <FieldError errors={[nameError ? { message: nameError } : undefined]} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="asset-form-serial">Serial Number (Optional)</FieldLabel>
              <Input
                id="asset-form-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g. SN-FURN-1021"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-form-status">Status</FieldLabel>
              <Select value={status} onValueChange={(value) => value && setStatus(value as AssetStatus)}>
                <SelectTrigger id="asset-form-status" className="w-full">
                  <SelectValue />
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

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="asset-form-purchase-date">Purchase Date (Optional)</FieldLabel>
              <Input
                id="asset-form-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-form-purchase-cost">Purchase Cost (Optional)</FieldLabel>
              <Input
                id="asset-form-purchase-cost"
                type="number"
                min={0}
                step="0.01"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="asset-form-condition">Condition (Optional)</FieldLabel>
            <Input
              id="asset-form-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g. Good, Fair, Needs repair"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="asset-form-notes">Notes (Optional)</FieldLabel>
            <Textarea
              id="asset-form-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details…"
            />
          </Field>
        </FieldGroup>
      </div>

      <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Asset"}
        </Button>
      </DialogFooter>
    </form>
  )
}
