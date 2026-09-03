"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, ClipboardList, Eye, Inbox, Plus, Search, ShieldOff, Wrench } from "lucide-react"
import { toast } from "sonner"

import { todayLocalDate } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge } from "@/components/hostel/status-badge"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"

import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import {
  ApiError,
  createMaintenanceTicket,
  getComplaints,
  getMaintenanceTickets,
  getResident,
  getRoom,
  getStaff,
  updateComplaint,
  updateMaintenanceTicket,
} from "@/lib/api"
import { fetchMaintenanceRoomOptions } from "@/lib/hostel-options"
import type { Complaint, ComplaintStatus, MaintenancePriority, MaintenanceTicket, MaintenanceTicketStatus, Resident, Room, Staff } from "@/lib/types"

import {
  ComplaintCard,
  formatDateTime,
  MAINTENANCE_STATUS_LABEL,
  MAINTENANCE_STATUS_TONE,
  PRIORITY_LABEL,
  PRIORITY_TONE,
} from "@/components/maintenance/complaint-card"
import { ComplaintFormDialog } from "@/components/maintenance/complaint-form-dialog"
import { ComplaintDetailDialog } from "@/components/maintenance/complaint-detail-dialog"
import { TicketDetailDialog } from "@/components/maintenance/ticket-detail-dialog"
import { AssignTicketDialog } from "@/components/maintenance/assign-ticket-dialog"

/** Every status/priority a complaint or ticket can carry — same enum shared
 * by both resources server-side. */
const STATUS_OPTIONS = (Object.keys(MAINTENANCE_STATUS_LABEL) as ComplaintStatus[]).map((value) => ({
  value,
  label: MAINTENANCE_STATUS_LABEL[value],
}))
const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as MaintenancePriority[]).map((value) => ({
  value,
  label: PRIORITY_LABEL[value],
}))

/** Bulk fetch capped at 100 rows, same tradeoff as useVisitorMap/the gate
 * passes "Returned Today" stat elsewhere in this codebase — fine at a single
 * hostel's scale. Neither GET /complaints nor GET /maintenance-tickets
 * supports a `priority` filter or (for complaints) a `search` param, so both
 * tabs' Search/Priority filtering — and the complaint<->ticket cross-linking
 * needed for "Assigned to"/"Resolved by" and "Filed from complaint" — happen
 * client-side against these two bulk pages instead. The proper fix, if a
 * hostel's complaint/ticket volume ever outgrows 100 open records, is
 * backend `search`/`priority` params and a `complaint_id` filter on
 * GET /maintenance-tickets. */
const BULK_PAGE_SIZE = 100
const PAGE_SIZE = 20

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Wrench
  iconClassName: string
  label: string
  value: number | undefined
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={`flex size-10 items-center justify-center rounded-full ${iconClassName}`}>
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

/** Resident name lookup — complaint rows only carry a bare resident_id, no
 * server-side join, same tradeoff as useResidentLookup in visitors-view.tsx. */
function useResidentNameLookup(residentIds: string[]) {
  const queries = useQueries({
    queries: residentIds.map((id) => ({
      queryKey: ["resident", id],
      queryFn: () => getResident(id),
      staleTime: 5 * 60_000,
    })),
  })
  const map = new Map<string, Resident>()
  residentIds.forEach((id, i) => {
    const resident = queries[i]?.data
    if (resident) map.set(id, resident)
  })
  return map
}

/** Room label lookup for both complaints and tickets — per-id GET /rooms/{id},
 * same shape as the resident lookup above. */
function useRoomLookup(roomIds: string[]) {
  const queries = useQueries({
    queries: roomIds.map((id) => ({
      queryKey: ["room", id],
      queryFn: () => getRoom(id),
      staleTime: 5 * 60_000,
    })),
  })
  const map = new Map<string, Room>()
  roomIds.forEach((id, i) => {
    const room = queries[i]?.data
    if (room) map.set(id, room)
  })
  return map
}

/** "Assigned to"/"Resolved by" staff name resolution — only attempted when
 * the viewer has staff.view, mirroring useActedByLookup in gate-passes-view.tsx.
 * Falls back to a neutral "Staff" label otherwise. */
function useStaffLookup(staffIds: string[], enabled: boolean) {
  const queries = useQueries({
    queries: (enabled ? staffIds : []).map((id) => ({
      queryKey: ["staff", id],
      queryFn: () => getStaff(id),
      staleTime: 5 * 60_000,
    })),
  })
  const map = new Map<string, Staff>()
  if (enabled) {
    staffIds.forEach((id, i) => {
      const staff = queries[i]?.data
      if (staff) map.set(id, staff)
    })
  }
  return map
}

export function MaintenanceView() {
  const { has, hasAny } = usePermissions()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<"complaints" | "tickets">("complaints")
  const [formOpen, setFormOpen] = useState(false)
  const [editingComplaint, setEditingComplaint] = useState<Complaint | null>(null)
  const [complaintDetailTarget, setComplaintDetailTarget] = useState<Complaint | null>(null)
  const [ticketDetailTarget, setTicketDetailTarget] = useState<MaintenanceTicket | null>(null)
  const [cancelComplaintTarget, setCancelComplaintTarget] = useState<Complaint | null>(null)
  const [cancelTicketTarget, setCancelTicketTarget] = useState<MaintenanceTicket | null>(null)
  const [assignTarget, setAssignTarget] = useState<MaintenanceTicket | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [dialogLoading, setDialogLoading] = useState(false)

  // Complaints tab filters
  const [complaintSearchInput, setComplaintSearchInput] = useState("")
  const [complaintSearch, setComplaintSearch] = useState("")
  const [complaintStatusFilter, setComplaintStatusFilter] = useState<"" | ComplaintStatus>("")
  const [complaintPriorityFilter, setComplaintPriorityFilter] = useState<"" | MaintenancePriority>("")
  const [complaintRoomFilter, setComplaintRoomFilter] = useState<ComboOption | null>(null)
  const [complaintPage, setComplaintPage] = useState(1)
  const [complaintPerPage, setComplaintPerPage] = useState(PAGE_SIZE)

  // Tickets tab filters
  const [ticketSearchInput, setTicketSearchInput] = useState("")
  const [ticketSearch, setTicketSearch] = useState("")
  const [ticketStatusFilter, setTicketStatusFilter] = useState<"" | MaintenanceTicketStatus>("")
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState<"" | MaintenancePriority>("")
  const [ticketRoomFilter, setTicketRoomFilter] = useState<ComboOption | null>(null)
  const [ticketPage, setTicketPage] = useState(1)
  const [ticketPerPage, setTicketPerPage] = useState(PAGE_SIZE)

  const canViewComplaints = hasAny("complaints.view", "complaints.view_own")
  const canCreateComplaint = has("complaints.create")
  const canUpdateComplaint = has("complaints.update")
  const canViewTickets = has("maintenance_tickets.view")
  const canCreateTicket = has("maintenance_tickets.create")
  const canUpdateTicket = has("maintenance_tickets.update")
  const canViewStaff = has("staff.view")
  const canAssign = canUpdateTicket && canViewStaff

  /* ── Bulk data (shared by stats, both tabs, and cross-linking) ─────── */

  const complaintsQuery = useQuery({
    queryKey: ["complaints", "all"],
    queryFn: () => getComplaints({ per_page: BULK_PAGE_SIZE }),
    enabled: canViewComplaints,
  })
  const ticketsQuery = useQuery({
    queryKey: ["maintenance-tickets", "all"],
    queryFn: () => getMaintenanceTickets({ per_page: BULK_PAGE_SIZE }),
    enabled: canViewTickets,
  })

  const allComplaints = useMemo(() => complaintsQuery.data?.items ?? [], [complaintsQuery.data])
  const allTickets = useMemo(() => ticketsQuery.data?.items ?? [], [ticketsQuery.data])

  const ticketByComplaintId = useMemo(() => {
    const map = new Map<string, MaintenanceTicket>()
    for (const ticket of allTickets) {
      if (ticket.complaint_id && !map.has(ticket.complaint_id)) map.set(ticket.complaint_id, ticket)
    }
    return map
  }, [allTickets])

  const complaintById = useMemo(() => {
    const map = new Map<string, Complaint>()
    for (const complaint of allComplaints) map.set(complaint.id, complaint)
    return map
  }, [allComplaints])

  const residentIds = useMemo(() => [...new Set(allComplaints.map((c) => c.resident_id))], [allComplaints])
  const residentMap = useResidentNameLookup(residentIds)
  function residentDisplayName(residentId: string): string {
    const resident = residentMap.get(residentId)
    return resident ? [resident.first_name, resident.last_name].filter(Boolean).join(" ") : "Loading…"
  }

  const roomIds = useMemo(() => {
    const ids = new Set<string>()
    for (const c of allComplaints) if (c.room_id) ids.add(c.room_id)
    for (const t of allTickets) if (t.room_id) ids.add(t.room_id)
    return [...ids]
  }, [allComplaints, allTickets])
  const roomMap = useRoomLookup(roomIds)
  function roomLabel(roomId: string | null): string | null {
    if (!roomId) return null
    const room = roomMap.get(roomId)
    return room ? `Room ${room.room_number}` : null
  }

  const staffIds = useMemo(
    () => [...new Set(allTickets.map((t) => t.assigned_to).filter((id): id is string => !!id))],
    [allTickets],
  )
  const staffMap = useStaffLookup(staffIds, canViewStaff)
  function staffLabel(staffId: string | null): string {
    if (!staffId) return "Unassigned"
    const staff = staffMap.get(staffId)
    if (!staff) return "Staff"
    return staff.user ? [staff.user.first_name, staff.user.last_name].filter(Boolean).join(" ") : "Staff"
  }

  /* ── Stat cards ─────────────────────────────────────────────── */

  const openComplaintsStatQuery = useQuery({
    queryKey: ["complaints", "stat", "open"],
    queryFn: () => getComplaints({ status: "open", per_page: 1 }),
    enabled: canViewComplaints,
  })
  const activeAssignedStatQuery = useQuery({
    queryKey: ["maintenance-tickets", "stat", "assigned"],
    queryFn: () => getMaintenanceTickets({ status: "assigned", per_page: 1 }),
    enabled: canViewTickets,
  })
  const activeInProgressStatQuery = useQuery({
    queryKey: ["maintenance-tickets", "stat", "in_progress"],
    queryFn: () => getMaintenanceTickets({ status: "in_progress", per_page: 1 }),
    enabled: canViewTickets,
  })
  const activeTicketsCount =
    activeAssignedStatQuery.data && activeInProgressStatQuery.data
      ? activeAssignedStatQuery.data.total + activeInProgressStatQuery.data.total
      : undefined

  const resolvedTodayStatQuery = useQuery({
    queryKey: ["maintenance-tickets", "stat", "resolved-today"],
    queryFn: () => getMaintenanceTickets({ status: "resolved", per_page: BULK_PAGE_SIZE }),
    enabled: canViewTickets,
  })
  const resolvedTodayCount = useMemo(() => {
    if (!resolvedTodayStatQuery.data) return undefined
    const today = todayLocalDate()
    return resolvedTodayStatQuery.data.items.filter((t) => {
      if (!t.resolved_at) return false
      const d = new Date(t.resolved_at)
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      return local === today
    }).length
  }, [resolvedTodayStatQuery.data])

  const urgentCount = complaintsQuery.data
    ? allComplaints.filter(
        (c) => (c.priority === "high" || c.priority === "urgent") && c.status !== "resolved" && c.status !== "closed" && c.status !== "cancelled",
      ).length
    : undefined

  /* ── Complaints tab ─────────────────────────────────────────── */

  const filteredComplaints = useMemo(() => {
    return allComplaints.filter((c) => {
      if (complaintStatusFilter && c.status !== complaintStatusFilter) return false
      if (complaintPriorityFilter && c.priority !== complaintPriorityFilter) return false
      if (complaintRoomFilter && c.room_id !== complaintRoomFilter.value) return false
      if (complaintSearch) {
        const q = complaintSearch.toLowerCase()
        if (!c.title.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allComplaints, complaintStatusFilter, complaintPriorityFilter, complaintRoomFilter, complaintSearch])

  const pagedComplaints = useMemo(() => {
    const start = (complaintPage - 1) * complaintPerPage
    return filteredComplaints.slice(start, start + complaintPerPage)
  }, [filteredComplaints, complaintPage, complaintPerPage])

  /* ── Tickets tab ────────────────────────────────────────────── */

  const filteredTickets = useMemo(() => {
    return allTickets.filter((t) => {
      if (ticketStatusFilter && t.status !== ticketStatusFilter) return false
      if (ticketPriorityFilter && t.priority !== ticketPriorityFilter) return false
      if (ticketRoomFilter && t.room_id !== ticketRoomFilter.value) return false
      if (ticketSearch) {
        const q = ticketSearch.toLowerCase()
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allTickets, ticketStatusFilter, ticketPriorityFilter, ticketRoomFilter, ticketSearch])

  const pagedTickets = useMemo(() => {
    const start = (ticketPage - 1) * ticketPerPage
    return filteredTickets.slice(start, start + ticketPerPage)
  }, [filteredTickets, ticketPage, ticketPerPage])

  /* ── Actions ────────────────────────────────────────────────── */

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: ["complaints"] })
    queryClient.invalidateQueries({ queryKey: ["maintenance-tickets"] })
  }

  async function handleCreateTicket(complaint: Complaint) {
    setActingId(complaint.id)
    try {
      await createMaintenanceTicket({
        complaint_id: complaint.id,
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        priority: complaint.priority,
        room_id: complaint.room_id,
      })
      toast.success("Ticket created.")
      invalidateAfterAction()
      setComplaintDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("maintenance_tickets.create")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  async function handleCancelComplaintConfirm() {
    if (!cancelComplaintTarget) return
    setDialogLoading(true)
    try {
      await updateComplaint(cancelComplaintTarget.id, { status: "cancelled" })
      toast.success("Complaint cancelled.")
      invalidateAfterAction()
      setCancelComplaintTarget(null)
      setComplaintDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("complaints.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleAssignConfirm(staffId: string) {
    if (!assignTarget) return
    setDialogLoading(true)
    try {
      await updateMaintenanceTicket(assignTarget.id, { assigned_to: staffId, status: "assigned" })
      toast.success("Ticket assigned.")
      invalidateAfterAction()
      setAssignTarget(null)
      setTicketDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("maintenance_tickets.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  async function handleTicketStatusChange(ticket: MaintenanceTicket, status: MaintenanceTicketStatus, verb: string) {
    setActingId(ticket.id)
    try {
      await updateMaintenanceTicket(ticket.id, { status })
      toast.success(`Ticket ${verb}.`)
      invalidateAfterAction()
      setTicketDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("maintenance_tickets.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setActingId(null)
    }
  }

  async function handleCancelTicketConfirm() {
    if (!cancelTicketTarget) return
    setDialogLoading(true)
    try {
      await updateMaintenanceTicket(cancelTicketTarget.id, { status: "cancelled" })
      toast.success("Ticket cancelled.")
      invalidateAfterAction()
      setCancelTicketTarget(null)
      setTicketDetailTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("maintenance_tickets.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDialogLoading(false)
    }
  }

  const complaintsForbidden = complaintsQuery.error instanceof ApiError && complaintsQuery.error.code === "missing_permission"
  const ticketsForbidden = ticketsQuery.error instanceof ApiError && ticketsQuery.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Maintenance & Inventory" }, { label: "Maintenance" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Maintenance</h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Track, assign, and resolve dormitory complaints and repair tickets.
            </p>
          </div>
          {canCreateComplaint && (
            <Button
              type="button"
              onClick={() => {
                setEditingComplaint(null)
                setFormOpen(true)
              }}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              New Complaint
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          iconClassName="bg-amber-50 text-amber-600"
          label="Open Complaints"
          value={canViewComplaints ? openComplaintsStatQuery.data?.total : 0}
        />
        <StatCard
          icon={Wrench}
          iconClassName="bg-blue-50 text-blue-600"
          label="Active Tickets"
          value={canViewTickets ? activeTicketsCount : 0}
        />
        <StatCard
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Resolved Today"
          value={canViewTickets ? resolvedTodayCount : 0}
        />
        <StatCard
          icon={AlertTriangle}
          iconClassName="bg-error-container text-error"
          label="Urgent"
          value={canViewComplaints ? urgentCount : 0}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => (value === "complaints" || value === "tickets") && setTab(value)}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="complaints"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Complaints
            </TabsTrigger>
            <TabsTrigger
              value="tickets"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Tickets
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="complaints" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <form
              onSubmit={(e: SubmitEvent) => {
                e.preventDefault()
                setComplaintSearch(complaintSearchInput.trim())
                setComplaintPage(1)
              }}
              className="flex flex-1 items-center gap-2"
            >
              <div className="relative w-full max-w-sm">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
                />
                <Input
                  value={complaintSearchInput}
                  onChange={(e) => {
                    const value = e.target.value
                    setComplaintSearchInput(value)
                    if (value.trim() === "") {
                      setComplaintSearch("")
                      setComplaintPage(1)
                    }
                  }}
                  placeholder="Search complaints…"
                  aria-label="Search complaints"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={complaintStatusFilter || "all"}
                onValueChange={(value) => {
                  setComplaintStatusFilter(!value || value === "all" ? "" : (value as ComplaintStatus))
                  setComplaintPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-40">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status: All</SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={complaintPriorityFilter || "all"}
                onValueChange={(value) => {
                  setComplaintPriorityFilter(!value || value === "all" ? "" : (value as MaintenancePriority))
                  setComplaintPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-40">
                  <SelectValue placeholder="Priority: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Priority: All</SelectItem>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <EntityCombobox
                value={complaintRoomFilter}
                onChange={(next) => {
                  setComplaintRoomFilter(next)
                  setComplaintPage(1)
                }}
                fetchOptions={fetchMaintenanceRoomOptions}
                placeholder="Room: All"
                className="h-10 w-full bg-surface-container lg:w-40"
              />
            </div>
          </div>

          {complaintsForbidden ? (
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Complaints"
              description="Ask an administrator to grant you the complaints.view permission."
            />
          ) : complaintsQuery.error ? (
            <ErrorState message={(complaintsQuery.error as Error).message} onRetry={() => complaintsQuery.refetch()} />
          ) : complaintsQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredComplaints.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No complaints"
              description={
                complaintSearch || complaintStatusFilter || complaintPriorityFilter || complaintRoomFilter
                  ? "No complaints match your filters."
                  : "No complaints have been filed yet."
              }
              action={
                canCreateComplaint
                  ? {
                      label: "New Complaint",
                      onClick: () => {
                        setEditingComplaint(null)
                        setFormOpen(true)
                      },
                    }
                  : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pagedComplaints.map((complaint) => (
                  <ComplaintCard
                    key={complaint.id}
                    complaint={complaint}
                    residentName={residentDisplayName(complaint.resident_id)}
                    roomLabel={roomLabel(complaint.room_id)}
                    ticket={ticketByComplaintId.get(complaint.id)}
                    staffLabel={staffLabel}
                    onOpenDetail={() => setComplaintDetailTarget(complaint)}
                    onEdit={() => {
                      setEditingComplaint(complaint)
                      setFormOpen(true)
                    }}
                    onCreateTicket={() => handleCreateTicket(complaint)}
                    onCancel={() => setCancelComplaintTarget(complaint)}
                    acting={actingId === complaint.id}
                    canEdit={canUpdateComplaint && complaint.status === "open"}
                    canCreateTicket={canCreateTicket}
                    canCancel={canUpdateComplaint}
                  />
                ))}
              </div>
              <Pagination
                page={complaintPage}
                perPage={complaintPerPage}
                total={filteredComplaints.length}
                onPageChange={setComplaintPage}
                onPerPageChange={(next) => {
                  setComplaintPerPage(next)
                  setComplaintPage(1)
                }}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="tickets" className="space-y-6 pt-6">
          <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
            <form
              onSubmit={(e: SubmitEvent) => {
                e.preventDefault()
                setTicketSearch(ticketSearchInput.trim())
                setTicketPage(1)
              }}
              className="flex flex-1 items-center gap-2"
            >
              <div className="relative w-full max-w-sm">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
                />
                <Input
                  value={ticketSearchInput}
                  onChange={(e) => {
                    const value = e.target.value
                    setTicketSearchInput(value)
                    if (value.trim() === "") {
                      setTicketSearch("")
                      setTicketPage(1)
                    }
                  }}
                  placeholder="Search tickets…"
                  aria-label="Search tickets"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={ticketStatusFilter || "all"}
                onValueChange={(value) => {
                  setTicketStatusFilter(!value || value === "all" ? "" : (value as MaintenanceTicketStatus))
                  setTicketPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-40">
                  <SelectValue placeholder="Status: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Status: All</SelectItem>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={ticketPriorityFilter || "all"}
                onValueChange={(value) => {
                  setTicketPriorityFilter(!value || value === "all" ? "" : (value as MaintenancePriority))
                  setTicketPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-40">
                  <SelectValue placeholder="Priority: All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Priority: All</SelectItem>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <EntityCombobox
                value={ticketRoomFilter}
                onChange={(next) => {
                  setTicketRoomFilter(next)
                  setTicketPage(1)
                }}
                fetchOptions={fetchMaintenanceRoomOptions}
                placeholder="Room: All"
                className="h-10 w-full bg-surface-container lg:w-40"
              />
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {ticketsForbidden ? (
              <div className="p-4">
                <EmptyState
                  icon={ShieldOff}
                  title="You don't have access to Maintenance Tickets"
                  description="Ask an administrator to grant you the maintenance_tickets.view permission."
                />
              </div>
            ) : ticketsQuery.isError ? (
              <div className="p-4">
                <ErrorState message={(ticketsQuery.error as Error).message} onRetry={() => ticketsQuery.refetch()} />
              </div>
            ) : ticketsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Wrench}
                  title="No tickets"
                  description="No maintenance tickets match your filters. Tickets are created from a complaint's Create Ticket action."
                />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table className="w-full border-collapse text-left">
                    <TableHeader>
                      <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Ticket #
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Issue
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Room
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Assigned To
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Priority
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Status
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Created
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-outline-variant">
                      {pagedTickets.map((ticket) => (
                        <TableRow
                          key={ticket.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setTicketDetailTarget(ticket)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              setTicketDetailTarget(ticket)
                            }
                          }}
                          className="cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                        >
                          <TableCell className="px-6 py-4 font-mono text-xs font-bold text-on-surface-variant">
                            TCK-{ticket.id.slice(0, 8).toUpperCase()}
                          </TableCell>
                          <TableCell className="max-w-64 truncate px-6 py-4 font-medium text-on-surface">
                            {ticket.title}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                            {roomLabel(ticket.room_id) ?? "—"}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                            {ticket.assigned_to ? staffLabel(ticket.assigned_to) : "—"}
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <StatusBadge
                              status={ticket.priority}
                              tone={PRIORITY_TONE[ticket.priority]}
                              label={PRIORITY_LABEL[ticket.priority]}
                            />
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <StatusBadge
                              status={ticket.status}
                              tone={MAINTENANCE_STATUS_TONE[ticket.status]}
                              label={MAINTENANCE_STATUS_LABEL[ticket.status]}
                            />
                          </TableCell>
                          <TableCell className="px-6 py-4 text-sm text-on-surface">
                            {formatDateTime(ticket.created_at)}
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
                                      aria-label={`View ticket TCK-${ticket.id.slice(0, 8).toUpperCase()}`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setTicketDetailTarget(ticket)
                                      }}
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
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Pagination
                  page={ticketPage}
                  perPage={ticketPerPage}
                  total={filteredTickets.length}
                  onPageChange={setTicketPage}
                  onPerPageChange={(next) => {
                    setTicketPerPage(next)
                    setTicketPage(1)
                  }}
                />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ComplaintFormDialog
        key={editingComplaint?.id ?? "create"}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open)
          if (!open) setEditingComplaint(null)
        }}
        complaint={editingComplaint}
        residentName={editingComplaint ? residentDisplayName(editingComplaint.resident_id) : undefined}
      />

      <ComplaintDetailDialog
        open={!!complaintDetailTarget}
        onOpenChange={(open) => !open && setComplaintDetailTarget(null)}
        complaint={complaintDetailTarget}
        residentName={complaintDetailTarget ? residentDisplayName(complaintDetailTarget.resident_id) : ""}
        roomLabel={complaintDetailTarget ? roomLabel(complaintDetailTarget.room_id) : null}
        ticket={complaintDetailTarget ? ticketByComplaintId.get(complaintDetailTarget.id) : undefined}
        staffLabel={staffLabel}
        canCreateTicket={canCreateTicket}
        canCancel={canUpdateComplaint}
        acting={(!!complaintDetailTarget && actingId === complaintDetailTarget.id) || dialogLoading}
        onCreateTicket={() => complaintDetailTarget && handleCreateTicket(complaintDetailTarget)}
        onCancel={() => complaintDetailTarget && setCancelComplaintTarget(complaintDetailTarget)}
      />

      <TicketDetailDialog
        open={!!ticketDetailTarget}
        onOpenChange={(open) => !open && setTicketDetailTarget(null)}
        ticket={ticketDetailTarget}
        roomLabel={ticketDetailTarget ? roomLabel(ticketDetailTarget.room_id) : null}
        staffLabel={staffLabel}
        complaintTitle={
          ticketDetailTarget?.complaint_id ? (complaintById.get(ticketDetailTarget.complaint_id)?.title ?? null) : null
        }
        canUpdate={canUpdateTicket}
        canAssign={canAssign}
        acting={(!!ticketDetailTarget && actingId === ticketDetailTarget.id) || dialogLoading}
        onAssign={() => ticketDetailTarget && setAssignTarget(ticketDetailTarget)}
        onStart={() => ticketDetailTarget && handleTicketStatusChange(ticketDetailTarget, "in_progress", "started")}
        onResolve={() => ticketDetailTarget && handleTicketStatusChange(ticketDetailTarget, "resolved", "resolved")}
        onClose={() => ticketDetailTarget && handleTicketStatusChange(ticketDetailTarget, "closed", "closed")}
        onCancel={() => ticketDetailTarget && setCancelTicketTarget(ticketDetailTarget)}
      />

      <AssignTicketDialog
        key={assignTarget?.id ?? "assign-none"}
        open={!!assignTarget}
        onOpenChange={(open) => !open && setAssignTarget(null)}
        ticketTitle={assignTarget?.title ?? ""}
        loading={dialogLoading}
        onConfirm={handleAssignConfirm}
      />

      <ConfirmDialog
        open={!!cancelComplaintTarget}
        onOpenChange={(open) => !open && setCancelComplaintTarget(null)}
        title="Cancel this complaint?"
        description={`This cancels "${cancelComplaintTarget?.title ?? "this complaint"}". This cannot be undone.`}
        confirmLabel="Cancel Complaint"
        destructive
        loading={dialogLoading}
        onConfirm={handleCancelComplaintConfirm}
      />

      <ConfirmDialog
        open={!!cancelTicketTarget}
        onOpenChange={(open) => !open && setCancelTicketTarget(null)}
        title="Cancel this ticket?"
        description={`This cancels "${cancelTicketTarget?.title ?? "this ticket"}". This cannot be undone.`}
        confirmLabel="Cancel Ticket"
        destructive
        loading={dialogLoading}
        onConfirm={handleCancelTicketConfirm}
      />
    </div>
  )
}
