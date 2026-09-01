"use client"

import { useMemo, useState } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarCheck,
  CalendarDays,
  Pencil,
  Plus,
  ShieldOff,
  UserCheck,
  UserRoundX,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { cn, todayLocalDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { getStoredUser } from "@/lib/auth"
import {
  ApiError,
  getAllocations,
  getAttendance,
  getAttendanceReport,
  getDashboardSummary,
  getResident,
  getUser,
  updateAttendance,
} from "@/lib/api"
import { fetchResidentOptions } from "@/lib/hostel-options"
import type { Allocation, AttendanceRecord, AttendanceStatus, Resident, User } from "@/lib/types"
import { MarkAttendanceDialog } from "@/components/attendance/mark-attendance-dialog"
import { BulkMarkDialog } from "@/components/attendance/bulk-mark-dialog"
import { EditAttendanceDialog } from "@/components/attendance/edit-attendance-dialog"

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "late", label: "Late" },
  { value: "excused", label: "On Leave" },
]

/** Displayed on the status pill instead of the raw stored value — "excused"
 * reads as "On Leave" to staff, matching STATUS_OPTIONS above. */
const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "On Leave",
}

const ATTENDANCE_STATUS_TONE: Record<AttendanceStatus, Tone> = {
  present: "success",
  absent: "danger",
  late: "warning",
  excused: "info",
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

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  hint,
}: {
  icon: typeof Users
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
 * Resolves resident name/avatar/room for the current page of attendance rows.
 *
 * `GET /attendance` only returns a bare `resident_id` — there's no server-side
 * join to resident/room data — so each unique resident on the page is looked
 * up individually here. Fine at today's list sizes; if attendance lists grow
 * large, the right fix is to have the backend attendance list endpoint join
 * resident name/room/building server-side instead of N+1-ing it from the
 * client like this.
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

/** Resolves "marked by" user names — only attempted when the viewer has
 * users.view (GET /users/{id} requires it), since most attendance-marking
 * staff won't. Falls back to a neutral "Staff" label otherwise. */
function useMarkedByLookup(userIds: string[], enabled: boolean) {
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

export function AttendanceView() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()
  const currentUser = getStoredUser()

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [attendanceDate, setAttendanceDate] = useState(todayLocalDate)
  const [status, setStatus] = useState<string>("")
  const [residentFilter, setResidentFilter] = useState<ComboOption | null>(null)
  const [markOpen, setMarkOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<AttendanceRecord | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus>("present")
  const [applyingBulk, setApplyingBulk] = useState(false)

  const canMark = has("attendance.mark")
  const canUpdate = has("attendance.update")
  const canViewReports = has("reports.view")
  const canViewUsers = has("users.view")

  const query = useQuery({
    queryKey: ["attendance", { page, perPage, attendanceDate, status, residentId: residentFilter?.value }],
    queryFn: () =>
      getAttendance({
        page,
        per_page: perPage,
        date_from: attendanceDate,
        date_to: attendanceDate,
        status: status || undefined,
        resident_id: residentFilter?.value,
      }),
  })

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    enabled: canViewReports,
    staleTime: 60_000,
  })
  const reportQuery = useQuery({
    queryKey: ["attendance-report", attendanceDate],
    queryFn: () => getAttendanceReport({ date_from: attendanceDate, date_to: attendanceDate }),
    enabled: canViewReports,
  })

  const items = useMemo(() => query.data?.items ?? [], [query.data])
  const residentIds = useMemo(() => [...new Set(items.map((i) => i.resident_id))], [items])
  const { residentMap, allocationMap } = useResidentLookup(residentIds)

  const markedByIds = useMemo(
    () => [...new Set(items.map((i) => i.marked_by).filter((id): id is string => !!id && id !== currentUser?.id))],
    [items, currentUser?.id],
  )
  const markedByMap = useMarkedByLookup(markedByIds, canViewUsers)

  function residentName(residentId: string): string {
    const resident = residentMap.get(residentId)
    return resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "Loading…"
  }

  function markedByLabel(markedBy: string | null): string {
    if (!markedBy) return "—"
    if (markedBy === currentUser?.id) return "You"
    const user = markedByMap.get(markedBy)
    return user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Staff"
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function applyBulkStatus() {
    if (selected.size === 0) return
    setApplyingBulk(true)
    const ids = [...selected]
    const results = await Promise.allSettled(ids.map((id) => updateAttendance(id, { status: bulkStatus })))
    const succeeded = results.filter((r) => r.status === "fulfilled").length
    if (succeeded === ids.length) {
      toast.success(`${succeeded} of ${ids.length} updated.`)
    } else {
      toast.error(`${succeeded} of ${ids.length} updated — ${ids.length - succeeded} failed.`)
      const deniedPermission = results.some(
        (r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.code === "missing_permission",
      )
      if (deniedPermission) markPermissionDenied("attendance.update")
    }
    queryClient.invalidateQueries({ queryKey: ["attendance"] })
    queryClient.invalidateQueries({ queryKey: ["attendance-report"] })
    setSelected(new Set())
    setApplyingBulk(false)
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"
  const isToday = attendanceDate === todayLocalDate()
  const allSelected = items.length > 0 && selected.size === items.length

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Attendance & Leave" }, { label: "Daily Attendance" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Daily Attendance
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Track and record resident attendance across the hostel.
            </p>
          </div>
          {canMark && (
            <div className="flex shrink-0 items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBulkOpen(true)}
                className="h-10 gap-2 rounded-lg px-4 text-sm font-medium"
              >
                Bulk Mark
              </Button>
              <Button
                type="button"
                onClick={() => setMarkOpen(true)}
                className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
              >
                <Plus aria-hidden className="size-5" />
                Mark Attendance
              </Button>
            </div>
          )}
        </div>
      </div>

      {canViewReports && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {summaryQuery.isLoading || reportQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
          ) : (
            <>
              <StatCard
                icon={Users}
                iconClassName="bg-primary/10 text-primary"
                label="Total Residents"
                value={summaryQuery.data?.active_residents}
                hint="Active across all blocks"
              />
              <StatCard
                icon={UserCheck}
                iconClassName="bg-emerald-50 text-emerald-600"
                label="Present Today"
                value={reportQuery.data?.present}
                hint={
                  reportQuery.data && reportQuery.data.total > 0
                    ? `${Math.round((reportQuery.data.present / reportQuery.data.total) * 100)}% of marked residents`
                    : undefined
                }
              />
              <StatCard
                icon={CalendarDays}
                iconClassName="bg-blue-50 text-blue-600"
                label="On Leave"
                value={reportQuery.data?.excused}
                hint="Approved leaves"
              />
              <StatCard
                icon={UserRoundX}
                iconClassName="bg-red-50 text-red-600"
                label="Absent"
                value={reportQuery.data?.absent}
                hint="Requires review"
              />
            </>
          )}
        </div>
      )}

      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant bg-background/60 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container px-2">
              <Input
                type="date"
                value={attendanceDate}
                onChange={(e) => {
                  setAttendanceDate(e.target.value)
                  setPage(1)
                }}
                aria-label="Attendance date"
                className="h-9 w-38 border-none bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
              />
            </div>
            {!isToday && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAttendanceDate(todayLocalDate())
                  setPage(1)
                }}
              >
                Today
              </Button>
            )}
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

        {canUpdate && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium text-on-surface">{selected.size} selected</span>
            <span className="text-sm text-on-surface-variant">Mark as</span>
            <Select value={bulkStatus} onValueChange={(value) => value && setBulkStatus(value as AttendanceStatus)}>
              <SelectTrigger className="h-9 w-36" aria-label="Bulk status">
                <SelectValue>{(value: AttendanceStatus) => ATTENDANCE_STATUS_LABEL[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" size="sm" onClick={applyBulkStatus} disabled={applyingBulk}>
              {applyingBulk ? "Applying…" : "Apply"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        )}

        {forbidden ? (
          <div className="p-4">
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Attendance"
              description="Ask an administrator to grant you the attendance.view permission."
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
              icon={CalendarCheck}
              title="No attendance records"
              description={
                status || residentFilter
                  ? "No records match your filters."
                  : `No attendance has been marked for ${formatDate(attendanceDate)} yet.`
              }
              action={canMark ? { label: "Mark Attendance", onClick: () => setMarkOpen(true) } : undefined}
            />
          </div>
        ) : (
          query.data && (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full border-collapse text-left">
                  <TableHeader>
                    <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                      {canUpdate && (
                        <TableHead className="h-auto w-10 px-6 py-4">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(checked) => setSelected(checked ? new Set(items.map((i) => i.id)) : new Set())}
                            aria-label="Select all"
                          />
                        </TableHead>
                      )}
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Resident
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Room/Bed
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Date
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Status
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Marked By
                      </TableHead>
                      {canUpdate && (
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Actions
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-outline-variant">
                    {items.map((record) => {
                      const resident = residentMap.get(record.resident_id)
                      const allocation = allocationMap.get(record.resident_id)
                      const name = residentName(record.resident_id)
                      return (
                        <TableRow
                          key={record.id}
                          className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                        >
                          {canUpdate && (
                            <TableCell className="px-6 py-4">
                              <Checkbox
                                checked={selected.has(record.id)}
                                onCheckedChange={(checked) => toggleSelect(record.id, checked)}
                                aria-label={`Select ${name}`}
                              />
                            </TableCell>
                          )}
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
                                {resident?.student_id && (
                                  <p className="text-xs text-on-surface-variant">ID: {resident.student_id}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                            {allocation
                              ? `${allocation.room?.room_number ?? "—"}${allocation.bed ? ` / ${allocation.bed.bed_number}` : ""}`
                              : "—"}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface">
                            {formatDate(record.attendance_date)}
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <StatusBadge
                              status={record.status}
                              tone={ATTENDANCE_STATUS_TONE[record.status]}
                              label={ATTENDANCE_STATUS_LABEL[record.status]}
                            />
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                            {markedByLabel(record.marked_by)}
                          </TableCell>
                          {canUpdate && (
                            <TableCell className="px-6 py-4 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit attendance for ${name}`}
                                onClick={() => setEditing(record)}
                                className="rounded-full text-on-surface-variant opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-surface-container-low hover:text-primary focus-visible:opacity-100"
                              >
                                <Pencil aria-hidden className="size-4" />
                              </Button>
                            </TableCell>
                          )}
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

      <MarkAttendanceDialog open={markOpen} onOpenChange={setMarkOpen} />
      <BulkMarkDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <EditAttendanceDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        record={editing}
        residentName={editing ? residentName(editing.resident_id) : ""}
      />
    </div>
  )
}
