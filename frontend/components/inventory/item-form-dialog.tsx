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

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createInventoryItem, getInventoryCategories, updateInventoryItem } from "@/lib/api"
import type { InventoryItem } from "@/lib/types"

/** New Item / Edit Item form — mirrors ComplaintFormDialog's create/edit
 * dual-mode pattern (`item: null` creates, an `InventoryItem` edits it).
 * Category is fixed once an item is created — InventoryItemUpdate on the
 * backend doesn't accept `category_id` — so in edit mode it's shown
 * read-only instead of the picker, same as how ComplaintFormDialog fixes
 * the resident field in edit mode.
 *
 * Remounted via `key` in the parent each time it opens for a different
 * target, same as every other form dialog in this app. */
export function ItemFormDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
}) {
  const isEdit = !!item
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit Item" : "New Item"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this item's details." : "Add a new item to the inventory."}
          </DialogDescription>
        </DialogHeader>

        {open && <ItemForm item={item} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  )
}

function ItemForm({
  item,
  onOpenChange,
}: {
  item: InventoryItem | null
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const isEdit = !!item

  const [name, setName] = useState(item?.name ?? "")
  const [sku, setSku] = useState(item?.sku ?? "")
  const [categoryId, setCategoryId] = useState(item?.category_id ?? "")
  const [description, setDescription] = useState(item?.description ?? "")
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 0))
  const [minimumQuantity, setMinimumQuantity] = useState(String(item?.minimum_quantity ?? 0))
  const [unit, setUnit] = useState(item?.unit ?? "")

  const [nameError, setNameError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ["inventory-categories", "all"],
    queryFn: () => getInventoryCategories({ per_page: 100 }),
  })
  const categoryName = isEdit ? categoriesQuery.data?.items.find((c) => c.id === item.category_id)?.name : undefined

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setNameError("Name is required")
      return
    }
    setNameError(null)
    setSubmitting(true)
    try {
      if (isEdit && item) {
        await updateInventoryItem(item.id, {
          name: name.trim(),
          sku: sku.trim() || null,
          description: description.trim() || null,
          quantity: Number(quantity) || 0,
          minimum_quantity: Number(minimumQuantity) || 0,
          unit: unit.trim() || null,
        })
        toast.success("Item updated.")
      } else {
        await createInventoryItem({
          category_id: categoryId || null,
          name: name.trim(),
          sku: sku.trim() || null,
          description: description.trim() || null,
          quantity: Number(quantity) || 0,
          minimum_quantity: Number(minimumQuantity) || 0,
          unit: unit.trim() || null,
        })
        toast.success("Item created.")
      }
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("inventory_items.manage")
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
          <Field data-invalid={!!nameError}>
            <FieldLabel htmlFor="item-form-name">
              Name <span className="text-destructive">*</span>
            </FieldLabel>
            <Input
              id="item-form-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (e.target.value.trim()) setNameError(null)
              }}
              placeholder="e.g. LED Tube Lights 18W"
            />
            <FieldError errors={[nameError ? { message: nameError } : undefined]} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="item-form-sku">SKU (Optional)</FieldLabel>
              <Input
                id="item-form-sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. SKU-ELEC-014"
              />
            </Field>

            {isEdit ? (
              <Field>
                <FieldLabel>Category</FieldLabel>
                <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-on-surface-variant">
                  {categoryName ?? "None"}
                </p>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="item-form-category">Category (Optional)</FieldLabel>
                <Select
                  value={categoryId || "none"}
                  onValueChange={(value) => setCategoryId(!value || value === "none" ? "" : value)}
                >
                  <SelectTrigger id="item-form-category" className="w-full">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Category</SelectItem>
                    {categoriesQuery.data?.items.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <Field>
            <FieldLabel htmlFor="item-form-description">Description (Optional)</FieldLabel>
            <Textarea
              id="item-form-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details…"
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel htmlFor="item-form-quantity">Quantity</FieldLabel>
              <Input
                id="item-form-quantity"
                type="number"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="item-form-min-quantity">Minimum Qty</FieldLabel>
              <Input
                id="item-form-min-quantity"
                type="number"
                min={0}
                value={minimumQuantity}
                onChange={(e) => setMinimumQuantity(e.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="item-form-unit">Unit</FieldLabel>
              <Input
                id="item-form-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs"
              />
            </Field>
          </div>
        </FieldGroup>
      </div>

      <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save Changes" : "Create Item"}
        </Button>
      </DialogFooter>
    </form>
  )
}
