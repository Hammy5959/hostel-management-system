"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, Eye, Package, Pencil, Plus, Search, ShieldOff, UserCog } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge } from "@/components/hostel/status-badge"

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import {
  ApiError,
  createAssetAssignment,
  getAsset,
  getAssetAssignments,
  getAssets,
  getInventoryCategories,
  getInventoryItem,
  getResident,
  getRoom,
  getStaff,
  returnAssetAssignment,
} from "@/lib/api"
import type { Asset, AssetAssignment, AssetStatus, Resident, Room, Staff } from "@/lib/types"

import { ASSET_STATUS_LABEL, ASSET_STATUS_TONE, formatDateTime } from "@/components/assets/asset-status"
import { AssetFormDialog } from "@/components/assets/asset-form-dialog"
import { AssetDetailDialog } from "@/components/assets/asset-detail-dialog"
import { AssignAssetDialog, type AssignAssetResult } from "@/components/assets/assign-asset-dialog"
import { ReturnAssetDialog } from "@/components/assets/return-asset-dialog"
import { AssignmentDetailDialog } from "@/components/assets/assignment-detail-dialog"

const PAGE_SIZE = 20
const STATUS_OPTIONS = (Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((value) => ({
  value,
  label: ASSET_STATUS_LABEL[value],
}))

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

/** Resident/staff/room name lookups, shared by the Assets tab's "Assigned
 * To" column and the Assignments tab's own rows — same per-id useQueries
 * shape as every other lookup hook in this app (see maintenance-view.tsx). */
function useResidentNameLookup(ids: string[]) {
  const queries = useQueries({ queries: ids.map((id) => ({ queryKey: ["resident", id], queryFn: () => getResident(id), staleTime: 5 * 60_000 })) })
  const map = new Map<string, Resident>()
  ids.forEach((id, i) => {
    const r = queries[i]?.data
    if (r) map.set(id, r)
  })
  return map
}
function useStaffNameLookup(ids: string[]) {
  const queries = useQueries({ queries: ids.map((id) => ({ queryKey: ["staff", id], queryFn: () => getStaff(id), staleTime: 5 * 60_000 })) })
  const map = new Map<string, Staff>()
  ids.forEach((id, i) => {
    const s = queries[i]?.data
    if (s) map.set(id, s)
  })
  return map
}
function useRoomNameLookup(ids: string[]) {
  const queries = useQueries({ queries: ids.map((id) => ({ queryKey: ["room", id], queryFn: () => getRoom(id), staleTime: 5 * 60_000 })) })
  const map = new Map<string, Room>()
  ids.forEach((id, i) => {
    const r = queries[i]?.data
    if (r) map.set(id, r)
  })
  return map
}

export function AssetsView() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<"assets" | "assignments">("assets")

  // Assets tab filters
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"" | AssetStatus>("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(PAGE_SIZE)

  // Assignments tab filters
  const [returnedFilter, setReturnedFilter] = useState<"" | "active" | "returned">("")
  const [assignmentPage, setAssignmentPage] = useState(1)
  const [assignmentPerPage, setAssignmentPerPage] = useState(PAGE_SIZE)

  const [formOpen, setFormOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [detailTarget, setDetailTarget] = useState<Asset | null>(null)
  const [assignTarget, setAssignTarget] = useState<Asset | null>(null)
  const [returnTarget, setReturnTarget] = useState<Asset | null>(null)
  const [assignmentDetailTarget, setAssignmentDetailTarget] = useState<AssetAssignment | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)

  const canView = has("assets.view")
  const canManageAssets = has("assets.manage")
  const canViewAssignments = has("asset_assignments.view")
  const canManageAssignments = has("asset_assignments.manage")

  /* ── Categories (filter dropdown + category-per-asset resolution) ──── */

  const categoriesQuery = useQuery({
    queryKey: ["inventory-categories", "all"],
    queryFn: () => getInventoryCategories({ per_page: 100 }),
    enabled: canView,
  })
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categoriesQuery.data?.items ?? []) map.set(c.id, c.name)
    return map
  }, [categoriesQuery.data])

  /* ── Stat cards ─────────────────────────────────────────────── */

  const totalStatQuery = useQuery({ queryKey: ["assets", "stat", "total"], queryFn: () => getAssets({ per_page: 1 }), enabled: canView })
  const availableStatQuery = useQuery({
    queryKey: ["assets", "stat", "available"],
    queryFn: () => getAssets({ status: "available", per_page: 1 }),
    enabled: canView,
  })
  const assignedStatQuery = useQuery({
    queryKey: ["assets", "stat", "assigned"],
    queryFn: () => getAssets({ status: "assigned", per_page: 1 }),
    enabled: canView,
  })
  const damagedStatQuery = useQuery({
    queryKey: ["assets", "stat", "damaged"],
    queryFn: () => getAssets({ status: "damaged", per_page: 1 }),
    enabled: canView,
  })
  const maintenanceStatQuery = useQuery({
    queryKey: ["assets", "stat", "maintenance"],
    queryFn: () => getAssets({ status: "maintenance", per_page: 1 }),
    enabled: canView,
  })
  const lostStatQuery = useQuery({
    queryKey: ["assets", "stat", "lost"],
    queryFn: () => getAssets({ status: "lost", per_page: 1 }),
    enabled: canView,
  })
  const needsAttentionCount =
    damagedStatQuery.data && maintenanceStatQuery.data && lostStatQuery.data
      ? damagedStatQuery.data.total + maintenanceStatQuery.data.total + lostStatQuery.data.total
      : undefined

  /* ── Assets tab ─────────────────────────────────────────────── */

  const assetsQuery = useQuery({
    queryKey: ["assets", { page, perPage, statusFilter, categoryFilter, search }],
    queryFn: () =>
      getAssets({
        page,
        per_page: perPage,
        status: statusFilter || undefined,
        category_id: categoryFilter || undefined,
        search: search || undefined,
      }),
    enabled: canView,
  })
  const assets = assetsQuery.data?.items ?? []

  // Pragmatic shortcut #1: AssetOut carries no category — resolve each
  // page's unique inventory_item_id via per-id GET /inventory-items/{id},
  // then map its category_id through the bulk category name map above.
  const itemIds = [...new Set(assets.map((a) => a.inventory_item_id).filter((id): id is string => !!id))]
  const itemQueries = useQueries({
    queries: itemIds.map((id) => ({ queryKey: ["inventory-item", id], queryFn: () => getInventoryItem(id), staleTime: 5 * 60_000 })),
  })
  const itemById = new Map<string, { name: string; category_id: string | null }>()
  itemIds.forEach((id, i) => {
    const item = itemQueries[i]?.data
    if (item) itemById.set(id, item)
  })

  function categoryNameForAsset(asset: Asset): string | null {
    if (!asset.inventory_item_id) return null
    const item = itemById.get(asset.inventory_item_id)
    if (!item?.category_id) return null
    return categoryNameById.get(item.category_id) ?? null
  }

  // Pragmatic shortcut #2: an asset must be `available` to be reassigned, so
  // there's at most one open assignment per asset at a time — bulk-fetch
  // every currently-open assignment once and map it by asset_id, same
  // tradeoff as Maintenance's ticketByComplaintId.
  const activeAssignmentsQuery = useQuery({
    queryKey: ["asset-assignments", "active-map"],
    queryFn: () => getAssetAssignments({ returned: false, per_page: 100 }),
    enabled: canViewAssignments,
  })
  const assignmentByAssetId = useMemo(() => {
    const map = new Map<string, AssetAssignment>()
    for (const a of activeAssignmentsQuery.data?.items ?? []) map.set(a.asset_id, a)
    return map
  }, [activeAssignmentsQuery.data])

  /* ── Assignments tab ────────────────────────────────────────── */

  const assignmentsQuery = useQuery({
    queryKey: ["asset-assignments", { assignmentPage, assignmentPerPage, returnedFilter }],
    queryFn: () =>
      getAssetAssignments({
        page: assignmentPage,
        per_page: assignmentPerPage,
        returned: returnedFilter === "active" ? false : returnedFilter === "returned" ? true : undefined,
      }),
    enabled: canViewAssignments && tab === "assignments",
  })
  const assignmentRows = assignmentsQuery.data?.items ?? []

  const assignmentAssetIds = [...new Set(assignmentRows.map((a) => a.asset_id))]
  const assignmentAssetQueries = useQueries({
    queries: assignmentAssetIds.map((id) => ({ queryKey: ["asset", id], queryFn: () => getAsset(id), staleTime: 5 * 60_000 })),
  })
  const assetById = new Map<string, Asset>()
  assignmentAssetIds.forEach((id, i) => {
    const a = assignmentAssetQueries[i]?.data
    if (a) assetById.set(id, a)
  })

  function assetLabel(assetId: string): string {
    const a = assetById.get(assetId)
    return a ? `${a.name} (${a.asset_number})` : "Loading…"
  }

  // Union of both assignment sources (the bulk active-map and this page's
  // rows) feeds one shared set of resident/staff/room lookups.
  const allRelevantAssignments = [...(activeAssignmentsQuery.data?.items ?? []), ...assignmentRows]
  const residentIds = [...new Set(allRelevantAssignments.map((a) => a.resident_id).filter((id): id is string => !!id))]
  const staffIds = [...new Set(allRelevantAssignments.map((a) => a.staff_id).filter((id): id is string => !!id))]
  const roomIds = [...new Set(allRelevantAssignments.map((a) => a.room_id).filter((id): id is string => !!id))]
  const residentMap = useResidentNameLookup(residentIds)
  const staffMap = useStaffNameLookup(staffIds)
  const roomMap = useRoomNameLookup(roomIds)

  function targetLabel(assignment: AssetAssignment | undefined): string {
    if (!assignment) return "—"
    if (assignment.resident_id) {
      const r = residentMap.get(assignment.resident_id)
      return r ? [r.first_name, r.last_name].filter(Boolean).join(" ") : "Resident"
    }
    if (assignment.staff_id) {
      const s = staffMap.get(assignment.staff_id)
      return s?.user ? [s.user.first_name, s.user.last_name].filter(Boolean).join(" ") : "Staff"
    }
    if (assignment.room_id) {
      const r = roomMap.get(assignment.room_id)
      return r ? `Room ${r.room_number}` : "Room"
    }
    return "—"
  }

  /* ── Actions ────────────────────────────────────────────────── */

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: ["assets"] })
    queryClient.invalidateQueries({ queryKey: ["asset-assignments"] })
  }

  function openCreate() {
    setEditingAsset(null)
    setFormOpen(true)
  }
  function openEdit(asset: Asset) {
    setEditingAsset(asset)
    setFormOpen(true)
  }

  async function handleAssignConfirm(result: AssignAssetResult) {
    if (!assignTarget) return
    setDialogLoading(true)
    try {
      await createAssetAssignment({
        asset_id: assignTarget.id,
        resident_id: result.targetType === "resident" ? result.targetId : undefined,
        staff_id: result.targetType === "staff" ? result.targetId : undefined,
        room_id: result.targetType === "room" ? result.targetId : undefined,
        condition_on_assignment: result.conditionOnAssignment || undefined,
        notes: result.notes || undefined,
      })
      toast.success(`${assignTarget.name} assigned.`)
      invalidateAfterAction()
      setAssignTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("asset_assignments.manage")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleReturnConfirm(conditionOnReturn: string, notes: string) {
    if (!returnTarget) return
    const assignment = assignmentByAssetId.get(returnTarget.id)
    if (!assignment) {
      toast.error("Could not find this asset's active assignment. Try refreshing.")
      return
    }
    setDialogLoading(true)
    try {
      await returnAssetAssignment(assignment.id, {
        condition_on_return: conditionOnReturn || undefined,
        notes: notes || undefined,
      })
      toast.success(`${returnTarget.name} returned.`)
      invalidateAfterAction()
      setReturnTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("asset_assignments.manage")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  const forbidden = assetsQuery.error instanceof ApiError && assetsQuery.error.code === "missing_permission"
  const assignmentsForbidden = assignmentsQuery.error instanceof ApiError && assignmentsQuery.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Maintenance & Inventory" }, { label: "Assets" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Assets</h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Track, assign, and audit durable hostel equipment, furniture, and appliances.
            </p>
          </div>
          {canManageAssets && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              New Asset
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} iconClassName="bg-primary/10 text-primary" label="Total Assets" value={canView ? totalStatQuery.data?.total : 0} />
        <StatCard
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Available"
          value={canView ? availableStatQuery.data?.total : 0}
        />
        <StatCard
          icon={UserCog}
          iconClassName="bg-blue-50 text-blue-600"
          label="Assigned"
          value={canView ? assignedStatQuery.data?.total : 0}
        />
        <StatCard
          icon={AlertTriangle}
          iconClassName="bg-error-container text-error"
          label="Needs Attention"
          value={canView ? needsAttentionCount : 0}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => (value === "assets" || value === "assignments") && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="assets"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Assets
            </TabsTrigger>
            <TabsTrigger
              value="assignments"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Assignments
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="assets" className="space-y-6 pt-6">
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
                <Search aria-hidden className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant" />
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
                  placeholder="Search by name, asset #, or serial…"
                  aria-label="Search assets"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={statusFilter || "all"}
                onValueChange={(value) => {
                  setStatusFilter(!value || value === "all" ? "" : (value as AssetStatus))
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-40">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status: All</SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {forbidden ? (
              <div className="p-4">
                <EmptyState icon={ShieldOff} title="You don't have access to Assets" description="Ask an administrator to grant you the assets.view permission." />
              </div>
            ) : assetsQuery.isError ? (
              <div className="p-4">
                <ErrorState message={(assetsQuery.error as Error).message} onRetry={() => assetsQuery.refetch()} />
              </div>
            ) : assetsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : assets.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Package}
                  title="No assets"
                  description={search || statusFilter || categoryFilter ? "No assets match your filters." : "No assets have been registered yet."}
                  action={canManageAssets ? { label: "New Asset", onClick: openCreate } : undefined}
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse text-left">
                    <TableHeader>
                      <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Asset #</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Name</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Serial</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Category</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Status</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Assigned To</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-outline-variant">
                      {assets.map((asset) => (
                        <TableRow
                          key={asset.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailTarget(asset)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              setDetailTarget(asset)
                            }
                          }}
                          className="cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                        >
                          <TableCell className="px-6 py-4 font-mono text-xs font-semibold text-primary">{asset.asset_number}</TableCell>
                          <TableCell className="px-6 py-4 font-medium text-on-surface">{asset.name}</TableCell>
                          <TableCell className="px-6 py-4 font-mono text-xs text-on-surface-variant">{asset.serial_number ?? "—"}</TableCell>
                          <TableCell className="px-6 py-4">
                            <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-medium text-on-surface-variant">
                              {categoryNameForAsset(asset) ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <StatusBadge status={asset.status} tone={ASSET_STATUS_TONE[asset.status]} label={ASSET_STATUS_LABEL[asset.status]} />
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                            {asset.status === "assigned" ? targetLabel(assignmentByAssetId.get(asset.id)) : "—"}
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1.5">
                              {asset.status === "available" && canManageAssignments && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAssignTarget(asset)
                                  }}
                                >
                                  Assign
                                </Button>
                              )}
                              {asset.status === "assigned" && canManageAssignments && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setReturnTarget(asset)
                                  }}
                                >
                                  Return
                                </Button>
                              )}
                              {canManageAssets && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Edit ${asset.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEdit(asset)
                                  }}
                                  className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                                >
                                  <Pencil aria-hidden className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  page={assetsQuery.data?.page ?? page}
                  perPage={assetsQuery.data?.per_page ?? perPage}
                  total={assetsQuery.data?.total ?? 0}
                  onPageChange={setPage}
                  onPerPageChange={(next) => {
                    setPerPage(next)
                    setPage(1)
                  }}
                />
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-3">
              <Select
                value={returnedFilter || "all"}
                onValueChange={(value) => {
                  setReturnedFilter(!value || value === "all" ? "" : (value as "active" | "returned"))
                  setAssignmentPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-48">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status: All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {assignmentsForbidden ? (
              <div className="p-4">
                <EmptyState
                  icon={ShieldOff}
                  title="You don't have access to Asset Assignments"
                  description="Ask an administrator to grant you the asset_assignments.view permission."
                />
              </div>
            ) : assignmentsQuery.isError ? (
              <div className="p-4">
                <ErrorState message={(assignmentsQuery.error as Error).message} onRetry={() => assignmentsQuery.refetch()} />
              </div>
            ) : assignmentsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : assignmentRows.length === 0 ? (
              <div className="p-4">
                <EmptyState icon={UserCog} title="No assignments" description="No asset assignments match your filters." />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse text-left">
                    <TableHeader>
                      <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Asset</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Assigned To</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Assigned At</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Returned At</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Status</TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-outline-variant">
                      {assignmentRows.map((assignment) => {
                        const isReturned = !!assignment.returned_at
                        return (
                          <TableRow
                            key={assignment.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setAssignmentDetailTarget(assignment)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                setAssignmentDetailTarget(assignment)
                              }
                            }}
                            className="cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                          >
                            <TableCell className="px-6 py-4 text-sm text-on-surface">{assetLabel(assignment.asset_id)}</TableCell>
                            <TableCell className="px-6 py-4 text-sm text-on-surface-variant">{targetLabel(assignment)}</TableCell>
                            <TableCell className="px-6 py-4 text-sm text-on-surface">{formatDateTime(assignment.assigned_at)}</TableCell>
                            <TableCell className="px-6 py-4 text-sm text-on-surface-variant">{formatDateTime(assignment.returned_at)}</TableCell>
                            <TableCell className="px-6 py-4">
                              <StatusBadge
                                status={isReturned ? "returned" : "active"}
                                tone={isReturned ? "neutral" : "info"}
                                label={isReturned ? "Returned" : "Active"}
                              />
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="View assignment"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setAssignmentDetailTarget(assignment)
                                        }}
                                        className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                                      />
                                    }
                                  >
                                    <Eye aria-hidden className="size-4" />
                                  </TooltipTrigger>
                                  <TooltipContent>View</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  page={assignmentsQuery.data?.page ?? assignmentPage}
                  perPage={assignmentsQuery.data?.per_page ?? assignmentPerPage}
                  total={assignmentsQuery.data?.total ?? 0}
                  onPageChange={setAssignmentPage}
                  onPerPageChange={(next) => {
                    setAssignmentPerPage(next)
                    setAssignmentPage(1)
                  }}
                />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AssetFormDialog
        key={editingAsset?.id ?? "create"}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingAsset(null)
        }}
        asset={editingAsset}
      />

      <AssetDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        asset={detailTarget}
        categoryName={detailTarget ? categoryNameForAsset(detailTarget) : null}
        canAssign={canManageAssignments}
        canReturn={canManageAssignments}
        canEdit={canManageAssets}
        acting={dialogLoading}
        onAssign={() => detailTarget && setAssignTarget(detailTarget)}
        onReturn={() => detailTarget && setReturnTarget(detailTarget)}
        onEdit={() => detailTarget && openEdit(detailTarget)}
      />

      <AssignAssetDialog
        key={assignTarget?.id ?? "assign-none"}
        open={!!assignTarget}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        asset={assignTarget}
        loading={dialogLoading}
        onConfirm={handleAssignConfirm}
      />

      <ReturnAssetDialog
        key={returnTarget?.id ?? "return-none"}
        open={!!returnTarget}
        onOpenChange={(open) => !open && setReturnTarget(null)}
        asset={returnTarget}
        loading={dialogLoading}
        onConfirm={handleReturnConfirm}
      />

      <AssignmentDetailDialog
        open={!!assignmentDetailTarget}
        onOpenChange={(open) => !open && setAssignmentDetailTarget(null)}
        assignment={assignmentDetailTarget}
        assetLabel={assignmentDetailTarget ? assetLabel(assignmentDetailTarget.asset_id) : ""}
        targetLabel={targetLabel(assignmentDetailTarget ?? undefined)}
      />
    </div>
  )
}
