"use client"

import { Package } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/hostel/status-badge"
import { computeStockStatus, STOCK_STATUS_LABEL, STOCK_STATUS_TONE } from "@/components/inventory/item-status"
import type { InventoryItem } from "@/lib/types"

export function ItemDetailDialog({
  open,
  onOpenChange,
  item,
  categoryName,
  canAdjust,
  canEdit,
  onAdjustStock,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
  categoryName: string | null
  canAdjust: boolean
  canEdit: boolean
  onAdjustStock: () => void
  onEdit: () => void
}) {
  if (!item) return null

  const status = computeStockStatus(item)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{item.name}</DialogTitle>
            <StatusBadge status={status} tone={STOCK_STATUS_TONE[status]} label={STOCK_STATUS_LABEL[status]} />
          </div>
          <DialogDescription>{item.sku ? `SKU: ${item.sku}` : "No SKU"}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          {item.description && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Description</p>
              <p className="text-on-surface">{item.description}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <Package aria-hidden className="size-3.5" /> Category
              </p>
              <p className="text-on-surface">{categoryName ?? "None"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Unit</p>
              <p className="text-on-surface">{item.unit ?? "—"}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Quantity</p>
              <p className="text-lg font-bold text-on-surface">{item.quantity}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Minimum Quantity</p>
              <p className="text-lg font-bold text-on-surface-variant">{item.minimum_quantity}</p>
            </div>
          </div>
        </div>

        {(canAdjust || canEdit) && (
          <DialogFooter className="shrink-0">
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {canAdjust && (
              <Button type="button" size="sm" onClick={onAdjustStock}>
                Adjust Stock
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
