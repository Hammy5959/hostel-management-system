"use client"

import { MapPin } from "lucide-react"

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
import {
  formatDateTime,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_TONE,
  PRIORITY_LABEL,
  PRIORITY_TONE,
} from "@/components/maintenance/complaint-card"
import type { MaintenanceTicket } from "@/lib/types"

function TimelineRow({ label, timestamp, actor }: { label: string; timestamp: string; actor?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <div>
        <p className="font-medium text-on-surface">{label}</p>
        {actor && <p className="text-xs text-on-surface-variant">by {actor}</p>}
      </div>
      <span className="shrink-0 text-right text-on-surface-variant">{timestamp}</span>
    </div>
  )
}

export function TicketDetailDialog({
  open,
  onOpenChange,
  ticket,
  roomLabel,
  staffLabel,
  complaintTitle,
  canUpdate,
  canAssign,
  acting,
  onAssign,
  onStart,
  onResolve,
  onClose,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticket: MaintenanceTicket | null
  roomLabel: string | null
  staffLabel: (staffId: string | null) => string
  complaintTitle: string | null
  canUpdate: boolean
  canAssign: boolean
  acting: boolean
  onAssign: () => void
  onStart: () => void
  onResolve: () => void
  onClose: () => void
  onCancel: () => void
}) {
  if (!ticket) return null

  const isOpen = ticket.status === "open"
  const isAssigned = ticket.status === "assigned"
  const isInProgress = ticket.status === "in_progress"
  const isResolved = ticket.status === "resolved"
  const isCancellable = canUpdate && (isOpen || isAssigned || isInProgress)

  const showActions =
    (isOpen && canAssign) || (isAssigned && canUpdate) || (isInProgress && canUpdate) || (isResolved && canUpdate) || isCancellable

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{ticket.title}</DialogTitle>
            <StatusBadge
              status={ticket.status}
              tone={MAINTENANCE_STATUS_TONE[ticket.status]}
              label={MAINTENANCE_STATUS_LABEL[ticket.status]}
            />
          </div>
          <DialogDescription>Maintenance ticket details and timeline.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Description</p>
            <p className="text-on-surface">{ticket.description}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Category</p>
              <p className="text-on-surface">{ticket.category || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Priority</p>
              <StatusBadge
                status={ticket.priority}
                tone={PRIORITY_TONE[ticket.priority]}
                label={PRIORITY_LABEL[ticket.priority]}
                className="mt-0.5"
              />
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <MapPin aria-hidden className="size-3.5" /> Room
              </p>
              <p className="text-on-surface">{roomLabel ?? "—"}</p>
            </div>
          </div>

          {complaintTitle && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Filed From Complaint</p>
              <p className="text-on-surface">{complaintTitle}</p>
            </div>
          )}

          {ticket.resolution_notes && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Resolution Notes</p>
              <p className="text-on-surface-variant">{ticket.resolution_notes}</p>
            </div>
          )}

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Timeline</p>
            <div className="divide-y divide-outline-variant">
              <TimelineRow label="Created" timestamp={formatDateTime(ticket.created_at)} />
              {ticket.assigned_at && (
                <TimelineRow
                  label="Assigned"
                  timestamp={formatDateTime(ticket.assigned_at)}
                  actor={staffLabel(ticket.assigned_to)}
                />
              )}
              {ticket.started_at && <TimelineRow label="Started" timestamp={formatDateTime(ticket.started_at)} />}
              {ticket.resolved_at && (
                <TimelineRow
                  label={ticket.status === "closed" ? "Resolved (Closed)" : "Resolved"}
                  timestamp={formatDateTime(ticket.resolved_at)}
                  actor={staffLabel(ticket.assigned_to)}
                />
              )}
            </div>
          </div>
        </div>

        {showActions && (
          <DialogFooter className="shrink-0 flex-wrap">
            {isCancellable && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={acting}>
                Cancel Ticket
              </Button>
            )}
            {isOpen && canAssign && (
              <Button type="button" size="sm" onClick={onAssign} disabled={acting}>
                Assign
              </Button>
            )}
            {isAssigned && canUpdate && (
              <Button type="button" size="sm" onClick={onStart} disabled={acting}>
                {acting ? "Starting…" : "Start"}
              </Button>
            )}
            {isInProgress && canUpdate && (
              <Button type="button" size="sm" onClick={onResolve} disabled={acting}>
                {acting ? "Resolving…" : "Resolve"}
              </Button>
            )}
            {isResolved && canUpdate && (
              <Button type="button" size="sm" onClick={onClose} disabled={acting}>
                {acting ? "Closing…" : "Close"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
