"use client"

import { useQuery } from "@tanstack/react-query"
import { Clock, DoorOpen, UserRound } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { StatusBadge } from "@/components/hostel/status-badge"
import { initials } from "@/components/users/user-badges"
import { getAllocations, getMyRoommates } from "@/lib/api"

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/* ── Current allocation card ──────────────────────────────────────────── */

function CurrentAllocationCard() {
  const query = useQuery({
    queryKey: ["my-allocation"],
    queryFn: () => getAllocations({ active_only: true, per_page: 1 }),
  })

  if (query.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />
  if (query.isError) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const allocation = query.data?.items[0]

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-lg bg-primary-fixed p-2 text-on-primary-fixed">
          <DoorOpen aria-hidden className="size-5" strokeWidth={2} />
        </div>
        <h2 className="text-xl font-semibold text-on-surface">Current Room</h2>
      </div>

      {allocation ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-on-surface-variant">Room</p>
            <p className="text-lg font-semibold text-on-surface">{allocation.room?.room_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-on-surface-variant">Bed</p>
            <p className="text-lg font-semibold text-on-surface">{allocation.bed?.bed_number ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-on-surface-variant">Floor</p>
            <p className="text-lg font-semibold text-on-surface">{allocation.room?.floor_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-on-surface-variant">Building</p>
            <p className="text-lg font-semibold text-on-surface">{allocation.room?.building_name ?? "—"}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No room allocated yet.</p>
      )}
    </div>
  )
}

/* ── Roommates ────────────────────────────────────────────────────────── */

function RoommatesPanel({ hasAllocation }: { hasAllocation: boolean | undefined }) {
  const query = useQuery({ queryKey: ["my-roommates"], queryFn: getMyRoommates })

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-on-surface">Roommates</h2>

      {query.isLoading || hasAllocation === undefined ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.length ?? 0) === 0 ? (
        <div className="py-6 text-center">
          <UserRound aria-hidden className="mx-auto mb-2 size-6 text-outline" />
          <p className="text-sm text-on-surface-variant">
            {hasAllocation === false ? "No room allocated." : "No roommates yet — you have this room to yourself."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {query.data!.map((roommate) => (
            <div key={roommate.id} className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={roommate.profile_picture_url ?? undefined} alt={roommate.first_name} />
                <AvatarFallback className="bg-secondary-container text-sm font-semibold text-on-secondary-container">
                  {initials(roommate.first_name, roommate.last_name)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-on-surface">
                {roommate.first_name} {roommate.last_name ?? ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Stay / room history ─────────────────────────────────────────────── */

function HistoryTable() {
  const query = useQuery({ queryKey: ["my-allocation-history"], queryFn: () => getAllocations({}) })

  if (query.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />
  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
  }

  const allocations = query.data?.items ?? []

  if (allocations.length === 0) {
    return <EmptyState icon={Clock} title="No room history yet" description="Your past room allocations will appear here." />
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room</TableHead>
            <TableHead>Floor / Building</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Until</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allocations.map((allocation) => (
            <TableRow key={allocation.id}>
              <TableCell className="font-medium text-on-surface">
                {allocation.room?.room_number ?? "—"}
                {allocation.bed?.bed_number ? ` / ${allocation.bed.bed_number}` : ""}
              </TableCell>
              <TableCell className="text-on-surface-variant">
                {[allocation.room?.floor_name, allocation.room?.building_name].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell className="text-on-surface-variant">{formatDate(allocation.allocated_from)}</TableCell>
              <TableCell className="text-on-surface-variant">{formatDate(allocation.allocated_until)}</TableCell>
              <TableCell>
                <StatusBadge status={allocation.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ── main tab ─────────────────────────────────────────────────────────── */

export function RoomMyRoomTab() {
  const allocationQuery = useQuery({
    queryKey: ["my-allocation"],
    queryFn: () => getAllocations({ active_only: true, per_page: 1 }),
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CurrentAllocationCard />
        </div>
        <RoommatesPanel
          hasAllocation={allocationQuery.isLoading ? undefined : (allocationQuery.data?.items.length ?? 0) > 0}
        />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-on-surface">Room History</h2>
        <HistoryTable />
      </div>
    </div>
  )
}
