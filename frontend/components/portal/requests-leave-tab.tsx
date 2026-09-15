"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarDays } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { LeaveRequestDetailDialog } from "@/components/leave-requests/leave-request-detail-dialog"
import { NewLeaveRequestDialog } from "@/components/leave-requests/new-leave-request-dialog"

import { useMyResident } from "@/components/portal/resident-provider"
import { ApiError, cancelLeaveRequest, getLeaveRequests } from "@/lib/api"
import type { LeaveRequest, LeaveStatus } from "@/lib/types"

const STATUS_TONE: Record<LeaveStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function RequestsLeaveTab({ autoOpenCreate }: { autoOpenCreate?: boolean }) {
  const { resident } = useMyResident()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(!!autoOpenCreate)
  const [viewing, setViewing] = useState<LeaveRequest | null>(null)
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const query = useQuery({ queryKey: ["my-leave-requests"], queryFn: () => getLeaveRequests({}) })

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelLeaveRequest(cancelTarget.id)
      toast.success("Leave request cancelled.")
      queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] })
      setCancelTarget(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setCancelling(false)
    }
  }

  const residentName = resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : ""

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-on-surface-variant">Requests you&apos;ve submitted for time away from the hostel.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Request Leave
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={CalendarDays} title="No leave requests yet" description="Requests you submit will appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.items.map((leave) => (
                <TableRow key={leave.id} className="cursor-pointer" onClick={() => setViewing(leave)}>
                  <TableCell>
                    <p className="font-medium text-on-surface">
                      {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-on-surface-variant">{leave.reason}</TableCell>
                  <TableCell>
                    <StatusBadge status={leave.status} tone={STATUS_TONE[leave.status]} />
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{formatDate(leave.requested_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LeaveRequestDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        leave={viewing}
        residentName={residentName}
        residentSubtitle={resident?.student_id ?? undefined}
        residentAvatarUrl={resident?.profile_picture_url}
        reviewedByLabel="Hostel Staff"
        canApprove={false}
        canReject={false}
        canCancel={viewing?.status === "pending"}
        onApprove={() => {}}
        onReject={() => {}}
        onCancel={() => {
          setCancelTarget(viewing)
          setViewing(null)
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this leave request?"
        description="This cannot be undone."
        confirmLabel="Cancel Request"
        destructive
        loading={cancelling}
        onConfirm={handleCancelConfirm}
      />

      <NewLeaveRequestDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        residentId={resident?.id}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["my-leave-requests"] })}
      />
    </div>
  )
}
