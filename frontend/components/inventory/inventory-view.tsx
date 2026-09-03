"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, FolderTree, Package, PackageX, Pencil, Plus, Search, ShieldOff } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge } from "@/components/hostel/status-badge"

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, adjustInventoryStock, getInventoryCategories, getInventoryItems } from "@/lib/api"
import type { InventoryItem } from "@/lib/types"

import { computeStockStatus, STOCK_STATUS_LABEL, STOCK_STATUS_TONE } from "@/components/inventory/item-status"
import { ItemFormDialog } from "@/components/inventory/item-form-dialog"
import { ItemDetailDialog } from "@/components/inventory/item-detail-dialog"
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog"
import { ManageCategoriesDialog } from "@/components/inventory/manage-categories-dialog"

const PAGE_SIZE = 20

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Package
  iconClassName: string
  label: string
  value: number | undefined
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={cn("flex size-10 items-center justify-center rounded-full", iconClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-10 w-20" />
      ) : (
        <p className="text-[32px] leading-none font-bold text-on-surface">{value.toLocaleString()}</p>
      )}
    </div>
  )
}

export function InventoryView() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(PAGE_SIZE)

  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [detailTarget, setDetailTarget] = useState<InventoryItem | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<InventoryItem | null>(null)
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false)
  const [dialogLoading, setDialogLoading] = useState(false)

  const canView = has("inventory_items.view")
  const canManageItems = has("inventory_items.manage")
  const canUpdateStock = has("inventory_items.update")
  const canViewCategories = has("inventory_categories.view")
  const canManageCategories = has("inventory_categories.manage")

  /* ── Categories (shared by filter dropdown, table's Category column, and
   * the item form/manage-categories dialogs via the same query key) ────── */

  const categoriesQuery = useQuery({
    queryKey: ["inventory-categories", "all"],
    queryFn: () => getInventoryCategories({ per_page: 100 }),
    enabled: canViewCategories,
  })
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categoriesQuery.data?.items ?? []) map.set(c.id, c.name)
    return map
  }, [categoriesQuery.data])

  /* ── Stat cards ─────────────────────────────────────────────── */

  const totalItemsStatQuery = useQuery({
    queryKey: ["inventory-items", "stat", "total"],
    queryFn: () => getInventoryItems({ per_page: 1 }),
    enabled: canView,
  })
  // Low Stock's total comes straight from the server (exact count, not
  // capped by the page below). Out of Stock has no dedicated server filter,
  // so it's derived client-side from this same low-stock page (quantity <=
  // minimum_quantity already covers quantity === 0) — capped at 100 rows,
  // a pragmatic shortcut for this one derived sub-count only, same
  // convention as Maintenance's "Resolved Today". A hostel's simultaneously
  // out-of-stock item count is realistically well under that cap.
  const lowStockStatQuery = useQuery({
    queryKey: ["inventory-items", "stat", "low-stock"],
    queryFn: () => getInventoryItems({ low_stock_only: true, per_page: 100 }),
    enabled: canView,
  })
  const outOfStockCount = useMemo(
    () => lowStockStatQuery.data?.items.filter((i) => i.quantity === 0).length,
    [lowStockStatQuery.data],
  )
  const categoriesStatQuery = useQuery({
    queryKey: ["inventory-categories", "stat", "total"],
    queryFn: () => getInventoryCategories({ per_page: 1 }),
    enabled: canViewCategories,
  })

  /* ── Items table ────────────────────────────────────────────── */

  const itemsQuery = useQuery({
    queryKey: ["inventory-items", { page, perPage, categoryFilter, lowStockOnly, search }],
    queryFn: () =>
      getInventoryItems({
        page,
        per_page: perPage,
        category_id: categoryFilter || undefined,
        low_stock_only: lowStockOnly || undefined,
        search: search || undefined,
      }),
    enabled: canView,
  })
  const items = itemsQuery.data?.items ?? []

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: ["inventory-items"] })
  }

  function openCreate() {
    setEditingItem(null)
    setFormOpen(true)
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item)
    setFormOpen(true)
  }

  async function handleAdjustConfirm(delta: number, reason: string) {
    if (!adjustTarget) return
    setDialogLoading(true)
    try {
      await adjustInventoryStock(adjustTarget.id, { delta, reason: reason || undefined })
      toast.success(`${adjustTarget.name} stock adjusted.`)
      invalidateAfterAction()
      setAdjustTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("inventory_items.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  const forbidden = itemsQuery.error instanceof ApiError && itemsQuery.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Maintenance & Inventory" }, { label: "Inventory" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Inventory</h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Track, restock, and manage consumable supplies and hostel amenities.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {canViewCategories && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setCategoriesDialogOpen(true)}
                className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
              >
                <FolderTree aria-hidden className="size-5" />
                Manage Categories
              </Button>
            )}
            {canManageItems && (
              <Button
                type="button"
                onClick={openCreate}
                className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
              >
                <Plus aria-hidden className="size-5" />
                New Item
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          iconClassName="bg-primary/10 text-primary"
          label="Total Items"
          value={canView ? totalItemsStatQuery.data?.total : 0}
        />
        <StatCard
          icon={AlertTriangle}
          iconClassName="bg-amber-50 text-amber-600"
          label="Low Stock"
          value={canView ? lowStockStatQuery.data?.total : 0}
        />
        <StatCard
          icon={PackageX}
          iconClassName="bg-error-container text-error"
          label="Out of Stock"
          value={canView ? outOfStockCount : 0}
        />
        <StatCard
          icon={FolderTree}
          iconClassName="bg-surface-container text-secondary"
          label="Categories"
          value={canViewCategories ? categoriesStatQuery.data?.total : 0}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
        <form
          onSubmit={(e: SubmitEvent) => {
            e.preventDefault()
            setSearch(searchInput.trim())
            setPage(1)
          }}
          className="flex flex-1 items-center gap-2"
        >
          <div className="relative w-full max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value
                setSearchInput(value)
                if (value.trim() === "") {
                  setSearch("")
                  setPage(1)
                }
              }}
              placeholder="Search by item name or SKU…"
              aria-label="Search inventory items"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={categoryFilter || "all"}
            onValueChange={(value) => {
              setCategoryFilter(!value || value === "all" ? "" : value)
              setPage(1)
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-48">
              <SelectValue placeholder="Category: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Category: All</SelectItem>
              {categoriesQuery.data?.items.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2.5 px-2 py-1">
            <Switch
              id="low-stock-only-toggle"
              checked={lowStockOnly}
              onCheckedChange={(checked) => {
                setLowStockOnly(checked === true)
                setPage(1)
              }}
            />
            <Label htmlFor="low-stock-only-toggle" className="cursor-pointer text-sm font-medium text-on-surface">
              Low stock only
            </Label>
          </label>
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        {forbidden ? (
          <div className="p-4">
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Inventory"
              description="Ask an administrator to grant you the inventory_items.view permission."
            />
          </div>
        ) : itemsQuery.isError ? (
          <div className="p-4">
            <ErrorState message={(itemsQuery.error as Error).message} onRetry={() => itemsQuery.refetch()} />
          </div>
        ) : itemsQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Package}
              title="No items"
              description={
                search || categoryFilter || lowStockOnly
                  ? "No items match your filters."
                  : "No inventory items have been added yet."
              }
              action={canManageItems ? { label: "New Item", onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full border-collapse text-left">
                <TableHeader>
                  <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Item
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      SKU
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Category
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Quantity
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Min
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Unit
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Status
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-outline-variant">
                  {items.map((item) => {
                    const status = computeStockStatus(item)
                    return (
                      <TableRow
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailTarget(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setDetailTarget(item)
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60",
                          status === "low_stock" && "border-l-4 border-l-amber-500 bg-amber-50/40",
                          status === "out_of_stock" && "border-l-4 border-l-destructive bg-destructive/5",
                        )}
                      >
                        <TableCell className="px-6 py-4">
                          <div>
                            <p className="font-medium text-on-surface">{item.name}</p>
                            {item.description && (
                              <p className="max-w-64 truncate text-xs text-on-surface-variant">{item.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4 font-mono text-xs text-on-surface-variant">
                          {item.sku ?? "—"}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">
                            {item.category_id ? (categoryNameById.get(item.category_id) ?? "—") : "—"}
                          </span>
                        </TableCell>
                        <TableCell
                          className={cn(
                            "px-6 py-4 text-right font-bold",
                            status === "out_of_stock" ? "text-destructive" : status === "low_stock" ? "text-amber-600" : "text-on-surface",
                          )}
                        >
                          {item.quantity}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right text-sm text-on-surface-variant">
                          {item.minimum_quantity}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm text-on-surface-variant">{item.unit ?? "—"}</TableCell>
                        <TableCell className="px-6 py-4">
                          <StatusBadge status={status} tone={STOCK_STATUS_TONE[status]} label={STOCK_STATUS_LABEL[status]} />
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {canUpdateStock && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setAdjustTarget(item)
                                }}
                              >
                                Adjust Stock
                              </Button>
                            )}
                            {canManageItems && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${item.name}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEdit(item)
                                }}
                                className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                              >
                                <Pencil aria-hidden className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <Pagination
              page={itemsQuery.data?.page ?? page}
              perPage={itemsQuery.data?.per_page ?? perPage}
              total={itemsQuery.data?.total ?? 0}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next)
                setPage(1)
              }}
            />
          </>
        )}
      </div>

      <ItemFormDialog
        key={editingItem?.id ?? "create"}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingItem(null)
        }}
        item={editingItem}
      />

      <ItemDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        item={detailTarget}
        categoryName={detailTarget?.category_id ? (categoryNameById.get(detailTarget.category_id) ?? null) : null}
        canAdjust={canUpdateStock}
        canEdit={canManageItems}
        onAdjustStock={() => detailTarget && setAdjustTarget(detailTarget)}
        onEdit={() => detailTarget && openEdit(detailTarget)}
      />

      <AdjustStockDialog
        key={adjustTarget?.id ?? "adjust-none"}
        open={!!adjustTarget}
        onOpenChange={(open) => !open && setAdjustTarget(null)}
        item={adjustTarget}
        loading={dialogLoading}
        onConfirm={handleAdjustConfirm}
      />

      <ManageCategoriesDialog
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
        canManage={canManageCategories}
      />
    </div>
  )
}
