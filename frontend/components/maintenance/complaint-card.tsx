"use client"

import type { ReactNode } from "react"
import { Pencil, Wrench } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import type { Complaint, ComplaintStatus, MaintenancePriority, MaintenanceTicket } from "@/lib/types"

export const MAINTENANCE_STATUS_TONE: Record<ComplaintStatus, Tone> = {
  open: "warning",
  assigned: "info",
  in_progress: "violet",
  resolved: "success",
  closed: "neutral",
  cancelled: "danger",
}

export const MAINTENANCE_STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
}

export const PRIORITY_TONE: Record<MaintenancePriority, Tone> = {
  low: "neutral",
  normal: "info",
  high: "warning",
  urgent: "danger",
}

export const PRIORITY_LABEL: Record<MaintenancePriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ComplaintCard({
  complaint,
  residentName,
  roomLabel,
  ticket,
  staffLabel,
  onOpenDetail,
  onEdit,
  onCreateTicket,
  onCancel,
  acting,
  canEdit,
  canCreateTicket,
  canCancel,
}: {
  complaint: Complaint
  residentName: string
  roomLabel: string | null
  /** The linked ticket, if one has been created from this complaint —
   * resolved client-side, see useTicketsByComplaintId() in maintenance-view.tsx. */
  ticket: MaintenanceTicket | undefined
  staffLabel: (staffId: string | null) => string
  onOpenDetail: () => void
  onEdit: () => void
  onCreateTicket: () => void
  onCancel: () => void
  acting: boolean
  /** Already status-gated by the parent (only true while status === "open"). */
  canEdit: boolean
  canCreateTicket: boolean
  canCancel: boolean
}) {
  const isOpen = complaint.status === "open"

  let footer: ReactNode = null
  if (ticket && (ticket.status === "assigned" || ticket.status === "in_progress")) {
    footer = (
      <>
        <Wrench aria-hidden className="size-3.5 shrink-0 text-primary" />
        <span>
          Assigned to: <strong className="font-semibold text-on-surface">{staffLabel(ticket.assigned_to)}</strong>
        </span>
      </>
    )
  } else if (ticket && (ticket.status === "resolved" || ticket.status === "closed")) {
    footer = (
      <span>
        Resolved by: <strong className="font-semibold text-on-surface">{staffLabel(ticket.assigned_to)}</strong>
      </span>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpenDetail()
        }
      }}
      className="group flex cursor-pointer flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="mb-3.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-on-surface group-hover:text-primary">
            {residentName}
          </h4>
          <p className="mt-0.5 truncate text-xs text-on-surface-variant">{roomLabel ?? "No room"}</p>
        </div>
        <StatusBadge
          status={complaint.status}
          tone={MAINTENANCE_STATUS_TONE[complaint.status]}
          label={MAINTENANCE_STATUS_LABEL[complaint.status]}
        />
      </div>

      <h3 className="mb-2 line-clamp-2 text-[17px] leading-snug font-bold text-on-surface">{complaint.title}</h3>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {complaint.category && (
          <span className="rounded bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">
            {complaint.category}
          </span>
        )}
        <StatusBadge
          status={complaint.priority}
          tone={PRIORITY_TONE[complaint.priority]}
          label={PRIORITY_LABEL[complaint.priority]}
        />
        <span className="ml-auto text-xs text-on-surface-variant">{formatDateTime(complaint.created_at)}</span>
      </div>

      <p className="mb-1 line-clamp-2 flex-1 text-sm text-on-surface-variant">{complaint.description}</p>

      {isOpen && (canEdit || canCreateTicket || canCancel) && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-outline-variant pt-4">
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${complaint.title}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit()
                }}
                className="rounded-full text-on-surface-variant opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-surface-container-low hover:text-primary focus-visible:opacity-100"
              >
                <Pencil aria-hidden className="size-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-1 items-center gap-3">
            {canCreateTicket && (
              <Button
                type="button"
                size="sm"
                className="flex-1"
                disabled={acting}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateTicket()
                }}
              >
                {acting ? "Creating…" : "Create Ticket"}
              </Button>
            )}
            {canCancel && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={acting}
                onClick={(e) => {
                  e.stopPropagation()
                  onCancel()
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      {!isOpen && footer && (
        <div
          className={cn(
            "-mx-5 -mb-5 mt-4 flex items-center gap-2 rounded-b-xl border-t border-outline-variant bg-surface-container-low/60 px-5 py-3 text-xs font-medium text-on-surface",
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
