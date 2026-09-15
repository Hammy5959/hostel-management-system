"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { MessageSquareWarning } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge } from "@/components/hostel/status-badge"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { ComplaintDetailDialog } from "@/components/maintenance/complaint-detail-dialog"
import { ComplaintFormDialog } from "@/components/maintenance/complaint-form-dialog"
import { MAINTENANCE_STATUS_LABEL, MAINTENANCE_STATUS_TONE, formatDateTime } from "@/components/maintenance/complaint-card"

import { useMyResident } from "@/components/portal/resident-provider"
import { ApiError, cancelComplaint, getAllocations, getComplaints } from "@/lib/api"
import type { Complaint } from "@/lib/types"

export function RequestsComplaintsTab({ autoOpenCreate }: { autoOpenCreate?: boolean }) {
  const { resident } = useMyResident()
  const queryClient = useQueryClient()

  const [createOpen, setCreateOpen] = useState(!!autoOpenCreate)
  const [viewing, setViewing] = useState<Complaint | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Complaint | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const query = useQuery({ queryKey: ["my-complaints"], queryFn: () => getComplaints({}) })

  // Residents hold no rooms.view permission, so the room name for a
  // complaint can't be resolved via GET /rooms the way the staff detail
  // dialog does. Their own active allocation is fetchable (allocations.view_own)
  // and embeds room details, so use that when it matches the complaint's room —
  // the common case, since a resident's active allocation rarely changes
  // between filing and viewing a complaint.
  const allocationQuery = useQuery({
    queryKey: ["my-active-allocation-for-complaints", resident?.id],
    queryFn: () => getAllocations({ resident_id: resident!.id, active_only: true, per_page: 1 }),
    enabled: !!resident,
    staleTime: 5 * 60_000,
  })
  const activeAllocation = allocationQuery.data?.items[0]

  function roomLabelFor(complaint: Complaint | null): string | null {
    if (!complaint?.room_id || !activeAllocation || activeAllocation.room_id !== complaint.room_id) return null
    return activeAllocation.room
      ? `${activeAllocation.room.room_number}${activeAllocation.room.building_name ? ` · ${activeAllocation.room.building_name}` : ""}`
      : null
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelComplaint(cancelTarget.id)
      toast.success("Complaint withdrawn.")
      queryClient.invalidateQueries({ queryKey: ["my-complaints"] })
      setCancelTarget(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-on-surface-variant">Maintenance and other complaints you&apos;ve filed.</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          File Complaint
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState icon={MessageSquareWarning} title="No complaints yet" description="Complaints you file will appear here." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Filed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data!.items.map((complaint) => (
                <TableRow key={complaint.id} className="cursor-pointer" onClick={() => setViewing(complaint)}>
                  <TableCell>
                    <p className="max-w-xs truncate font-medium text-on-surface">{complaint.title}</p>
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{complaint.category || "—"}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={complaint.status}
                      tone={MAINTENANCE_STATUS_TONE[complaint.status]}
                      label={MAINTENANCE_STATUS_LABEL[complaint.status]}
                    />
                  </TableCell>
                  <TableCell className="text-on-surface-variant">{formatDateTime(complaint.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ComplaintDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        complaint={viewing}
        residentName={resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : ""}
        roomLabel={roomLabelFor(viewing)}
        ticket={undefined}
        staffLabel={() => "Hostel Staff"}
        canCreateTicket={false}
        canCancel={viewing?.status === "open"}
        acting={cancelling}
        onCreateTicket={() => {}}
        onCancel={() => {
          setCancelTarget(viewing)
          setViewing(null)
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Withdraw this complaint?"
        description="This cannot be undone. Once staff have started work on a complaint, it can no longer be withdrawn."
        confirmLabel="Withdraw Complaint"
        destructive
        loading={cancelling}
        onConfirm={handleCancelConfirm}
      />

      <ComplaintFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        complaint={null}
        residentId={resident?.id}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["my-complaints"] })}
      />
    </div>
  )
}
