"use client"

import { CalendarDays, MapPin, Phone } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import type { LeaveRequest } from "@/lib/types"

const STATUS_TONE: Record<LeaveRequest["status"], Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function durationDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

/** Read-only leave request detail, opened via the table's View icon. Only
 * offers Approve/Reject/Cancel when the request is still pending, mirroring
 * the backend's own transition guard — a non-pending leave can never be
 * acted on again. */
export function LeaveRequestDetailDialog({
  open,
  onOpenChange,
  leave,
  residentName,
  residentSubtitle,
  residentAvatarUrl,
  reviewedByLabel,
  canApprove,
  canReject,
  canCancel,
  onApprove,
  onReject,
  onCancel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leave: LeaveRequest | null
  residentName: string
  residentSubtitle?: string
  residentAvatarUrl?: string | null
  reviewedByLabel: string
  canApprove: boolean
  canReject: boolean
  canCancel: boolean
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
}) {
  if (!leave) return null

  const isPending = leave.status === "pending"
  const showActions = isPending && (canApprove || canReject || canCancel)
  const initials = residentName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join("")
    .slice(0, 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Leave Request</DialogTitle>
            <StatusBadge status={leave.status} tone={STATUS_TONE[leave.status]} />
          </div>
          <DialogDescription>
            {formatDate(leave.start_date)} – {formatDate(leave.end_date)} ·{" "}
            {durationDays(leave.start_date, leave.end_date)} day
            {durationDays(leave.start_date, leave.end_date) === 1 ? "" : "s"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="flex items-center gap-3">
            <Avatar className="size-10 border border-outline-variant">
              <AvatarImage src={residentAvatarUrl ?? undefined} alt={residentName} />
              <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-semibold text-on-surface">{residentName}</p>
              {residentSubtitle && (
                <p className="truncate text-xs text-on-surface-variant">{residentSubtitle}</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Reason</p>
            <p className="text-on-surface">{leave.reason}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <MapPin aria-hidden className="size-3.5" /> Destination
              </p>
              <p className="text-on-surface">{leave.destination || "—"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <Phone aria-hidden className="size-3.5" /> Contact Phone
              </p>
              <p className="text-on-surface">{leave.contact_phone || "—"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <CalendarDays aria-hidden className="size-3.5" /> Requested
              </p>
              <p className="text-on-surface">{formatDateTime(leave.requested_at)}</p>
            </div>
          </div>

          {!isPending && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <p className="mb-2 text-xs font-semibold text-on-surface-variant uppercase">Review</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-on-surface-variant">Reviewed by</p>
                  <p className="text-on-surface">{reviewedByLabel}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Reviewed at</p>
                  <p className="text-on-surface">{formatDateTime(leave.reviewed_at)}</p>
                </div>
              </div>
              {leave.review_notes && (
                <div className="mt-2">
                  <p className="text-xs text-on-surface-variant">Notes</p>
                  <p className="text-on-surface-variant">{leave.review_notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {showActions && (
          <DialogFooter className="shrink-0">
            {canCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Cancel Request
              </Button>
            )}
            {canReject && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={onReject}
              >
                Reject
              </Button>
            )}
            {canApprove && (
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={onApprove}
              >
                Approve
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
