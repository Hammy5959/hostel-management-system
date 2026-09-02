"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DoorOpen,
  Eye,
  History as HistoryIcon,
  Inbox,
  LogOut,
  Plus,
  RotateCcw,
  Search,
  ShieldOff,
} from "lucide-react"
import { toast } from "sonner"

import { cn, todayLocalDate } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import {
  ApiError,
  approveGatePass,
  cancelGatePass,
  getAllocations,
  getGatePasses,
  getResident,
  getUser,
  issueGatePass,
  markGatePassExit,
  markGatePassReturn,
  rejectGatePass,
} from "@/lib/api"
import type { Allocation, GatePass, GatePassStatus, Resident, User } from "@/lib/types"
import { GatePassFormDialog } from "@/components/gate-passes/gate-pass-form-dialog"
import { RejectGatePassDialog } from "@/components/gate-passes/reject-gate-pass-dialog"
import { GatePassDetailDialog } from "@/components/gate-passes/gate-pass-detail-dialog"

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

const HISTORY_STATUS_OPTIONS: { value: GatePassStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "issued", label: "Issued" },
  { value: "exited", label: "Out" },
  { value: "returned", label: "Returned" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
]

/** In-progress statuses shown as cards on the Active tab. `issued` is a
 * recovery-only bucket — see handleIssueAndExit below — but still needs to
 * be visible here so staff can find and complete a stuck pass. */
const ACTIVE_STATUSES: GatePassStatus[] = ["pending", "approved", "issued", "exited"]

/** Merged multi-status client query, same tradeoff as visitors-view.tsx's
 * checked_in/expected split: GET /gate-passes only filters by one status at
 * a time, so the Active tab issues one query per in-progress status and
 * merges them. Fine at a single hostel's scale. */
const ACTIVE_PAGE_SIZE = 50

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

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join("")
    .slice(0, 2)
}

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Clock
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

/** Resolves resident name/avatar/room for a set of resident ids. Gate pass
 * rows only carry a bare resident_id — no server-side join — so each unique
 * resident shown is looked up individually, exactly like visitors-view.tsx's
 * and leave-requests-view.tsx's useResidentLookup. */
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

/** "Acted by" name resolution (approved_by/issued_by/verified_by) — only
 * attempted when the viewer has users.view, mirroring leave-requests-view.tsx's
 * useReviewedByLookup. Falls back to "Staff". */
function useActedByLookup(userIds: string[], enabled: boolean) {
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

function GatePassCard({
  pass,
  residentName,
  residentAvatarUrl,
  roomLabel,
  acting,
  canApprove,
  canReject,
  canCancel,
  canIssueAndExit,
  canVerify,
  onOpenDetail,
  onApprove,
  onReject,
  onCancel,
  onIssueAndExit,
  onCompleteExit,
  onReturn,
}: {
  pass: GatePass
  residentName: string
  residentAvatarUrl?: string | null
  roomLabel: string | null
  acting: boolean
  canApprove: boolean
  canReject: boolean
  canCancel: boolean
  canIssueAndExit: boolean
  canVerify: boolean
  onOpenDetail: () => void
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  onIssueAndExit: () => void
  onCompleteExit: () => void
  onReturn: () => void
}) {
  const isPending = pass.status === "pending"
  const isApproved = pass.status === "approved"
  const isIssued = pass.status === "issued"
  const isExited = pass.status === "exited"
  const isOverdue =
    isExited && !!pass.expected_return_at && new Date(pass.expected_return_at).getTime() < new Date().getTime()
  const isCancellable = (isPending || isApproved) && canCancel

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
      className={cn(
        "group flex cursor-pointer flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isOverdue && "border-l-4 border-l-destructive",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-on-surface group-hover:text-primary">
              {residentName}
            </h3>
            <StatusBadge
              status={pass.status}
              tone={GATE_PASS_STATUS_TONE[pass.status]}
              label={GATE_PASS_STATUS_LABEL[pass.status]}
            />
            {isOverdue && <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />}
          </div>
          <p className="mt-1 text-sm text-on-surface-variant">
            {pass.pass_number}
            {roomLabel ? ` • ${roomLabel}` : ""}
          </p>
        </div>
        <Avatar className="size-12 shrink-0 border border-outline-variant">
          <AvatarImage src={residentAvatarUrl ?? undefined} alt={residentName} />
          <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
            {initials(residentName) || "?"}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="mb-4 space-y-1 rounded-lg border border-outline-variant bg-surface-container-low p-3 text-sm">
        <p className="font-medium text-on-surface">{pass.reason}</p>
        {pass.destination && <p className="text-on-surface-variant">To: {pass.destination}</p>}
        {isPending && <p className="text-on-surface-variant">Requested: {formatDateTime(pass.requested_at)}</p>}
        {isApproved && <p className="text-on-surface-variant">Approved: {formatDateTime(pass.approved_at)}</p>}
        {isIssued && <p className="text-on-surface-variant">Issued: {formatDateTime(pass.issued_at)}</p>}
        {isExited && (
          <p className={cn("font-medium", isOverdue ? "text-destructive" : "text-on-surface-variant")}>
            Out since: {formatDateTime(pass.departure_at)}
          </p>
        )}
        {pass.expected_return_at && (
          <p className={cn(isOverdue ? "font-medium text-destructive" : "text-on-surface-variant")}>
            Expected return: {formatDateTime(pass.expected_return_at)}
          </p>
        )}
      </div>

      <div className="mt-auto flex justify-end gap-2 border-t border-outline-variant/50 pt-3">
        {isPending && canApprove && (
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={acting}
            onClick={(e) => {
              e.stopPropagation()
              onApprove()
            }}
          >
            {acting ? "Approving…" : "Approve"}
          </Button>
        )}
        {isPending && canReject && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
            disabled={acting}
            onClick={(e) => {
              e.stopPropagation()
              onReject()
            }}
          >
            Reject
          </Button>
        )}
        {isApproved && canIssueAndExit && (
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={acting}
            onClick={(e) => {
              e.stopPropagation()
              onIssueAndExit()
            }}
          >
            <LogOut aria-hidden className="size-4" />
            {acting ? "Processing…" : "Issue & Exit"}
          </Button>
        )}
        {isIssued && canVerify && (
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={acting}
            onClick={(e) => {
              e.stopPropagation()
              onCompleteExit()
            }}
          >
            {acting ? "Completing…" : "Complete Exit"}
          </Button>
        )}
        {isExited && canVerify && (
          <Button
            type="button"
            size="sm"
            className="flex-1"
            disabled={acting}
            onClick={(e) => {
              e.stopPropagation()
              onReturn()
            }}
          >
            <RotateCcw aria-hidden className="size-4" />
            {acting ? "Recording…" : "Return"}
          </Button>
        )}
        {isCancellable && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={acting}
            onClick={(e) => {
              e.stopPropagation()
              onCancel()
            }}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  )
}

export function GatePassesView() {
  const { has, hasAny } = usePermissions()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<"active" | "history">("active")
  const [activeStatusFilter, setActiveStatusFilter] = useState<"" | GatePassStatus>("")
  const [activeSearchInput, setActiveSearchInput] = useState("")
  const [activeSearch, setActiveSearch] = useState("")
  const [historyStatusFilter, setHistoryStatusFilter] = useState<"" | GatePassStatus>("")
  const [historySearchInput, setHistorySearchInput] = useState("")
  const [historySearch, setHistorySearch] = useState("")
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPerPage, setHistoryPerPage] = useState(20)
  const [formOpen, setFormOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<GatePass | null>(null)
  const [rejectTarget, setRejectTarget] = useState<GatePass | null>(null)
  const [cancelTarget, setCancelTarget] = useState<GatePass | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)

  const canView = hasAny("gate_passes.view", "gate_passes.view_own")
  const canCreate = has("gate_passes.create")
  const canApprove = has("gate_passes.approve")
  const canReject = has("gate_passes.reject")
  const canIssue = has("gate_passes.issue")
  const canVerify = has("gate_passes.verify")
  const canCancel = canApprove
  const canIssueAndExit = canIssue && canVerify
  const canViewUsers = has("users.view")

  /* ── Stat cards ─────────────────────────────────────────────── */

  const pendingStatQuery = useQuery({
    queryKey: ["gate-passes-stat", "pending"],
    queryFn: () => getGatePasses({ status: "pending", per_page: 1 }),
    enabled: canView,
  })
  const approvedStatQuery = useQuery({
    queryKey: ["gate-passes-stat", "approved"],
    queryFn: () => getGatePasses({ status: "approved", per_page: 1 }),
    enabled: canView,
  })
  const outStatQuery = useQuery({
    queryKey: ["gate-passes-stat", "exited"],
    queryFn: () => getGatePasses({ status: "exited", per_page: 1 }),
    enabled: canView,
  })
  // The list endpoint has no date filter, so "Returned Today" fetches a
  // generously-sized page of returned passes and counts today's client-side
  // — same pragmatic shortcut as elsewhere in the app. If pass volume ever
  // outgrows ~100 returns/day, the proper fix is a backend date_from/date_to
  // param on GET /gate-passes.
  const returnedStatQuery = useQuery({
    queryKey: ["gate-passes-stat", "returned"],
    queryFn: () => getGatePasses({ status: "returned", per_page: 100 }),
    enabled: canView,
  })
  const returnedTodayCount = useMemo(() => {
    const today = todayLocalDate()
    return (returnedStatQuery.data?.items ?? []).filter(
      (p) => p.actual_return_at && toLocalDateString(p.actual_return_at) === today,
    ).length
  }, [returnedStatQuery.data])

  /* ── Active tab ─────────────────────────────────────────────── */

  const activeQueries = useQueries({
    queries: ACTIVE_STATUSES.map((status) => ({
      queryKey: ["gate-passes", "active", status, activeSearch],
      queryFn: () => getGatePasses({ status, search: activeSearch || undefined, per_page: ACTIVE_PAGE_SIZE }),
      enabled: canView && tab === "active",
    })),
  })

  // Not wrapped in useMemo: the query results array is a fresh reference each
  // render anyway (useQueries), so memoizing here would need a variable-length
  // dependency list — plain recomputation on this small merged set is cheap.
  const rawActiveItems: GatePass[] = []
  activeQueries.forEach((q, i) => {
    const status = ACTIVE_STATUSES[i]
    if (activeStatusFilter && activeStatusFilter !== status) return
    rawActiveItems.push(...(q.data?.items ?? []))
  })
  const activeItemsById = new Map<string, GatePass>()
  for (const item of rawActiveItems) {
    if (!activeItemsById.has(item.id)) activeItemsById.set(item.id, item)
  }
  const activeItems = [...activeItemsById.values()]

  const activeLoading = activeQueries.some((q) => q.isLoading)
  const activeErrorObj = activeQueries.map((q) => q.error).find((e): e is Error => !!e)

  const activeResidentIds = [...new Set(activeItems.map((p) => p.resident_id))]
  const { residentMap: activeResidentMap, allocationMap } = useResidentLookup(activeResidentIds)

  function residentDisplayName(residentId: string): string {
    const resident = activeResidentMap.get(residentId) ?? historyResidentMap.get(residentId)
    return resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "Loading…"
  }

  function roomLabel(residentId: string): string | null {
    const allocation = allocationMap.get(residentId) ?? historyAllocationMap.get(residentId)
    return allocation?.room?.room_number ? `Room ${allocation.room.room_number}` : null
  }

  /* ── History tab ────────────────────────────────────────────── */

  const historyQuery = useQuery({
    queryKey: ["gate-passes", "history", { page: historyPage, perPage: historyPerPage, historyStatusFilter, historySearch }],
    queryFn: () =>
      getGatePasses({
        page: historyPage,
        per_page: historyPerPage,
        status: historyStatusFilter || undefined,
        search: historySearch || undefined,
      }),
    enabled: canView && tab === "history",
  })

  const historyItems = useMemo(() => historyQuery.data?.items ?? [], [historyQuery.data])
  const historyResidentIds = useMemo(() => [...new Set(historyItems.map((p) => p.resident_id))], [historyItems])
  const { residentMap: historyResidentMap, allocationMap: historyAllocationMap } = useResidentLookup(historyResidentIds)

  /* ── Detail dialog acted-by lookup ─────────────────────────────*/

  const detailUserIds = useMemo(
    () =>
      detailTarget
        ? [detailTarget.approved_by, detailTarget.issued_by, detailTarget.verified_by].filter(
            (id): id is string => !!id,
          )
        : [],
    [detailTarget],
  )
  const actedByMap = useActedByLookup(detailUserIds, canViewUsers)

  function actedByLabel(userId: string | null): string {
    if (!userId) return "—"
    const user = actedByMap.get(userId)
    return user ? [user.first_name, user.last_name].filter(Boolean).join(" ") : "Staff"
  }

  /* ── Actions ────────────────────────────────────────────────── */

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: ["gate-passes"] })
    queryClient.invalidateQueries({ queryKey: ["gate-passes-stat"] })
  }

  async function handleApprove(pass: GatePass) {
    setActingId(pass.id)
    try {
      await approveGatePass(pass.id)
      toast.success(`${pass.pass_number} approved.`)
      invalidateAfterAction()
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("gate_passes.approve")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  async function handleRejectConfirm(notes: string) {
    if (!rejectTarget) return
    setDialogLoading(true)
    try {
      await rejectGatePass(rejectTarget.id, { notes: notes || undefined })
      toast.success(`${rejectTarget.pass_number} rejected.`)
      invalidateAfterAction()
      setRejectTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("gate_passes.reject")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return
    setDialogLoading(true)
    try {
      await cancelGatePass(cancelTarget.id)
      toast.success(`${cancelTarget.pass_number} cancelled.`)
      invalidateAfterAction()
      setCancelTarget(null)
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("gate_passes.approve")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  /** One user action, two backend calls (issue then exit). If exit fails
   * after issue succeeds, the pass is genuinely left in "issued" state — we
   * surface that clearly rather than a generic error, and refresh either
   * way so the card reflects the real status (the "Complete Exit" recovery
   * button then takes over). */
  async function handleIssueAndExit(pass: GatePass) {
    setActingId(pass.id)
    try {
      await issueGatePass(pass.id)
      try {
        await markGatePassExit(pass.id)
        toast.success(`${pass.pass_number} issued and exit recorded.`)
      } catch (exitErr) {
        toast.error(
          exitErr instanceof ApiError
            ? `${pass.pass_number} was issued, but marking exit failed: ${exitErr.message}. Use "Complete Exit" to retry.`
            : `${pass.pass_number} was issued, but marking exit failed. Use "Complete Exit" to retry.`,
        )
      }
    } catch (issueErr) {
      if (issueErr instanceof ApiError) {
        if (issueErr.code === "missing_permission") markPermissionDenied("gate_passes.issue")
        toast.error(issueErr.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      invalidateAfterAction()
      setActingId(null)
      setDetailTarget(null)
    }
  }

  async function handleCompleteExit(pass: GatePass) {
    setActingId(pass.id)
    try {
      await markGatePassExit(pass.id)
      toast.success(`${pass.pass_number} exit recorded.`)
      invalidateAfterAction()
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("gate_passes.verify")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  async function handleReturn(pass: GatePass) {
    setActingId(pass.id)
    try {
      await markGatePassReturn(pass.id)
      toast.success(`${pass.pass_number} return recorded.`)
      invalidateAfterAction()
      setDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("gate_passes.verify")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  const forbidden =
    (tab === "active" ? activeErrorObj : historyQuery.error) instanceof ApiError &&
    ((tab === "active" ? activeErrorObj : historyQuery.error) as ApiError).code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Visitors & Security" }, { label: "Gate Passes" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Gate Passes</h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Review, issue, and track residents leaving and returning to the hostel.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setFormOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              New Gate Pass
            </Button>
          )}
        </div>
      </div>

      {canView && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Clock}
            iconClassName="bg-amber-50 text-amber-600"
            label="Pending"
            value={pendingStatQuery.data?.total}
          />
          <StatCard
            icon={CheckCircle2}
            iconClassName="bg-blue-50 text-blue-600"
            label="Approved"
            value={approvedStatQuery.data?.total}
          />
          <StatCard
            icon={DoorOpen}
            iconClassName="bg-emerald-50 text-emerald-600"
            label="Currently Out"
            value={outStatQuery.data?.total}
          />
          <StatCard
            icon={RotateCcw}
            iconClassName="bg-primary/10 text-primary"
            label="Returned Today"
            value={returnedStatQuery.data ? returnedTodayCount : undefined}
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={(value) => (value === "active" || value === "history") && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="active"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Active
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              History
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="active" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <form
              onSubmit={(e: SubmitEvent) => {
                e.preventDefault()
                setActiveSearch(activeSearchInput.trim())
              }}
              className="flex flex-1 items-center gap-2"
            >
              <div className="relative w-full max-w-sm">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
                />
                <Input
                  value={activeSearchInput}
                  onChange={(e) => {
                    const value = e.target.value
                    setActiveSearchInput(value)
                    if (value.trim() === "") setActiveSearch("")
                  }}
                  placeholder="Search by resident name or pass number…"
                  aria-label="Search gate passes"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <Select
              value={activeStatusFilter || "all"}
              onValueChange={(value) => setActiveStatusFilter(!value || value === "all" ? "" : (value as GatePassStatus))}
            >
              <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-48">
                <SelectValue placeholder="Status: All Active" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Status: All Active</SelectItem>
                {HISTORY_STATUS_OPTIONS.filter((o) => ACTIVE_STATUSES.includes(o.value)).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {forbidden ? (
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Gate Passes"
              description="Ask an administrator to grant you the gate_passes.view permission."
            />
          ) : activeErrorObj ? (
            <ErrorState
              message={activeErrorObj.message}
              onRetry={() => activeQueries.forEach((q) => q.refetch())}
            />
          ) : activeLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          ) : activeItems.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No active gate passes"
              description={
                activeSearch || activeStatusFilter
                  ? "No gate passes match your filters."
                  : "No gate passes are pending, approved, or currently out."
              }
              action={canCreate ? { label: "New Gate Pass", onClick: () => setFormOpen(true) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeItems.map((pass) => (
                <GatePassCard
                  key={pass.id}
                  pass={pass}
                  residentName={residentDisplayName(pass.resident_id)}
                  residentAvatarUrl={activeResidentMap.get(pass.resident_id)?.profile_picture_url}
                  roomLabel={roomLabel(pass.resident_id)}
                  acting={actingId === pass.id}
                  canApprove={canApprove}
                  canReject={canReject}
                  canCancel={canCancel}
                  canIssueAndExit={canIssueAndExit}
                  canVerify={canVerify}
                  onOpenDetail={() => setDetailTarget(pass)}
                  onApprove={() => handleApprove(pass)}
                  onReject={() => setRejectTarget(pass)}
                  onCancel={() => setCancelTarget(pass)}
                  onIssueAndExit={() => handleIssueAndExit(pass)}
                  onCompleteExit={() => handleCompleteExit(pass)}
                  onReturn={() => handleReturn(pass)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <form
              onSubmit={(e: SubmitEvent) => {
                e.preventDefault()
                setHistorySearch(historySearchInput.trim())
                setHistoryPage(1)
              }}
              className="flex flex-1 items-center gap-2"
            >
              <div className="relative w-full max-w-sm">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
                />
                <Input
                  value={historySearchInput}
                  onChange={(e) => {
                    const value = e.target.value
                    setHistorySearchInput(value)
                    if (value.trim() === "") {
                      setHistorySearch("")
                      setHistoryPage(1)
                    }
                  }}
                  placeholder="Search by resident name or pass number…"
                  aria-label="Search gate pass history"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <Select
              value={historyStatusFilter || "all"}
              onValueChange={(value) => {
                setHistoryStatusFilter(!value || value === "all" ? "" : (value as GatePassStatus))
                setHistoryPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-48">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {HISTORY_STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {forbidden ? (
              <div className="p-4">
                <EmptyState
                  icon={ShieldOff}
                  title="You don't have access to Gate Passes"
                  description="Ask an administrator to grant you the gate_passes.view permission."
                />
              </div>
            ) : historyQuery.isError ? (
              <div className="p-4">
                <ErrorState message={(historyQuery.error as Error).message} onRetry={() => historyQuery.refetch()} />
              </div>
            ) : historyQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={HistoryIcon}
                  title="No gate passes"
                  description="No gate passes match your filters."
                />
              </div>
            ) : (
              historyQuery.data && (
                <>
                  <div className="overflow-x-auto">
                    <Table className="w-full border-collapse text-left">
                      <TableHeader>
                        <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Pass #
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Resident
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Reason
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Requested
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
                        {historyItems.map((pass) => {
                          const name = residentDisplayName(pass.resident_id)
                          return (
                            <TableRow
                              key={pass.id}
                              className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                            >
                              <TableCell className="px-6 py-4 font-medium text-on-surface">{pass.pass_number}</TableCell>
                              <TableCell className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <Avatar className="size-8 border border-outline-variant">
                                    <AvatarImage
                                      src={historyResidentMap.get(pass.resident_id)?.profile_picture_url ?? undefined}
                                      alt={name}
                                    />
                                    <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
                                      {initials(name) || "?"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm text-on-surface">{name}</p>
                                    <p className="truncate text-xs text-on-surface-variant">
                                      {roomLabel(pass.resident_id) ?? "—"}
                                    </p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-56 truncate px-6 py-4 text-sm text-on-surface-variant">
                                {pass.reason}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-on-surface">
                                {formatDateTime(pass.requested_at)}
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <StatusBadge
                                  status={pass.status}
                                  tone={GATE_PASS_STATUS_TONE[pass.status]}
                                  label={GATE_PASS_STATUS_LABEL[pass.status]}
                                />
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <div className="flex items-center justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger
                                      render={
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon-sm"
                                          aria-label={`View gate pass ${pass.pass_number}`}
                                          onClick={() => setDetailTarget(pass)}
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
                    page={historyQuery.data.page}
                    perPage={historyQuery.data.per_page}
                    total={historyQuery.data.total}
                    onPageChange={setHistoryPage}
                    onPerPageChange={(next) => {
                      setHistoryPerPage(next)
                      setHistoryPage(1)
                    }}
                  />
                </>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>

      <GatePassFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <GatePassDetailDialog
        open={!!detailTarget}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        pass={detailTarget}
        residentName={detailTarget ? residentDisplayName(detailTarget.resident_id) : ""}
        residentSubtitle={
          detailTarget
            ? (activeResidentMap.get(detailTarget.resident_id) ?? historyResidentMap.get(detailTarget.resident_id))
                ?.student_id ?? undefined
            : undefined
        }
        residentAvatarUrl={
          detailTarget
            ? (activeResidentMap.get(detailTarget.resident_id) ?? historyResidentMap.get(detailTarget.resident_id))
                ?.profile_picture_url
            : undefined
        }
        actedByLabel={actedByLabel}
        canApprove={canApprove}
        canReject={canReject}
        canCancel={canCancel}
        canIssueAndExit={canIssueAndExit}
        canVerify={canVerify}
        acting={(!!detailTarget && actingId === detailTarget.id) || dialogLoading}
        onApprove={() => detailTarget && handleApprove(detailTarget)}
        onReject={() => detailTarget && setRejectTarget(detailTarget)}
        onCancel={() => detailTarget && setCancelTarget(detailTarget)}
        onIssueAndExit={() => detailTarget && handleIssueAndExit(detailTarget)}
        onCompleteExit={() => detailTarget && handleCompleteExit(detailTarget)}
        onReturn={() => detailTarget && handleReturn(detailTarget)}
      />

      <RejectGatePassDialog
        key={rejectTarget?.id ?? "reject-none"}
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        passNumber={rejectTarget?.pass_number ?? ""}
        loading={dialogLoading}
        onConfirm={handleRejectConfirm}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this gate pass?"
        description={`This cancels ${cancelTarget?.pass_number ?? "this gate pass"}. This cannot be undone.`}
        confirmLabel="Cancel Gate Pass"
        destructive
        loading={dialogLoading}
        onConfirm={handleCancelConfirm}
      />
    </div>
  )
}
