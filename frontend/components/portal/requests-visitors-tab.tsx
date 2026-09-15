"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { UserPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { VisitorDetailDialog } from "@/components/visitors/visitor-detail-dialog"
import { VisitorFormDialog } from "@/components/visitors/visitor-form-dialog"

import { useMyResident } from "@/components/portal/resident-provider"
import { ApiError, cancelVisitor, getVisitors } from "@/lib/api"
import type { Visitor, VisitorStatus } from "@/lib/types"

const VISITOR_STATUS_TONE: Record<VisitorStatus, Tone> = {
  expected: "info",
  checked_in: "success",
  checked_out: "neutral",
  cancelled: "neutral",
}

const VISITOR_STATUS_LABEL: Record<VisitorStatus, string> = {
  expected: "Expected",
  checked_in: "Checked In",
  checked_out: "Checked Out",
  cancelled: "Cancelled",
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function RequestsVisitorsTab({ autoOpenCreate }: { autoOpenCreate?: boolean }) {
  const { resident } = useMyResident()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(!!autoOpenCreate)
  const [viewing, setViewing] = useState<Visitor | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Visitor | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const query = useQuery({ queryKey: ["my-visitors"], queryFn: () => getVisitors({}) })

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelVisitor(cancelTarget.id)
      toast.success(`${cancelTarget.visitor_name}'s registration was cancelled.`)
      queryClient.invalidateQueries({ queryKey: ["my-visitors"] })
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
        <p className="text-sm text-on-surface-variant">Guests you&apos;ve registered to visit you.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Register Visitor
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={UserPlus} title="No visitors yet" description="Guests you register will appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitor</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.items.map((visitor) => (
                <TableRow key={visitor.id} className="cursor-pointer" onClick={() => setViewing(visitor)}>
                  <TableCell>
                    <p className="font-medium text-on-surface">{visitor.visitor_name}</p>
                    <p className="text-xs text-on-surface-variant">{visitor.relationship || "—"}</p>
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{formatDateTime(visitor.expected_at)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={visitor.status}
                      tone={VISITOR_STATUS_TONE[visitor.status]}
                      label={VISITOR_STATUS_LABEL[visitor.status]}
                    />
                  </TableCell>
                  <TableCell>
                    {visitor.status === "expected" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setCancelTarget(visitor)
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <VisitorDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        visitor={viewing}
        residentName={residentName}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this visitor?"
        description={`This cancels the registration for ${cancelTarget?.visitor_name ?? "this visitor"}. This cannot be undone.`}
        confirmLabel="Cancel Visitor"
        destructive
        loading={cancelling}
        onConfirm={handleCancelConfirm}
      />

      <VisitorFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        visitor={null}
        residentId={resident?.id}
        hideCheckInOption
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["my-visitors"] })}
      />
    </div>
  )
}
