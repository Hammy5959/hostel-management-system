"use client"

import { MapPin, Wrench } from "lucide-react"

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
import type { Complaint, MaintenanceTicket } from "@/lib/types"

export function ComplaintDetailDialog({
  open,
  onOpenChange,
  complaint,
  residentName,
  roomLabel,
  ticket,
  staffLabel,
  canCreateTicket,
  canCancel,
  acting,
  onCreateTicket,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  complaint: Complaint | null
  residentName: string
  roomLabel: string | null
  ticket: MaintenanceTicket | undefined
  staffLabel: (staffId: string | null) => string
  canCreateTicket: boolean
  canCancel: boolean
  acting: boolean
  onCreateTicket: () => void
  onCancel: () => void
}) {
  if (!complaint) return null

  const isOpen = complaint.status === "open"
  const showActions = isOpen && (canCreateTicket || canCancel)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>{complaint.title}</DialogTitle>
            <StatusBadge
              status={complaint.status}
              tone={MAINTENANCE_STATUS_TONE[complaint.status]}
              label={MAINTENANCE_STATUS_LABEL[complaint.status]}
            />
          </div>
          <DialogDescription>
            Filed by {residentName} · {formatDateTime(complaint.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Description</p>
            <p className="text-on-surface">{complaint.description}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Category</p>
              <p className="text-on-surface">{complaint.category || "—"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase">Priority</p>
              <StatusBadge
                status={complaint.priority}
                tone={PRIORITY_TONE[complaint.priority]}
                label={PRIORITY_LABEL[complaint.priority]}
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

          {ticket && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <div className="flex items-center gap-2">
                <Wrench aria-hidden className="size-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-on-surface-variant uppercase">Linked Ticket</p>
                  <p className="text-on-surface">
                    {ticket.status === "resolved" || ticket.status === "closed"
                      ? `Resolved by ${staffLabel(ticket.assigned_to)}`
                      : ticket.assigned_to
                        ? `Assigned to ${staffLabel(ticket.assigned_to)}`
                        : "Not yet assigned"}
                  </p>
                </div>
              </div>
              <StatusBadge
                status={ticket.status}
                tone={MAINTENANCE_STATUS_TONE[ticket.status]}
                label={MAINTENANCE_STATUS_LABEL[ticket.status]}
              />
            </div>
          )}
        </div>

        {showActions && (
          <DialogFooter className="shrink-0">
            {canCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={acting}>
                Cancel Complaint
              </Button>
            )}
            {canCreateTicket && (
              <Button type="button" size="sm" onClick={onCreateTicket} disabled={acting}>
                {acting ? "Creating…" : "Create Ticket"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
