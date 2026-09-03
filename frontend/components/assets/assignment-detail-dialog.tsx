"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StatusBadge } from "@/components/hostel/status-badge"
import { formatDateTime } from "@/components/assets/asset-status"
import type { AssetAssignment } from "@/lib/types"

/** Read-only detail for one assignment row — returning/re-assigning happens
 * from the Assets tab, not here. Names are resolved by the parent
 * (assets-view.tsx already has the lookups for the currently-loaded page). */
export function AssignmentDetailDialog({
  open,
  onOpenChange,
  assignment,
  assetLabel,
  targetLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: AssetAssignment | null
  assetLabel: string
  targetLabel: string
}) {
  if (!assignment) return null

  const isReturned = !!assignment.returned_at

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{assetLabel}</DialogTitle>
            <StatusBadge
              status={isReturned ? "returned" : "active"}
              tone={isReturned ? "neutral" : "info"}
              label={isReturned ? "Returned" : "Active"}
            />
          </div>
          <DialogDescription>Assigned to {targetLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Assigned At</p>
              <p className="text-on-surface">{formatDateTime(assignment.assigned_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Returned At</p>
              <p className="text-on-surface">{formatDateTime(assignment.returned_at)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Condition on Assignment</p>
              <p className="text-on-surface">{assignment.condition_on_assignment ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Condition on Return</p>
              <p className="text-on-surface">{assignment.condition_on_return ?? "—"}</p>
            </div>
          </div>

          {assignment.notes && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Notes</p>
              <p className="text-on-surface-variant">{assignment.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
