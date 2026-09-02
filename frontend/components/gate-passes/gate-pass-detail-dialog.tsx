"use client"

import { CalendarClock, MapPin } from "lucide-react"

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
import type { GatePass, GatePassStatus } from "@/lib/types"

const GATE_PASS_STATUS_TONE: Record<GatePassStatus, Tone> = {
  pending: "warning",
  approved: "info",
  issued: "violet",
  exited: "success",
  returned: "neutral",
  rejected: "danger",
  cancelled: "danger",
}

const GATE_PASS_STATUS_LABEL: Record<GatePassStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  issued: "Issued",
  exited: "Out",
  returned: "Returned",
  rejected: "Rejected",
  cancelled: "Cancelled",
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

function TimelineRow({
  label,
  timestamp,
  actor,
}: {
  label: string
  timestamp: string
  actor?: string
}) {
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

export function GatePassDetailDialog({
  open,
  onOpenChange,
  pass,
  residentName,
  residentSubtitle,
  residentAvatarUrl,
  actedByLabel,
  canApprove,
  canReject,
  canCancel,
  canIssueAndExit,
  canVerify,
  acting,
  onApprove,
  onReject,
  onCancel,
  onIssueAndExit,
  onCompleteExit,
  onReturn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pass: GatePass | null
  residentName: string
  residentSubtitle?: string
  residentAvatarUrl?: string | null
  actedByLabel: (userId: string | null) => string
  canApprove: boolean
  canReject: boolean
  canCancel: boolean
  canIssueAndExit: boolean
  canVerify: boolean
  acting: boolean
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  onIssueAndExit: () => void
  onCompleteExit: () => void
  onReturn: () => void
}) {
  if (!pass) return null

  const isPending = pass.status === "pending"
  const isApproved = pass.status === "approved"
  const isIssued = pass.status === "issued"
  const isExited = pass.status === "exited"
  const isCancellable = (isPending || isApproved) && canCancel

  const showActions =
    (isPending && (canApprove || canReject)) ||
    isCancellable ||
    (isApproved && canIssueAndExit) ||
    (isIssued && canVerify) ||
    (isExited && canVerify)

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
            <DialogTitle>{pass.pass_number}</DialogTitle>
            <StatusBadge
              status={pass.status}
              tone={GATE_PASS_STATUS_TONE[pass.status]}
              label={GATE_PASS_STATUS_LABEL[pass.status]}
            />
          </div>
          <DialogDescription>Gate pass details and timeline.</DialogDescription>
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
              {residentSubtitle && <p className="truncate text-xs text-on-surface-variant">{residentSubtitle}</p>}
            </div>
          </div>

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Reason</p>
            <p className="text-on-surface">{pass.reason}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <MapPin aria-hidden className="size-3.5" /> Destination
              </p>
              <p className="text-on-surface">{pass.destination || "—"}</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs font-semibold text-on-surface-variant uppercase">
                <CalendarClock aria-hidden className="size-3.5" /> Expected Return
              </p>
              <p className="text-on-surface">{formatDateTime(pass.expected_return_at)}</p>
            </div>
          </div>

          {pass.notes && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
              <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Notes</p>
              <p className="text-on-surface-variant">{pass.notes}</p>
            </div>
          )}

          <div className="rounded-lg border border-outline-variant bg-surface-container-low p-3">
            <p className="mb-1 text-xs font-semibold text-on-surface-variant uppercase">Timeline</p>
            <div className="divide-y divide-outline-variant">
              <TimelineRow label="Requested" timestamp={formatDateTime(pass.requested_at)} actor={residentName} />
              {pass.approved_at && (
                <TimelineRow
                  label={pass.status === "rejected" ? "Rejected" : "Approved"}
                  timestamp={formatDateTime(pass.approved_at)}
                  actor={actedByLabel(pass.approved_by)}
                />
              )}
              {pass.issued_at && (
                <TimelineRow
                  label="Issued"
                  timestamp={formatDateTime(pass.issued_at)}
                  actor={actedByLabel(pass.issued_by)}
                />
              )}
              {(isExited || pass.status === "returned") && (
                <TimelineRow
                  label="Exited"
                  timestamp={formatDateTime(pass.departure_at)}
                  // verified_by is shared with the return step and gets
                  // overwritten by it, so once returned we can no longer
                  // attribute the exit to a specific verifier.
                  actor={pass.status === "returned" ? undefined : actedByLabel(pass.verified_by)}
                />
              )}
              {pass.status === "returned" && (
                <TimelineRow
                  label="Returned"
                  timestamp={formatDateTime(pass.actual_return_at)}
                  actor={actedByLabel(pass.verified_by)}
                />
              )}
              {pass.status === "cancelled" && (
                <TimelineRow label="Cancelled" timestamp={formatDateTime(pass.updated_at)} />
              )}
            </div>
          </div>
        </div>

        {showActions && (
          <DialogFooter className="shrink-0 flex-wrap">
            {isCancellable && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={acting}>
                Cancel Pass
              </Button>
            )}
            {isPending && canReject && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={onReject}
                disabled={acting}
              >
                Reject
              </Button>
            )}
            {isPending && canApprove && (
              <Button type="button" size="sm" onClick={onApprove} disabled={acting}>
                {acting ? "Approving…" : "Approve"}
              </Button>
            )}
            {isApproved && canIssueAndExit && (
              <Button type="button" size="sm" onClick={onIssueAndExit} disabled={acting}>
                {acting ? "Processing…" : "Issue & Exit"}
              </Button>
            )}
            {isIssued && canVerify && (
              <Button type="button" size="sm" onClick={onCompleteExit} disabled={acting}>
                {acting ? "Completing…" : "Complete Exit"}
              </Button>
            )}
            {isExited && canVerify && (
              <Button type="button" size="sm" onClick={onReturn} disabled={acting}>
                {acting ? "Recording…" : "Return"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
