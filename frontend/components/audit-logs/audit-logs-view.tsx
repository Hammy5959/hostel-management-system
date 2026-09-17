"use client"

import { Fragment, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { ChevronDown, ChevronRight, FileClock } from "lucide-react"

import { PageHeader } from "@/components/hostel/page-header"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge, type Tone } from "@/components/hostel/status-badge"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DateRangePicker,
  getPresetRange,
  DEFAULT_DATE_PRESET,
  type DateRange,
} from "@/components/reports/date-range-picker"
import { AuditLogDetail } from "@/components/audit-logs/audit-log-detail"
import { humanizeAction } from "@/lib/audit-log-format"
import { fetchAuditActorOptions } from "@/lib/hostel-options"
import { getAuditLogs } from "@/lib/api"
import type { AuditLogItem } from "@/lib/types"

/** Every `action` value any `record_audit()` call site in the backend
 * currently writes. No distinct-values endpoint exists to derive this list
 * live, so it's a maintained snapshot — a future new audited action needs a
 * matching entry added here to appear in the filter (it still shows up in
 * the table either way, just without a dedicated filter option until then). */
const AUDIT_ACTIONS = [
  "user.create", "user.update", "user.role_changed", "user.status", "user.password_reset", "user.deleted",
  "role.create", "role.rename", "role.status", "role.update", "role.delete", "role.permissions",
  "login", "login.failed",
  "stay.check_in", "stay.check_out",
  "allocation.create", "allocation.transfer", "allocation.release",
  "admission.create", "admission.approve", "admission.reject", "admission.cancel",
  "payment.create",
  "expense.create", "expense.update",
  "resident.checkout", "resident.mark_returned", "resident.portal_access_enabled",
  "emergency_contact.delete",
  "complaint.cancel",
  "leave.approve", "leave.reject", "leave.cancel",
  "attendance.bulk_mark",
  "inventory.adjust",
  "invoice.create", "invoice.update", "invoice.issue", "invoice.cancel",
  "notice.delete",
  "mess_menu.delete",
].sort()

const AUDIT_MODULES = [
  "admissions", "attendance", "auth", "complaints", "emergency_contacts", "expenses",
  "inventory_items", "invoices", "leave_requests", "mess_menus", "notices", "payments",
  "residents", "resident_stays", "roles", "room_allocations", "users",
].sort()

const AUDIT_ENTITY_TYPES = [
  "admission", "attendance", "complaint", "emergency_contact", "expense", "invoice",
  "inventory_item", "leave_request", "mess_menu", "notice", "payment", "resident",
  "resident_stay", "role", "room_allocation", "user",
].sort()

function actionTone(action: string): Tone {
  if (action === "login.failed") return "danger"
  if (action.endsWith(".delete") || action.endsWith(".cancel")) return "warning"
  return "neutral"
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function actorName(log: AuditLogItem): string {
  if (!log.actor) return "System"
  return `${log.actor.first_name} ${log.actor.last_name ?? ""}`.trim()
}

export function AuditLogsView() {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [action, setAction] = useState("")
  const [module, setModule] = useState("")
  const [entityType, setEntityType] = useState("")
  const [actor, setActor] = useState<ComboOption | null>(null)
  const [range, setRange] = useState<DateRange>(() => getPresetRange(DEFAULT_DATE_PRESET))
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function resetToFirstPage() {
    setPage(1)
  }

  const query = useQuery({
    queryKey: ["audit-logs", { page, perPage, action, module, entityType, userId: actor?.value, ...range }],
    queryFn: () =>
      getAuditLogs({
        page,
        per_page: perPage,
        action: action || undefined,
        module: module || undefined,
        entity_type: entityType || undefined,
        user_id: actor?.value || undefined,
        date_from: range.dateFrom || undefined,
        date_to: range.dateTo || undefined,
      }),
  })

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const items = query.data?.items ?? []
  const hasFilters = !!(action || module || entityType || actor)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs"
        description="A read-only, append-only record of every action taken across the system."
      />

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <DateRangePicker
          value={range}
          onChange={(next) => {
            setRange(next)
            resetToFirstPage()
          }}
        />

        <Select
          value={action || "all"}
          onValueChange={(value) => {
            setAction(!value || value === "all" ? "" : value)
            resetToFirstPage()
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-48">
            <SelectValue placeholder="Action: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Action: All</SelectItem>
            {AUDIT_ACTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {humanizeAction(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={module || "all"}
          onValueChange={(value) => {
            setModule(!value || value === "all" ? "" : value)
            resetToFirstPage()
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44">
            <SelectValue placeholder="Module: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Module: All</SelectItem>
            {AUDIT_MODULES.map((value) => (
              <SelectItem key={value} value={value}>
                {humanizeAction(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={entityType || "all"}
          onValueChange={(value) => {
            setEntityType(!value || value === "all" ? "" : value)
            resetToFirstPage()
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44">
            <SelectValue placeholder="Entity: All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Entity: All</SelectItem>
            {AUDIT_ENTITY_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {humanizeAction(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <EntityCombobox
          value={actor}
          onChange={(next) => {
            setActor(next)
            resetToFirstPage()
          }}
          fetchOptions={fetchAuditActorOptions}
          placeholder="Actor: All"
          className="w-full lg:w-52"
        />
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        {query.isError ? (
          <div className="p-4">
            <ErrorState message="Couldn't load audit logs." onRetry={() => query.refetch()} />
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
              icon={FileClock}
              title="No audit log entries"
              description={hasFilters ? "No activity matches the current filters." : "No activity has been recorded yet."}
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
                        Timestamp
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        User
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Action
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Module
                      </TableHead>
                      <TableHead className="h-auto px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Description
                      </TableHead>
                      <TableHead className="h-auto w-10 px-6 py-4" />
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-outline-variant">
                    {items.map((log) => {
                      const expanded = expandedIds.has(log.id)
                      return (
                        <Fragment key={log.id}>
                          <TableRow
                            role="button"
                            tabIndex={0}
                            aria-expanded={expanded}
                            onClick={() => toggleExpanded(log.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                toggleExpanded(log.id)
                              }
                            }}
                            className="group cursor-pointer border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                          >
                            <TableCell className="px-6 py-4 text-sm text-on-surface">
                              <div>{formatDateTime(log.created_at)}</div>
                              <div className="text-xs text-outline">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-sm">
                              {log.actor ? (
                                <span className="font-medium text-on-surface">{actorName(log)}</span>
                              ) : (
                                <span className="text-on-surface-variant italic">System</span>
                              )}
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <StatusBadge
                                status={log.action}
                                tone={actionTone(log.action)}
                                label={humanizeAction(log.action)}
                              />
                            </TableCell>
                            <TableCell className="px-6 py-4 text-xs font-medium text-on-surface-variant uppercase">
                              {log.module}
                            </TableCell>
                            <TableCell className="max-w-md truncate px-6 py-4 text-sm text-on-surface-variant">
                              {log.description ?? humanizeAction(log.action)}
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              {expanded ? (
                                <ChevronDown aria-hidden className="size-4 text-on-surface-variant" />
                              ) : (
                                <ChevronRight aria-hidden className="size-4 text-on-surface-variant" />
                              )}
                            </TableCell>
                          </TableRow>
                          {expanded && (
                            <TableRow className="bg-surface-container-low/40 hover:bg-surface-container-low/40">
                              <TableCell colSpan={6} className="p-0">
                                <AuditLogDetail log={log} />
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
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
    </div>
  )
}
