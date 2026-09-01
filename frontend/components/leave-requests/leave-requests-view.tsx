"use client"

import { useMemo, useState } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  Plus,
  ShieldOff,
  X,
  XCircle,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import {
  ApiError,
  approveLeaveRequest,
  cancelLeaveRequest,
  getAllocations,
  getLeaveReport,
  getLeaveRequests,
  getResident,
  getUser,
  rejectLeaveRequest,
} from "@/lib/api"
import { fetchResidentOptions } from "@/lib/hostel-options"
import type { Allocation, LeaveRequest, LeaveStatus, Resident, User } from "@/lib/types"
import { NewLeaveRequestDialog } from "@/components/leave-requests/new-leave-request-dialog"
import { ReviewLeaveRequestDialog } from "@/components/leave-requests/review-leave-request-dialog"
import { LeaveRequestDetailDialog } from "@/components/leave-requests/leave-request-detail-dialog"

const STATUS_OPTIONS: { value: LeaveStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
]

const LEAVE_STATUS_TONE: Record<LeaveStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
}

function initials(firstName: string, lastName: string | null): string {
  return [firstName, lastName]
    .filter(Boolean)
    .map((part) => part![0]!.toUpperCase())
    .join("")
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function durationDays(startDate: string, endDate: string): number {
  const ms = new Date(endDate).getTime() - new Date(startDate).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  hint,
}: {
  icon: typeof Calendar
  iconClassName: string
  label: string
  value: number | undefined
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={cn("flex size-10 items-center justify-center rounded-full", iconClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-10 w-20" />
      ) : (
        <>
          <p className="text-[32px] leading-none font-bold text-on-surface">{value.toLocaleString()}</p>
          {hint && <p className="mt-1.5 text-xs text-on-surface-variant">{hint}</p>}
        </>
      )}
    </div>
  )
}

/**
 * Resolves resident name/avatar/room for the current page of leave-request
 * rows.
 *
 * `GET /leave-requests` only returns a bare `resident_id` — there's no
 * server-side join to resident/room data — so each unique resident on the
 * page is looked up individually here. Fine at today's list sizes; if leave
 * request lists grow large, the right fix is to have the backend list
 * endpoint join resident name/room/building server-side instead of
 * N+1-ing it from the client like this. Mirrors AttendanceView's
 * useResidentLookup.
 */
function useResidentLookup(residentIds: string[]) {
  const residentQueries = useQueries({
    queries: residentIds.map((id) => ({
      queryKey: ["resident", id],
      queryFn: () => getResident(id),
      staleTime: 5 * 60_000,
    })),
  })
  const allocationQueries = useQueries({
    queries: residentIds.map((id) => ({
      queryKey: ["resident-active-allocation", id],
      queryFn: () => getAllocations({ resident_id: id, active_only: true, per_page: 1 }),
      staleTime: 5 * 60_000,
    })),
  })

  const residentMap = new Map<string, Resident>()
  const allocationMap = new Map<string, Allocation>()
  residentIds.forEach((id, i) => {
    const resident = residentQueries[i]?.data
    if (resident) residentMap.set(id, resident)
    const allocation = allocationQueries[i]?.data?.items[0]
    if (allocation) allocationMap.set(id, allocation)
  })
  return { residentMap, allocationMap }
}

/** Resolves "reviewed by" user names — only attempted when the viewer has
 * users.view (GET /users/{id} requires it). Falls back to a neutral "Staff"
 * label otherwise. Mirrors AttendanceView's useMarkedByLookup. */
function useReviewedByLookup(userIds: string[], enabled: boolean) {
  const queries = useQueries({
    queries: (enabled ? userIds : []).map((id) => ({
      queryKey: ["user", id],
      queryFn: () => getUser(id),
      staleTime: 5 * 60_000,
    })),
  })
  const map = new Map<string, User>()
  if (enabled) {
    userIds.forEach((id, i) => {
      const user = queries[i]?.data
      if (user) map.set(id, user)
    })
  }
  return map
}

export function LeaveRequestsView() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [status, setStatus] = useState<string>("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [residentFilter, setResidentFilter] = useState<ComboOption | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<{ leave: LeaveRequest; mode: "approve" | "reject" } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null)
  const [detailTarget, setDetailTarget] = useState<LeaveRequest | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const canCreate = has("leave_requests.create")
  const canApprove = has("leave_requests.approve")
  const canReject = has("leave_requests.reject")
  // Cancel shares leave_requests.approve server-side for staff (residents
  // cancelling their own request go through leave_requests.view_own, which
  // doesn't apply on this admin table).
  const canCancel = canApprove
  const canViewReports = has("reports.view")
  const canViewUsers = has("users.view")

  const query = useQuery({
    queryKey: ["leave-requests", { page, perPage, status, dateFrom, dateTo, residentId: residentFilter?.value }],
    queryFn: () =>
      getLeaveRequests({
        page,
        per_page: perPage,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        resident_id: residentFilter?.value,
      }),
  })

  const reportQuery = useQuery({
    queryKey: ["leave-report"],
    queryFn: getLeaveReport,
    enabled: canViewReports,
  })

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const residentIds = useMemo(() => [...new Set(items.map((i) => i.resident_id))], [items])
  const { residentMap, allocationMap } = useResidentLookup(residentIds)

  const reviewedByIds = useMemo(
    () => [...new Set(items.map((i) => i.reviewed_by).filter((id): id is string => !!id))],
    [items],
  )
  const reviewedByMap = useReviewedByLookup(reviewedByIds, canViewUsers)

  function residentName(residentId: string): string {
    const resident = residentMap.get(residentId)
    return resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "Loading…"
  }

  function reviewedByLabel(reviewedBy: string | null): string {
    if (!reviewedBy) return "—"
    const user = reviewedByMap.get(reviewedBy)
    return user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Staff"
  }

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: ["leave-requests"] })
    queryClient.invalidateQueries({ queryKey: ["leave-report"] })
  }

  async function handleReviewConfirm(notes: string) {
    if (!reviewTarget) return
    setActionLoading(true)
    try {
      const payload = { review_notes: notes.trim() || undefined }
      if (reviewTarget.mode === "approve") {
        await approveLeaveRequest(reviewTarget.leave.id, payload)
        toast.success("Leave request approved.")
      } else {
        await rejectLeaveRequest(reviewTarget.leave.id, payload)
        toast.success("Leave request rejected.")
      }
      invalidateAfterAction()
      setReviewTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(reviewTarget.mode === "approve" ? "leave_requests.approve" : "leave_requests.reject")
        }
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setActionLoading(true)
    try {
      await cancelLeaveRequest(cancelTarget.id)
      toast.success("Leave request cancelled.")
      invalidateAfterAction()
      setCancelTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("leave_requests.approve")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActionLoading(false)
    }
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"
  const hasFilters = !!(status || dateFrom || dateTo || residentFilter)
  const totalRequests = reportQuery.data
    ? reportQuery.data.pending + reportQuery.data.approved + reportQuery.data.rejected + reportQuery.data.cancelled
    : undefined

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Attendance & Leave" }, { label: "Leave Requests" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Leave Requests
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Review and manage resident leave requests.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setNewOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              New Request
            </Button>
          )}
        </div>
      </div>

      {canViewReports && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {reportQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          ) : (
            <>
              <StatCard
                icon={ClipboardList}
                iconClassName="bg-primary/10 text-primary"
                label="Total Requests"
                value={totalRequests}
              />
              <StatCard
                icon={CalendarClock}
                iconClassName="bg-amber-50 text-amber-600"
                label="Pending"
                value={reportQuery.data?.pending}
                hint="Awaiting review"
              />
              <StatCard
                icon={CheckCircle2}
                iconClassName="bg-emerald-50 text-emerald-600"
                label="Approved"
                value={reportQuery.data?.approved}
              />
              <StatCard
                icon={XCircle}
                iconClassName="bg-red-50 text-red-600"
                label="Rejected"
                value={reportQuery.data?.rejected}
              />
            </>
          )}
        </div>
      )}

      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-background/60 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={status || "all"}
              onValueChange={(value) => {
                setStatus(!value || value === "all" ? "" : value)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-40" aria-label="Filter by status">
                <SelectValue placeholder="All Status">
                  {(value: string) =>
                    value === "all" ? "All Status" : (STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "All Status")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                aria-label="From date"
                className="h-9 w-[132px] border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              />
              <span className="text-on-surface-variant">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                aria-label="To date"
                className="h-9 w-[132px] border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="w-full sm:max-w-xs">
            <EntityCombobox
              value={residentFilter}
              onChange={(next) => {
                setResidentFilter(next)
                setPage(1)
              }}
              fetchOptions={fetchResidentOptions}
              placeholder="Filter by resident…"
            />
          </div>
        </div>

        {forbidden ? (
          <div className="p-4">
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Leave Requests"
              description="Ask an administrator to grant you the leave_requests.view permission."
            />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
          </div>
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={CalendarDays}
              title="No leave requests"
              description={hasFilters ? "No requests match your filters." : "No leave requests have been submitted yet."}
              action={canCreate ? { label: "New Request", onClick: () => setNewOpen(true) } : undefined}
            />
          </div>
        ) : (
          query.data && (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full border-collapse text-left">
                  <TableHeader>
                    <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Resident
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Duration
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Reason
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Destination
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Status
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-outline-variant">
                    {items.map((leave) => {
                      const resident = residentMap.get(leave.resident_id)
                      const allocation = allocationMap.get(leave.resident_id)
                      const name = residentName(leave.resident_id)
                      const isPending = leave.status === "pending"
                      const days = durationDays(leave.start_date, leave.end_date)
                      return (
                        <TableRow
                          key={leave.id}
                          className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                        >
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Avatar className="size-9 border border-outline-variant">
                                <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={name} />
                                <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
                                  {resident ? initials(resident.first_name, resident.last_name) : "?"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-on-surface">{name}</p>
                                <p className="truncate text-xs text-on-surface-variant">
                                  {resident?.student_id ? `${resident.student_id} · ` : ""}
                                  {allocation?.room?.room_number ? `Room ${allocation.room.room_number}` : "—"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm">
                            <p className="text-on-surface">
                              {formatDate(leave.start_date)} – {formatDate(leave.end_date)}
                            </p>
                            <p className="text-xs text-on-surface-variant">
                              {days} Day{days === 1 ? "" : "s"}
                            </p>
                          </TableCell>
                          <TableCell className="max-w-56 truncate px-6 py-4 text-sm text-on-surface-variant">
                            {leave.reason}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                            {leave.destination || "—"}
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <StatusBadge status={leave.status} tone={LEAVE_STATUS_TONE[leave.status]} />
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center justify-end gap-1">
                              {isPending && canApprove && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Approve leave request for ${name}`}
                                        onClick={() => setReviewTarget({ leave, mode: "approve" })}
                                        className="rounded-full text-emerald-600 hover:bg-emerald-50"
                                      />
                                    }
                                  >
                                    <Check aria-hidden className="size-4" />
                                  </TooltipTrigger>
                                  <TooltipContent>Approve</TooltipContent>
                                </Tooltip>
                              )}
                              {isPending && canReject && (
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Reject leave request for ${name}`}
                                        onClick={() => setReviewTarget({ leave, mode: "reject" })}
                                        className="rounded-full text-red-600 hover:bg-red-50"
                                      />
                                    }
                                  >
                                    <X aria-hidden className="size-4" />
                                  </TooltipTrigger>
                                  <TooltipContent>Reject</TooltipContent>
                                </Tooltip>
                              )}
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`View leave request for ${name}`}
                                      onClick={() => setDetailTarget(leave)}
                                      className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                                    />
                                  }
                                >
                                  <Eye aria-hidden className="size-4" />
                                </TooltipTrigger>
                                <TooltipContent>View</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                page={query.data.page}
                perPage={query.data.per_page}
                total={query.data.total}
                onPageChange={setPage}
                onPerPageChange={(next) => {
                  setPerPage(next)
                  setPage(1)
                }}
              />
            </>
          )
        )}
      </div>

      <NewLeaveRequestDialog open={newOpen} onOpenChange={setNewOpen} />

      <ReviewLeaveRequestDialog
        open={!!reviewTarget}
        onOpenChange={(open) => !open && setReviewTarget(null)}
        mode={reviewTarget?.mode ?? "approve"}
        leave={reviewTarget?.leave ?? null}
        loading={actionLoading}
        onConfirm={handleReviewConfirm}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel leave request"
        description={`Cancel this leave request for ${cancelTarget ? residentName(cancelTarget.resident_id) : "this resident"}? This cannot be undone.`}
        confirmLabel="Cancel Request"
        destructive
        loading={actionLoading}
        onConfirm={handleCancelConfirm}
      />

      <LeaveRequestDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        leave={detailTarget}
        residentName={detailTarget ? residentName(detailTarget.resident_id) : ""}
        residentSubtitle={detailTarget ? residentMap.get(detailTarget.resident_id)?.student_id ?? undefined : undefined}
        residentAvatarUrl={detailTarget ? residentMap.get(detailTarget.resident_id)?.profile_picture_url : undefined}
        reviewedByLabel={detailTarget ? reviewedByLabel(detailTarget.reviewed_by) : "—"}
        canApprove={canApprove}
        canReject={canReject}
        canCancel={canCancel}
        onApprove={() => detailTarget && setReviewTarget({ leave: detailTarget, mode: "approve" })}
        onReject={() => detailTarget && setReviewTarget({ leave: detailTarget, mode: "reject" })}
        onCancel={() => detailTarget && setCancelTarget(detailTarget)}
      />
    </div>
  )
}
