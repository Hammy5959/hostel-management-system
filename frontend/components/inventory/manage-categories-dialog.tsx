"use client"

import { useState, type SubmitEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderTree, Pencil } from "lucide-react"
import { toast } from "sonner"

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
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createInventoryCategory, getInventoryCategories, updateInventoryCategory } from "@/lib/api"
import type { InventoryCategory } from "@/lib/types"

function invalidateCategories(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["inventory-categories"] })
}

/** Categories are managed entirely inside this modal — no separate page.
 * List + inline add + inline edit (swap a row into an edit form in place,
 * no nested dialog-in-dialog). The New/Edit Item form's category picker
 * shares the `["inventory-categories"]` query key, so it picks up changes
 * made here immediately. */
export function ManageCategoriesDialog({
  open,
  onOpenChange,
  canManage,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ["inventory-categories", "all"],
    queryFn: () => getInventoryCategories({ per_page: 100 }),
    enabled: open,
  })
  const categories = categoriesQuery.data?.items ?? []

  async function handleSaveEdit(id: string, name: string, description: string) {
    setSavingId(id)
    try {
      await updateInventoryCategory(id, { name: name.trim(), description: description.trim() || null })
      toast.success("Category updated.")
      invalidateCategories(queryClient)
      setEditingId(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("inventory_categories.manage")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>Add and edit inventory categories.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {canManage && <AddCategoryForm queryClient={queryClient} />}

          {categoriesQuery.error ? (
            <ErrorState
              message={(categoriesQuery.error as Error).message}
              onRetry={() => categoriesQuery.refetch()}
            />
          ) : categoriesQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <EmptyState icon={FolderTree} title="No categories" description="Add a category to get started." />
          ) : (
            <div className="space-y-2">
              {categories.map((category) =>
                editingId === category.id ? (
                  <EditCategoryForm
                    key={category.id}
                    category={category}
                    saving={savingId === category.id}
                    onSave={(name, description) => handleSaveEdit(category.id, name, description)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div
                    key={category.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-on-surface">{category.name}</p>
                      {category.description && (
                        <p className="truncate text-xs text-on-surface-variant">{category.description}</p>
                      )}
                    </div>
                    {canManage && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${category.name}`}
                        onClick={() => setEditingId(category.id)}
                        className="shrink-0 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-primary"
                      >
                        <Pencil aria-hidden className="size-4" />
                      </Button>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 shrink-0 border-t border-outline-variant pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddCategoryForm({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault()
    if (!name.trim()) {
      setError("Name is required")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await createInventoryCategory({ name: name.trim(), description: description.trim() || null })
      toast.success("Category added.")
      invalidateCategories(queryClient)
      setName("")
      setDescription("")
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("inventory_categories.manage")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (e.target.value.trim()) setError(null)
          }}
          placeholder="New category name"
          aria-label="New category name"
          className="flex-1"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          aria-label="New category description"
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={submitting} className="shrink-0">
          {submitting ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}

function EditCategoryForm({
  category,
  saving,
  onSave,
  onCancel,
}: {
  category: InventoryCategory
  saving: boolean
  onSave: (name: string, description: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? "")
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-surface-container-low p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (e.target.value.trim()) setError(null)
          }}
          aria-label="Category name"
          className="flex-1"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          aria-label="Category description"
          className="flex-1"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => {
            if (!name.trim()) {
              setError("Name is required")
              return
            }
            onSave(name, description)
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
