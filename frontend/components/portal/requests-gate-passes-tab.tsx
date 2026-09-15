"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BadgeCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { GatePassDetailDialog } from "@/components/gate-passes/gate-pass-detail-dialog"
import { GatePassFormDialog } from "@/components/gate-passes/gate-pass-form-dialog"

import { useMyResident } from "@/components/portal/resident-provider"
import { ApiError, cancelGatePass, getGatePasses } from "@/lib/api"
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
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export function RequestsGatePassesTab({ autoOpenCreate }: { autoOpenCreate?: boolean }) {
  const { resident } = useMyResident()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(!!autoOpenCreate)
  const [viewing, setViewing] = useState<GatePass | null>(null)
  const [cancelTarget, setCancelTarget] = useState<GatePass | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const query = useQuery({ queryKey: ["my-gate-passes"], queryFn: () => getGatePasses({}) })

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelGatePass(cancelTarget.id)
      toast.success("Gate pass cancelled.")
      queryClient.invalidateQueries({ queryKey: ["my-gate-passes"] })
      setCancelTarget(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setCancelling(false)
    }
  }

  const residentName = resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : ""
  const isCancellable = viewing ? viewing.status === "pending" || viewing.status === "approved" : false

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-on-surface-variant">Requests to leave the hostel and return.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Request Gate Pass
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={BadgeCheck} title="No gate passes yet" description="Passes you request will appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pass</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.items.map((pass) => (
                <TableRow key={pass.id} className="cursor-pointer" onClick={() => setViewing(pass)}>
                  <TableCell>
                    <p className="font-medium text-on-surface">{pass.pass_number}</p>
                    <p className="text-xs text-on-surface-variant">{pass.destination || "—"}</p>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-on-surface-variant">{pass.reason}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={pass.status}
                      tone={GATE_PASS_STATUS_TONE[pass.status]}
                      label={GATE_PASS_STATUS_LABEL[pass.status]}
                    />
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{formatDateTime(pass.requested_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <GatePassDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        pass={viewing}
        residentName={residentName}
        residentSubtitle={resident?.student_id ?? undefined}
        residentAvatarUrl={resident?.profile_picture_url}
        actedByLabel={() => "Hostel Staff"}
        canApprove={false}
        canReject={false}
        canCancel={isCancellable}
        canIssueAndExit={false}
        canVerify={false}
        acting={cancelling}
        onApprove={() => {}}
        onReject={() => {}}
        onCancel={() => {
          setCancelTarget(viewing)
          setViewing(null)
        }}
        onIssueAndExit={() => {}}
        onCompleteExit={() => {}}
        onReturn={() => {}}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this gate pass?"
        description="This cannot be undone."
        confirmLabel="Cancel Pass"
        destructive
        loading={cancelling}
        onConfirm={handleCancelConfirm}
      />

      <GatePassFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        residentId={resident?.id}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["my-gate-passes"] })}
      />
    </div>
  )
}
