"use client"

import { useMemo } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { Calendar, DollarSign, Tag } from "lucide-react"

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
import { ASSET_STATUS_LABEL, ASSET_STATUS_TONE, formatDateTime } from "@/components/assets/asset-status"
import { getAssetAssignments, getResident, getRoom, getStaff } from "@/lib/api"
import type { Asset, AssetAssignment, Resident, Room, Staff } from "@/lib/types"

function useTargetLookups(assignments: AssetAssignment[]) {
  const residentIds = useMemo(
    () => [...new Set(assignments.map((a) => a.resident_id).filter((id): id is string => !!id))],
    [assignments],
  )
  const staffIds = useMemo(
    () => [...new Set(assignments.map((a) => a.staff_id).filter((id): id is string => !!id))],
    [assignments],
  )
  const roomIds = useMemo(
    () => [...new Set(assignments.map((a) => a.room_id).filter((id): id is string => !!id))],
    [assignments],
  )

  const residentQueries = useQueries({
    queries: residentIds.map((id) => ({ queryKey: ["resident", id], queryFn: () => getResident(id), staleTime: 5 * 60_000 })),
  })
  const staffQueries = useQueries({
    queries: staffIds.map((id) => ({ queryKey: ["staff", id], queryFn: () => getStaff(id), staleTime: 5 * 60_000 })),
  })
  const roomQueries = useQueries({
    queries: roomIds.map((id) => ({ queryKey: ["room", id], queryFn: () => getRoom(id), staleTime: 5 * 60_000 })),
  })

  const residentMap = new Map<string, Resident>()
  residentIds.forEach((id, i) => {
    const r = residentQueries[i]?.data
    if (r) residentMap.set(id, r)
  })
  const staffMap = new Map<string, Staff>()
  staffIds.forEach((id, i) => {
    const s = staffQueries[i]?.data
    if (s) staffMap.set(id, s)
  })
  const roomMap = new Map<string, Room>()
  roomIds.forEach((id, i) => {
    const r = roomQueries[i]?.data
    if (r) roomMap.set(id, r)
  })

  function targetLabel(assignment: AssetAssignment): string {
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

  return { targetLabel }
}

export function AssetDetailDialog({
  open,
  onOpenChange,
  asset,
  categoryName,
  canAssign,
  canReturn,
  canEdit,
  acting,
  onAssign,
  onReturn,
  onEdit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  asset: Asset | null
  categoryName: string | null
  canAssign: boolean
  canReturn: boolean
  canEdit: boolean
  acting: boolean
  onAssign: () => void
  onReturn: () => void
  onEdit: () => void
}) {
  const historyQuery = useQuery({
    queryKey: ["asset-assignments", "history", asset?.id],
    queryFn: () => getAssetAssignments({ asset_id: asset!.id, per_page: 50 }),
    enabled: open && !!asset,
  })
  const history = historyQuery.data?.items ?? []
  const { targetLabel } = useTargetLookups(history)

  if (!asset) return null

  const showActions = (asset.status === "available" && canAssign) || (asset.status === "assigned" && canReturn) || canEdit

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{asset.name}</DialogTitle>
            <StatusBadge status={asset.status} tone={ASSET_STATUS_TONE[asset.status]} label={ASSET_STATUS_LABEL[asset.status]} />
          </div>
          <DialogDescription className="font-mono text-xs">{asset.asset_number}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Serial Number</p>
              <p className="text-on-surface">{asset.serial_number ?? "—"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <Tag aria-hidden className="size-3.5" /> Category
              </p>
              <p className="text-on-surface">{categoryName ?? "—"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <Calendar aria-hidden className="size-3.5" /> Purchase Date
              </p>
              <p className="text-on-surface">
                {asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : "—"}
              </p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <DollarSign aria-hidden className="size-3.5" /> Purchase Cost
              </p>
              <p className="text-on-surface">{asset.purchase_cost != null ? String(asset.purchase_cost) : "—"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Condition</p>
              <p className="text-on-surface">{asset.condition ?? "—"}</p>
            </div>
            {asset.notes && (
              <div className="col-span-2">
                <p className="text-xs font-semibold text-on-surface-variant uppercase">Notes</p>
                <p className="text-on-surface-variant">{asset.notes}</p>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Assignment History</p>
            {historyQuery.isLoading ? (
              <p className="text-on-surface-variant">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-on-surface-variant">Never assigned.</p>
            ) : (
              <div className="divide-y divide-outline-variant">
                {history.map((a) => (
                  <div key={a.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-on-surface">{targetLabel(a)}</span>
                      <StatusBadge
                        status={a.returned_at ? "returned" : "active"}
                        tone={a.returned_at ? "neutral" : "info"}
                        label={a.returned_at ? "Returned" : "Active"}
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      Assigned {formatDateTime(a.assigned_at)}
                      {a.returned_at ? ` · Returned ${formatDateTime(a.returned_at)}` : ""}
                    </p>
                    {(a.condition_on_assignment || a.condition_on_return) && (
                      <p className="text-xs text-on-surface-variant">
                        {a.condition_on_assignment && `On assignment: ${a.condition_on_assignment}`}
                        {a.condition_on_assignment && a.condition_on_return && " · "}
                        {a.condition_on_return && `On return: ${a.condition_on_return}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showActions && (
          <DialogFooter className="shrink-0">
            {canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={acting}>
                Edit
              </Button>
            )}
            {asset.status === "available" && canAssign && (
              <Button type="button" size="sm" onClick={onAssign} disabled={acting}>
                Assign
              </Button>
            )}
            {asset.status === "assigned" && canReturn && (
              <Button type="button" size="sm" onClick={onReturn} disabled={acting}>
                Return
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
