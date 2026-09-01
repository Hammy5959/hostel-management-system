"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import {
  Activity,
  BedDouble,
  DoorOpen,
  LogIn,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Wallet,
  Wrench,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn, formatCurrency } from "@/lib/utils"
import {
  getAuditLogs,
  getDashboardSummary,
  getOccupancyReport,
} from "@/lib/api"
import type { AuditLogItem, OccupancyReport } from "@/lib/types"

/* ── helpers ──────────────────────────────────────────────────── */

function humanizeAction(action: string): string {
  return action
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function logStyle(module: string): { icon: LucideIcon; bg: string } {
  const m = module?.toLowerCase() ?? ""
  if (m.includes("auth")) return { icon: LogIn, bg: "bg-primary-fixed text-on-primary-fixed" }
  if (m.includes("payment") || m.includes("invoice") || m.includes("charge") || m.includes("expense"))
    return { icon: Wallet, bg: "bg-secondary-fixed text-on-secondary-fixed" }
  if (m.includes("maintenance")) return { icon: Wrench, bg: "bg-error-container text-on-error-container" }
  if (m.includes("visitor") || m.includes("gate"))
    return { icon: ShieldCheck, bg: "bg-secondary-fixed text-on-secondary-fixed" }
  if (m.includes("admission") || m.includes("resident") || m.includes("allocation"))
    return { icon: UserPlus, bg: "bg-primary-fixed text-on-primary-fixed" }
  return { icon: Activity, bg: "bg-primary-fixed text-on-primary-fixed" }
}

const BED_STATUS = [
  { key: "occupied", label: "Occupied", color: "bg-primary-container" },
  { key: "available", label: "Available", color: "bg-success" },
  { key: "cleaning", label: "Cleaning", color: "bg-chart-3" },
  { key: "maintenance", label: "Maintenance", color: "bg-destructive" },
] as const

/* ── metric card ──────────────────────────────────────────────── */

function MetricCard({
  icon: Icon,
  iconClass,
  label,
  value,
  badge,
}: {
  icon: LucideIcon
  iconClass: string
  label: string
  value: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="group rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-all duration-200 hover:shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex items-start justify-between">
        <div className={cn("rounded-lg p-2", iconClass)}>
          <Icon aria-hidden className="size-5" strokeWidth={2} />
        </div>
        {badge}
      </div>
      <h3 className="mb-1 text-sm font-medium text-on-surface-variant">{label}</h3>
      <p className="text-[32px] font-semibold leading-10 tracking-tight text-on-surface">
        {value}
      </p>
    </div>
  )
}

function MetricCardSkeleton() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-4 flex items-start justify-between">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-4 w-28" />
      <Skeleton className="h-9 w-24" />
    </div>
  )
}

/* ── occupancy chart ──────────────────────────────────────────── */

function OccupancyChart({ report }: { report: OccupancyReport }) {
  const total = report.total_beds || 1
  const bars = BED_STATUS.map((status) => ({
    ...status,
    count: report[status.key] ?? 0,
    pct: Math.round(((report[status.key] ?? 0) / total) * 100),
  }))

  return (
    <div className="lg:col-span-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-on-surface">Bed Occupancy</h2>
        <Link
          href="/reports"
          className="text-sm font-medium text-primary-container hover:underline"
        >
          View Report
        </Link>
      </div>

      <div className="flex gap-3">
        {/* Y axis */}
        <div className="flex h-64 flex-col justify-between pb-2 text-right text-xs tabular-nums text-outline">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>

        {/* Plot area */}
        <div className="relative h-64 flex-1">
          {/* Gridlines */}
          <div
            aria-hidden
            className="absolute inset-0 flex flex-col justify-between border-b border-outline-variant"
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="border-t border-dashed border-outline-variant/60" />
            ))}
          </div>

          {/* Bars */}
          <div className="absolute inset-0 flex items-end gap-2">
            {bars.map((bar) => (
              <div key={bar.key} className="group relative h-full flex-1">
                <div
                  className={cn(
                    "relative w-full rounded-t-lg transition-all duration-300 group-hover:opacity-80",
                    bar.color,
                  )}
                  style={{ height: `${Math.max(bar.pct, bar.count > 0 ? 3 : 0)}%` }}
                >
                  {/* Tooltip */}
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 rounded bg-inverse-surface px-2 py-1 text-xs font-medium whitespace-nowrap text-inverse-on-surface opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {bar.count} · {bar.pct}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend / labels */}
      <div className="mt-3 flex justify-between gap-2">
        {bars.map((bar) => (
          <div key={bar.key} className="flex-1 text-center">
            <p className="text-sm font-medium text-on-surface-variant">{bar.label}</p>
            <p className="text-xs tabular-nums text-outline">
              {bar.count}/{report.total_beds}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── today's logs ─────────────────────────────────────────────── */

function LogsPanel({ logs }: { logs: AuditLogItem[] }) {
  return (
    <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <h2 className="mb-4 text-xl font-semibold text-on-surface">Today&apos;s Logs</h2>
      <div className="flex-1 space-y-4">
        {logs.length === 0 ? (
          <div className="py-8 text-center">
            <Activity aria-hidden className="mx-auto mb-2 size-6 text-outline" />
            <p className="text-sm text-on-surface-variant">No recent activity.</p>
          </div>
        ) : (
          logs.map((log) => {
            const { icon: Icon, bg } = logStyle(log.module)
            return (
              <div
                key={log.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-surface-container-low"
              >
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    bg,
                  )}
                >
                  <Icon aria-hidden className="size-4" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-on-surface">
                    {log.description ?? humanizeAction(log.action)}
                  </p>
                  <p className="text-xs text-outline">
                    {log.module} •{" "}
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
      <Link
        href="/audit-logs"
        className="mt-4 w-full text-center text-sm font-medium text-primary-container hover:underline"
      >
        View All Logs
      </Link>
    </div>
  )
}

/* ── main view ────────────────────────────────────────────────── */

export function DashboardView() {
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
  })
  const occupancyQuery = useQuery({
    queryKey: ["dashboard-occupancy"],
    queryFn: getOccupancyReport,
  })
  const logsQuery = useQuery({
    queryKey: ["dashboard-logs"],
    queryFn: () => getAuditLogs(6),
  })

  const failed = [summaryQuery, occupancyQuery, logsQuery].find((q) => q.isError)

  if (failed) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
        <Wrench aria-hidden className="mx-auto mb-3 size-8 text-outline" />
        <h2 className="mb-1 text-xl font-semibold text-on-surface">
          Couldn&apos;t load the dashboard
        </h2>
        <p className="mb-4 text-sm text-on-surface-variant">
          Make sure the backend server is running, then try again.
        </p>
        <button
          type="button"
          onClick={() => {
            summaryQuery.refetch()
            occupancyQuery.refetch()
            logsQuery.refetch()
          }}
          className="rounded-lg bg-primary-container px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-container/90"
        >
          Try again
        </button>
      </div>
    )
  }

  const summary = summaryQuery.data
  const occupancy = occupancyQuery.data
  const logs = logsQuery.data?.items ?? []

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="mb-1 text-[32px] font-semibold leading-10 tracking-tight text-on-surface">
          Dashboard Overview
        </h1>
        <p className="text-sm text-on-surface-variant">
          Welcome back. Here&apos;s what&apos;s happening today.
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {summary ? (
          <>
            <MetricCard
              icon={DoorOpen}
              iconClass="bg-primary-fixed text-on-primary-fixed"
              label="Total Occupancy"
              value={`${Math.round(summary.occupancy_rate)}%`}
              badge={
                <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-1 text-xs font-semibold text-success">
                  <TrendingUp aria-hidden className="size-3.5" />
                  Live
                </span>
              }
            />
            <MetricCard
              icon={BedDouble}
              iconClass="bg-secondary-fixed text-on-secondary-fixed"
              label="Room Availability"
              value={
                <>
                  {summary.available_beds}{" "}
                  <span className="text-xl font-semibold text-on-surface-variant">Beds</span>
                </>
              }
            />
            <MetricCard
              icon={Wrench}
              iconClass="bg-error-container text-on-error-container"
              label="Open Maintenance"
              value={
                <>
                  {summary.open_tickets}{" "}
                  <span className="text-xl font-semibold text-on-surface-variant">Tickets</span>
                </>
              }
              badge={
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
                    summary.open_tickets > 0
                      ? "bg-error-container text-error"
                      : "bg-surface-container-low text-on-surface-variant",
                  )}
                >
                  {summary.open_tickets > 0 ? "Urgent" : "None"}
                </span>
              }
            />
            <MetricCard
              icon={Wallet}
              iconClass="bg-surface-variant text-on-surface-variant"
              label="Pending Dues"
              value={formatCurrency(summary.outstanding_balance)}
            />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {occupancy ? (
          <OccupancyChart report={occupancy} />
        ) : (
          <div className="lg:col-span-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
            <Skeleton className="mb-6 h-6 w-40" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {logsQuery.isLoading || logsQuery.isPending ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
            <Skeleton className="mb-4 h-6 w-32" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-2">
                  <Skeleton className="size-8 rounded-full" />
                  <div className="flex-1 space-y-1.5 pt-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <LogsPanel logs={logs} />
        )}
      </div>
    </div>
  )
}
