"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CalendarClock,
  Clock,
  LogIn,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldOff,
  UserRoundX,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { cn, todayLocalDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import {
  ApiError,
  cancelVisitor,
  checkInVisitor,
  checkOutVisitor,
  getAllocations,
  getResident,
  getUser,
  getVisitorLogs,
  getVisitors,
} from "@/lib/api"
import type { Allocation, Resident, User, Visitor, VisitorLog, VisitorStatus } from "@/lib/types"
import { VisitorFormDialog } from "@/components/visitors/visitor-form-dialog"
import { VisitorDetailDialog } from "@/components/visitors/visitor-detail-dialog"

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

/** Visitors currently not yet checked out; issued as two separate backend
 * queries since GET /visitors' `status` filter only matches one value at a
 * time, capped at a generous page size — fine at a single hostel's scale.
 * The right fix if a hostel's active-visitor volume ever outgrows this is a
 * backend "not checked_out" filter instead of merging two client queries. */
const ACTIVE_PAGE_SIZE = 50

function todayRangeIso(): { from: string; to: string } {
  const date = todayLocalDate()
  return { from: `${date}T00:00:00`, to: `${date}T23:59:59.999` }
}

/** Local YYYY-MM-DD for a datetime string, for calendar-day comparisons
 * against todayLocalDate() — mirrors todayLocalDate()'s own local getters
 * rather than slicing/toISOString(), which would read the UTC date. */
function toLocalDateString(value: string): string {
  const date = new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDateTime(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Users
  iconClassName: string
  label: string
  value: number | undefined
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
        <p className="text-[32px] leading-none font-bold text-on-surface">{value.toLocaleString()}</p>
      )}
    </div>
  )
}

/**
 * Resolves resident name + current room for a set of resident ids.
 *
 * Visitor rows only carry a bare `resident_id` — there's no server-side join
 * to resident/room data — so each unique resident shown is looked up
 * individually here, exactly like attendance-view.tsx's useResidentLookup.
 * Fine at today's list sizes; if the visitor roster grows large, the right
 * fix is a server-side join on GET /visitors instead of N+1-ing it here.
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

/** "Checked by" name resolution — only attempted when the viewer has
 * users.view (GET /users/{id} requires it), mirroring attendance-view.tsx's
 * useMarkedByLookup. Falls back to a neutral "Staff" label otherwise. */
function useCheckedByLookup(userIds: string[], enabled: boolean) {
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

/**
 * For each currently checked-in visitor, resolves their open (not yet
 * checked-out) visitor_logs row — POST /visitor-logs/{log_id}/check-out
 * needs a log id, not a visitor id, and Visitor doesn't carry one. A
 * checked-in visitor's single most recent log is always the open one
 * (check-in already blocks re-entry while checked in), so per_page: 1 is
 * sufficient.
 */
function useOpenLogLookup(visitorIds: string[]) {
  const queries = useQueries({
    queries: visitorIds.map((id) => ({
      queryKey: ["visitor-open-log", id],
      queryFn: () => getVisitorLogs({ visitor_id: id, per_page: 1 }),
      staleTime: 30_000,
    })),
  })
  const map = new Map<string, VisitorLog>()
  visitorIds.forEach((id, i) => {
    const log = queries[i]?.data?.items[0]
    if (log && !log.check_out_at) map.set(id, log)
  })
  return map
}

/**
 * Bulk visitor lookup for the Logs tab's Visitor/Resident columns — a log
 * row only carries visitor_id, and there's no single-visitor GET endpoint,
 * so this fetches one reasonably-sized unfiltered page of visitors and
 * builds an id -> Visitor map client-side. Fine at today's list sizes (same
 * tradeoff as useResidentLookup above); the right fix if the visitor roster
 * grows past this page is a real GET /visitors/{id} endpoint.
 */
function useVisitorMap() {
  const query = useQuery({
    queryKey: ["visitors-lookup-all"],
    queryFn: () => getVisitors({ per_page: 100 }),
    staleTime: 60_000,
  })
  return useMemo(() => {
    const map = new Map<string, Visitor>()
    for (const v of query.data?.items ?? []) map.set(v.id, v)
    return map
  }, [query.data])
}

function VisitorCard({
  visitor,
  residentName,
  roomLabel,
  openLog,
  onOpenDetail,
  onEdit,
  onCancel,
  onCheckIn,
  onCheckOut,
  acting,
  canAct,
  canManage,
}: {
  visitor: Visitor
  residentName: string
  roomLabel: string | null
  openLog: VisitorLog | undefined
  onOpenDetail: () => void
  onEdit: () => void
  onCancel: () => void
  onCheckIn: () => void
  onCheckOut: (logId: string) => void
  acting: boolean
  canAct: boolean
  /** Gates Edit and Cancel — same permission the backend requires for
   * PATCH /visitors/{id} and POST /visitors/{id}/cancel (visitors.create). */
  canManage: boolean
}) {
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
      className="group flex cursor-pointer flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-6 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-on-surface group-hover:text-primary">
            {visitor.visitor_name}
          </h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Visiting:{" "}
            <span className="font-medium text-on-surface">
              {residentName}
              {roomLabel ? ` (${roomLabel})` : ""}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge
            status={visitor.status}
            tone={VISITOR_STATUS_TONE[visitor.status]}
            label={VISITOR_STATUS_LABEL[visitor.status]}
          />
          {visitor.is_blacklisted && <StatusBadge status="blacklisted" tone="danger" label="Blacklisted" />}
        </div>
      </div>

      <div className="mb-6 space-y-2 text-sm text-on-surface-variant">
        <div className="flex items-center gap-2">
          <Phone aria-hidden className="size-4 shrink-0" />
          {visitor.visitor_phone || "—"}
        </div>
        <div className="flex items-center gap-2">
          {visitor.status === "expected" ? (
            <>
              <CalendarClock aria-hidden className="size-4 shrink-0" />
              ETA: {formatDateTime(visitor.expected_at)}
            </>
          ) : (
            <>
              <Clock aria-hidden className="size-4 shrink-0" />
              In at {formatDateTime(openLog?.check_in_at ?? null)}
            </>
          )}
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-outline-variant/50 pt-4">
        <div className="flex items-center gap-1">
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${visitor.visitor_name}`}
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              className="rounded-full text-on-surface-variant opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-surface-container-low hover:text-primary focus-visible:opacity-100"
            >
              <Pencil aria-hidden className="size-4" />
            </Button>
          )}
          {visitor.status === "expected" && canManage && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Cancel ${visitor.visitor_name}`}
              onClick={(e) => {
                e.stopPropagation()
                onCancel()
              }}
              className="rounded-full text-on-surface-variant opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-error-container hover:text-on-error-container focus-visible:opacity-100"
            >
              <X aria-hidden className="size-4" />
            </Button>
          )}
        </div>
        <div className="flex justify-end">
          {visitor.status === "expected" && canAct && (
            <Button
              type="button"
              size="sm"
              disabled={acting}
              onClick={(e) => {
                e.stopPropagation()
                onCheckIn()
              }}
            >
              {acting ? "Checking In…" : "Check In"}
            </Button>
          )}
          {visitor.status === "checked_in" && canAct && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={acting || !openLog}
              onClick={(e) => {
                e.stopPropagation()
                if (openLog) onCheckOut(openLog.id)
              }}
            >
              {acting ? "Checking Out…" : "Check Out"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function VisitorsView() {
  const { has } = usePermissions()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<"active" | "logs">("active")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"" | "expected" | "checked_in">("")
  const [logsPage, setLogsPage] = useState(1)
  const [logsPerPage, setLogsPerPage] = useState(20)
  const [logsDate, setLogsDate] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editingVisitor, setEditingVisitor] = useState<Visitor | null>(null)
  const [editingResidentName, setEditingResidentName] = useState("")
  const [detailVisitor, setDetailVisitor] = useState<Visitor | null>(null)
  const [detailResidentName, setDetailResidentName] = useState("")
  const [actingId, setActingId] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Visitor | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const canView = has("visitors.view")
  const canCreate = has("visitors.create")
  const canViewLogs = has("visitor_logs.view")
  const canAct = has("visitor_logs.create")
  const canViewUsers = has("users.view")

  function submitSearch(e: SubmitEvent) {
    e.preventDefault()
    setSearch(searchInput.trim())
    setLogsPage(1)
  }

  /* ── Stat cards ─────────────────────────────────────────────── */

  const todayRange = todayRangeIso()

  const currentlyInQuery = useQuery({
    queryKey: ["visitors-stat", "checked_in"],
    queryFn: () => getVisitors({ status: "checked_in", per_page: 1 }),
    enabled: canView,
  })
  const expectedTodayQuery = useQuery({
    queryKey: ["visitors-stat", "expected-today", todayRange.from],
    queryFn: () => getVisitors({ status: "expected", date_from: todayRange.from, date_to: todayRange.to, per_page: 1 }),
    enabled: canView,
  })
  const totalVisitsTodayQuery = useQuery({
    queryKey: ["visitor-logs-stat", "today", todayRange.from],
    queryFn: () => getVisitorLogs({ date_from: todayRange.from, date_to: todayRange.to, per_page: 1 }),
    enabled: canViewLogs,
  })

  /* ── Active tab ─────────────────────────────────────────────── */

  const checkedInQuery = useQuery({
    queryKey: ["visitors", "checked_in", search],
    queryFn: () => getVisitors({ status: "checked_in", search: search || undefined, per_page: ACTIVE_PAGE_SIZE }),
    enabled: canView && tab === "active",
  })
  const expectedQuery = useQuery({
    queryKey: ["visitors", "expected", search],
    queryFn: () => getVisitors({ status: "expected", search: search || undefined, per_page: ACTIVE_PAGE_SIZE }),
    enabled: canView && tab === "active",
  })

  const activeItems = useMemo(() => {
    const items: Visitor[] = []
    if (statusFilter !== "expected") items.push(...(checkedInQuery.data?.items ?? []))
    if (statusFilter !== "checked_in") items.push(...(expectedQuery.data?.items ?? []))
    // The two status buckets can briefly overlap (e.g. a visitor transitions
    // status mid-refetch), which would otherwise render two VisitorCards
    // with the same key — dedupe by id, keeping the first occurrence.
    const byId = new Map<string, Visitor>()
    for (const item of items) {
      if (!byId.has(item.id)) byId.set(item.id, item)
    }
    // Expected visitors who never showed up pile up otherwise — hide ones
    // whose expected_at day has already passed, but keep undated ones (may
    // still arrive) and checked_in visitors (unaffected regardless of date).
    const today = todayLocalDate()
    return [...byId.values()].filter((item) => {
      if (item.status !== "expected" || !item.expected_at) return true
      return toLocalDateString(item.expected_at) >= today
    })
  }, [checkedInQuery.data, expectedQuery.data, statusFilter])

  const activeLoading = checkedInQuery.isLoading || expectedQuery.isLoading
  const activeError = checkedInQuery.error ?? expectedQuery.error

  const activeResidentIds = useMemo(() => [...new Set(activeItems.map((v) => v.resident_id))], [activeItems])
  const { residentMap: activeResidentMap, allocationMap } = useResidentLookup(activeResidentIds)

  const checkedInIds = useMemo(
    () => activeItems.filter((v) => v.status === "checked_in").map((v) => v.id),
    [activeItems],
  )
  const openLogMap = useOpenLogLookup(checkedInIds)

  function residentDisplayName(residentId: string): string {
    const resident = activeResidentMap.get(residentId)
    return resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "Loading…"
  }

  function roomLabel(residentId: string): string | null {
    const allocation = allocationMap.get(residentId)
    return allocation?.room?.room_number ? `Room ${allocation.room.room_number}` : null
  }

  function openRegister() {
    setEditingVisitor(null)
    setFormOpen(true)
  }

  function openEdit(visitor: Visitor) {
    setEditingVisitor(visitor)
    setEditingResidentName(residentDisplayName(visitor.resident_id))
    setFormOpen(true)
  }

  async function handleCheckIn(visitor: Visitor) {
    setActingId(visitor.id)
    try {
      await checkInVisitor({ visitor_id: visitor.id })
      toast.success(`${visitor.visitor_name} checked in.`)
      queryClient.invalidateQueries({ queryKey: ["visitors"] })
      queryClient.invalidateQueries({ queryKey: ["visitor-logs"] })
      queryClient.invalidateQueries({ queryKey: ["visitors-stat"] })
      queryClient.invalidateQueries({ queryKey: ["visitor-logs-stat"] })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("visitor_logs.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  async function handleCheckOut(visitor: Visitor, logId: string) {
    setActingId(visitor.id)
    try {
      await checkOutVisitor(logId)
      toast.success(`${visitor.visitor_name} checked out.`)
      queryClient.invalidateQueries({ queryKey: ["visitors"] })
      queryClient.invalidateQueries({ queryKey: ["visitor-logs"] })
      queryClient.invalidateQueries({ queryKey: ["visitors-stat"] })
      queryClient.invalidateQueries({ queryKey: ["visitor-logs-stat"] })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("visitor_logs.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await cancelVisitor(cancelTarget.id)
      toast.success(`${cancelTarget.visitor_name}'s registration was cancelled.`)
      queryClient.invalidateQueries({ queryKey: ["visitors"] })
      queryClient.invalidateQueries({ queryKey: ["visitor-logs"] })
      queryClient.invalidateQueries({ queryKey: ["visitors-stat"] })
      setCancelTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("visitors.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setCancelling(false)
    }
  }

  /* ── Logs tab ───────────────────────────────────────────────── */

  const logsQuery = useQuery({
    queryKey: ["visitor-logs", { page: logsPage, perPage: logsPerPage, search, logsDate }],
    queryFn: () =>
      getVisitorLogs({
        page: logsPage,
        per_page: logsPerPage,
        search: search || undefined,
        date_from: logsDate ? `${logsDate}T00:00:00` : undefined,
        date_to: logsDate ? `${logsDate}T23:59:59.999` : undefined,
      }),
    enabled: canViewLogs && tab === "logs",
  })

  const logItems = useMemo(() => logsQuery.data?.items ?? [], [logsQuery.data])
  const visitorMap = useVisitorMap()

  const logResidentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const log of logItems) {
      const visitor = visitorMap.get(log.visitor_id)
      if (visitor) ids.add(visitor.resident_id)
    }
    return [...ids]
  }, [logItems, visitorMap])
  const { residentMap: logResidentMap } = useResidentLookup(logResidentIds)

  const checkedByIds = useMemo(
    () =>
      [...new Set(logItems.flatMap((l) => [l.checked_in_by, l.checked_out_by]).filter((id): id is string => !!id))],
    [logItems],
  )
  const checkedByMap = useCheckedByLookup(checkedByIds, canViewUsers)

  function checkedByLabel(userId: string | null): string {
    if (!userId) return "—"
    const user = checkedByMap.get(userId)
    return user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Staff"
  }

  function logVisitorName(visitorId: string): string {
    return visitorMap.get(visitorId)?.visitor_name ?? "Unknown"
  }

  function logResidentName(visitorId: string): string {
    const visitor = visitorMap.get(visitorId)
    if (!visitor) return "—"
    const resident = logResidentMap.get(visitor.resident_id)
    return resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "Loading…"
  }

  const forbidden =
    (tab === "active" ? activeError : logsQuery.error) instanceof ApiError &&
    ((tab === "active" ? activeError : logsQuery.error) as ApiError).code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Visitors & Security" }, { label: "Visitors" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Visitors</h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Track guests visiting residents across the hostel.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openRegister}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Register Visitor
            </Button>
          )}
        </div>
      </div>

      {canView && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={LogIn}
            iconClassName="bg-emerald-50 text-emerald-600"
            label="Currently In"
            value={currentlyInQuery.data?.total}
          />
          <StatCard
            icon={CalendarClock}
            iconClassName="bg-blue-50 text-blue-600"
            label="Expected Today"
            value={expectedTodayQuery.data?.total}
          />
          <StatCard
            icon={Users}
            iconClassName="bg-primary/10 text-primary"
            label="Total Visits Today"
            value={canViewLogs ? totalVisitsTodayQuery.data?.total : 0}
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => (value === "active" || value === "logs") && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="active"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Active
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Logs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="active" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
                />
                <Input
                  value={searchInput}
                  onChange={(e) => {
                    const value = e.target.value
                    setSearchInput(value)
                    if (value.trim() === "") setSearch("")
                  }}
                  placeholder="Search by visitor or resident name…"
                  aria-label="Search visitors"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <Select
              value={statusFilter || "all"}
              onValueChange={(value) => setStatusFilter(!value || value === "all" ? "" : (value as "expected" | "checked_in"))}
            >
              <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-48">
                <SelectValue placeholder="Status: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: All</SelectItem>
                <SelectItem value="checked_in">Checked In</SelectItem>
                <SelectItem value="expected">Expected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {forbidden ? (
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Visitors"
              description="Ask an administrator to grant you the visitors.view permission."
            />
          ) : activeError ? (
            <ErrorState
              message={(activeError as Error).message}
              onRetry={() => {
                checkedInQuery.refetch()
                expectedQuery.refetch()
              }}
            />
          ) : activeLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : activeItems.length === 0 ? (
            <EmptyState
              icon={UserRoundX}
              title="No active visitors"
              description={search ? "No visitors match your search." : "No visitors are expected or checked in right now."}
              action={canCreate ? { label: "Register Visitor", onClick: openRegister } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeItems.map((visitor) => (
                <VisitorCard
                  key={visitor.id}
                  visitor={visitor}
                  residentName={residentDisplayName(visitor.resident_id)}
                  roomLabel={roomLabel(visitor.resident_id)}
                  openLog={openLogMap.get(visitor.id)}
                  onOpenDetail={() => {
                    setDetailVisitor(visitor)
                    setDetailResidentName(residentDisplayName(visitor.resident_id))
                  }}
                  onEdit={() => openEdit(visitor)}
                  onCancel={() => setCancelTarget(visitor)}
                  onCheckIn={() => handleCheckIn(visitor)}
                  onCheckOut={(logId) => handleCheckOut(visitor, logId)}
                  acting={actingId === visitor.id}
                  canAct={canAct}
                  canManage={canCreate}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
                />
                <Input
                  value={searchInput}
                  onChange={(e) => {
                    const value = e.target.value
                    setSearchInput(value)
                    if (value.trim() === "") {
                      setSearch("")
                      setLogsPage(1)
                    }
                  }}
                  placeholder="Search by visitor or resident name…"
                  aria-label="Search visitor logs"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={logsDate}
                onChange={(e) => {
                  setLogsDate(e.target.value)
                  setLogsPage(1)
                }}
                aria-label="Filter by date"
                className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44"
              />
              {logsDate && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setLogsDate("")}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {forbidden ? (
              <div className="p-4">
                <EmptyState
                  icon={ShieldOff}
                  title="You don't have access to Visitor Logs"
                  description="Ask an administrator to grant you the visitor_logs.view permission."
                />
              </div>
            ) : logsQuery.isError ? (
              <div className="p-4">
                <ErrorState message={(logsQuery.error as Error).message} onRetry={() => logsQuery.refetch()} />
              </div>
            ) : logsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : logItems.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={UserRoundX}
                  title="No visitor logs"
                  description="No check-ins or check-outs match your filters."
                />
              </div>
            ) : (
              logsQuery.data && (
                <>
                  <div className="overflow-x-auto">
                    <Table className="w-full border-collapse text-left">
                      <TableHeader>
                        <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Visitor
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Resident
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Check-in Time
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Check-out Time
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Checked By
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Status
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-outline-variant">
                        {logItems.map((log) => {
                          const isOpen = !log.check_out_at
                          return (
                            <TableRow
                              key={log.id}
                              className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                            >
                              <TableCell className="px-6 py-4 font-medium text-on-surface">
                                {logVisitorName(log.visitor_id)}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                                {logResidentName(log.visitor_id)}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-on-surface">
                                {formatDateTime(log.check_in_at)}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-on-surface">
                                {formatDateTime(log.check_out_at)}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                                {isOpen ? checkedByLabel(log.checked_in_by) : checkedByLabel(log.checked_out_by)}
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <StatusBadge
                                  status={isOpen ? "checked_in" : "checked_out"}
                                  tone={isOpen ? "success" : "neutral"}
                                  label={isOpen ? "Checked In" : "Checked Out"}
                                />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <Pagination
                    page={logsQuery.data.page}
                    perPage={logsQuery.data.per_page}
                    total={logsQuery.data.total}
                    onPageChange={setLogsPage}
                    onPerPageChange={(next) => {
                      setLogsPerPage(next)
                      setLogsPage(1)
                    }}
                  />
                </>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>

      <VisitorFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        visitor={editingVisitor}
        residentName={editingResidentName}
      />
      <VisitorDetailDialog
        open={!!detailVisitor}
        onOpenChange={(open) => !open && setDetailVisitor(null)}
        visitor={detailVisitor}
        residentName={detailResidentName}
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
    </div>
  )
}
