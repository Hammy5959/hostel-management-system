"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import {
  BadgeCheck,
  CalendarDays,
  DoorOpen,
  Megaphone,
  MessageSquareWarning,
  UserPlus,
  UserRound,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { useMyResident } from "@/components/portal/resident-provider"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { initials } from "@/components/users/user-badges"
import { cn, formatCurrency, todayLocalDate } from "@/lib/utils"
import {
  getAllocations,
  getAttendance,
  getInvoices,
  getMessMenus,
  getMyRoommates,
  getNotices,
} from "@/lib/api"
import type { Allocation, AllocationList } from "@/lib/types"

const PENDING_INVOICE_STATUSES = new Set(["issued", "partially_paid", "overdue"])

function startOfMonthLocalDate(): string {
  return `${todayLocalDate().slice(0, 7)}-01`
}

function formatNoticeDate(value: string | null): string {
  if (!value) return ""
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/* ── shared overview-card shell (mirrors the staff Dashboard's MetricCard) ─ */

function OverviewCard({
  icon: Icon,
  iconClass,
  label,
  badge,
  children,
}: {
  icon: LucideIcon
  iconClass: string
  label: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between">
        <div className={cn("rounded-lg p-2", iconClass)}>
          <Icon aria-hidden className="size-5" strokeWidth={2} />
        </div>
        {badge}
      </div>
      <h3 className="mb-2 text-sm font-medium text-on-surface-variant">{label}</h3>
      {children}
    </div>
  )
}

function OverviewCardSkeleton() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <Skeleton className="mb-4 size-9 rounded-lg" />
      <Skeleton className="mb-2 h-4 w-24" />
      <Skeleton className="h-7 w-32" />
    </div>
  )
}

function Pill({ tone, children }: { tone: "success" | "warning"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold",
        tone === "success" ? "bg-success-bg text-success" : "bg-error-container text-error",
      )}
    >
      {children}
    </span>
  )
}

/* ── My Room ──────────────────────────────────────────────────────────── */

function useMyAllocation(): UseQueryResult<AllocationList> {
  return useQuery({
    queryKey: ["my-allocation"],
    queryFn: () => getAllocations({ active_only: true, per_page: 1 }),
  })
}

function RoomCard({ query }: { query: UseQueryResult<AllocationList> }) {
  if (query.isLoading) return <OverviewCardSkeleton />
  if (query.isError) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const allocation = query.data?.items[0]

  return (
    <OverviewCard icon={DoorOpen} iconClass="bg-primary-fixed text-on-primary-fixed" label="My Room">
      {allocation ? (
        <>
          <p className="text-2xl font-semibold tracking-tight text-on-surface">
            Room {allocation.room?.room_number ?? "—"}
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Bed {allocation.bed?.bed_number ?? "—"}
            {allocation.room?.floor_name ? ` · ${allocation.room.floor_name}` : ""}
          </p>
          {allocation.room?.building_name && (
            <p className="text-xs text-on-surface-variant">{allocation.room.building_name}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-on-surface-variant">No room allocated yet.</p>
      )}
    </OverviewCard>
  )
}

/* ── Pending Dues ─────────────────────────────────────────────────────── */

function DuesCard() {
  const query = useQuery({ queryKey: ["my-invoices"], queryFn: () => getInvoices({}) })

  if (query.isLoading) return <OverviewCardSkeleton />
  if (query.isError) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const total = (query.data?.items ?? []).reduce(
    (sum, inv) => (PENDING_INVOICE_STATUSES.has(inv.status) ? sum + Number(inv.balance) : sum),
    0,
  )

  return (
    <OverviewCard
      icon={Wallet}
      iconClass="bg-surface-variant text-on-surface-variant"
      label="Pending Dues"
      badge={<Pill tone={total > 0 ? "warning" : "success"}>{total > 0 ? "Due" : "All clear"}</Pill>}
    >
      <p className="text-2xl font-semibold tracking-tight text-on-surface">
        {total > 0 ? formatCurrency(total) : "No dues"}
      </p>
    </OverviewCard>
  )
}

/* ── Attendance ───────────────────────────────────────────────────────── */

function AttendanceCard() {
  const dateFrom = startOfMonthLocalDate()
  const dateTo = todayLocalDate()

  const totalQuery = useQuery({
    queryKey: ["my-attendance-total", dateFrom, dateTo],
    queryFn: () => getAttendance({ date_from: dateFrom, date_to: dateTo, per_page: 1 }),
  })
  const presentQuery = useQuery({
    queryKey: ["my-attendance-present", dateFrom, dateTo],
    queryFn: () => getAttendance({ date_from: dateFrom, date_to: dateTo, status: "present", per_page: 1 }),
  })

  if (totalQuery.isLoading || presentQuery.isLoading) return <OverviewCardSkeleton />
  if (totalQuery.isError || presentQuery.isError) {
    const failed = totalQuery.isError ? totalQuery : presentQuery
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <ErrorState message={(failed.error as Error).message} onRetry={() => failed.refetch()} />
      </div>
    )
  }

  const total = totalQuery.data?.total ?? 0
  const present = presentQuery.data?.total ?? 0

  return (
    <OverviewCard
      icon={BadgeCheck}
      iconClass="bg-secondary-fixed text-on-secondary-fixed"
      label="Attendance This Month"
    >
      {total > 0 ? (
        <>
          <p className="text-2xl font-semibold tracking-tight text-on-surface">
            {Math.round((present / total) * 100)}%
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {present} of {total} marked days
          </p>
        </>
      ) : (
        <p className="text-sm text-on-surface-variant">No attendance marked yet this month.</p>
      )}
    </OverviewCard>
  )
}

/* ── Today's Mess Menu ────────────────────────────────────────────────── */

function MessMenuCard() {
  const today = todayLocalDate()
  const query = useQuery({
    queryKey: ["my-mess-menu-today", today],
    queryFn: () => getMessMenus({ date_from: today, date_to: today }),
  })

  if (query.isLoading) return <OverviewCardSkeleton />
  if (query.isError) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      </div>
    )
  }

  const menu = query.data?.items[0]

  return (
    <OverviewCard icon={UtensilsCrossed} iconClass="bg-error-container text-on-error-container" label="Today's Mess Menu">
      {menu ? (
        <div className="space-y-0.5 text-sm text-on-surface">
          <p className="truncate">
            <span className="text-on-surface-variant">Breakfast: </span>
            {menu.breakfast ?? "—"}
          </p>
          <p className="truncate">
            <span className="text-on-surface-variant">Lunch: </span>
            {menu.lunch ?? "—"}
          </p>
          <p className="truncate">
            <span className="text-on-surface-variant">Dinner: </span>
            {menu.dinner ?? "—"}
          </p>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No menu posted.</p>
      )}
    </OverviewCard>
  )
}

/* ── Quick Actions ────────────────────────────────────────────────────── */

function QuickActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-left transition-colors hover:bg-surface-container-high hover:cursor-pointer"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container">
        <Icon aria-hidden className="size-4.5" strokeWidth={1.75} />
      </div>
      <span className="text-sm font-medium text-on-surface">{label}</span>
    </button>
  )
}

function QuickActions() {
  const router = useRouter()

  const actions: { icon: LucideIcon; label: string; href: string }[] = [
    { icon: CalendarDays, label: "Request Leave", href: "/portal/requests?tab=leave" },
    { icon: BadgeCheck, label: "Request Gate Pass", href: "/portal/requests?tab=gate-passes" },
    { icon: MessageSquareWarning, label: "File Complaint", href: "/portal/requests?tab=complaints" },
    { icon: UserPlus, label: "Register Visitor", href: "/portal/requests?tab=visitors" },
  ]

  return (
    <div>
      <h2 className="mb-4 text-xl font-semibold text-on-surface">Quick Actions</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <QuickActionButton
            key={action.href}
            icon={action.icon}
            label={action.label}
            onClick={() => router.push(action.href)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Latest Notices ───────────────────────────────────────────────────── */

function NoticesCard() {
  const query = useQuery({
    queryKey: ["portal-notices"],
    queryFn: () => getNotices({ published_only: true, per_page: 3 }),
  })

  return (
    <div className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-6 lg:col-span-2">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-on-surface">Latest Notices</h2>
        <Link href="/notices" className="text-sm font-medium text-primary-container hover:underline">
          View all
        </Link>
      </div>

      {query.isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <div className="py-6 text-center">
          <Megaphone aria-hidden className="mx-auto mb-2 size-6 text-outline" />
          <p className="text-sm text-on-surface-variant">No notices right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {query.data!.items.map((notice) => (
            <div key={notice.id} className="border-b border-outline-variant pb-3 last:border-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-on-surface">{notice.title}</p>
                <span className="shrink-0 text-xs text-outline">{formatNoticeDate(notice.published_at)}</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-on-surface-variant">{notice.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Roommates ────────────────────────────────────────────────────────── */

function RoommatesPanel({ hasAllocation }: { hasAllocation: boolean | undefined }) {
  const query = useQuery({ queryKey: ["my-roommates"], queryFn: getMyRoommates })

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
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
            {hasAllocation === false ? "No room allocated yet." : "No roommates yet — you have this room to yourself."}
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

/* ── main view ────────────────────────────────────────────────────────── */

export function PortalHomeView() {
  const { resident, isLoading, error, refetch } = useMyResident()
  const allocationQuery = useMyAllocation()

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  if (error) {
    return <ErrorState message="Something went wrong loading your profile." onRetry={refetch} />
  }

  if (!resident) {
    return (
      <EmptyState
        icon={UserRound}
        title="No resident profile linked"
        description="Contact the hostel office to link your account."
      />
    )
  }

  const allocation: Allocation | undefined = allocationQuery.data?.items[0]
  const roomSubtitle =
    allocation?.room?.room_number
      ? `Room ${allocation.room.room_number}${allocation.room.building_name ? ` · ${allocation.room.building_name}` : ""}`
      : undefined

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
          Welcome, {resident.first_name}
        </h1>
        {roomSubtitle && <p className="text-sm text-on-surface-variant">{roomSubtitle}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <RoomCard query={allocationQuery} />
        <DuesCard />
        <AttendanceCard />
        <MessMenuCard />
      </div>

      <QuickActions />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <NoticesCard />
        <RoommatesPanel
          hasAllocation={allocationQuery.isLoading ? undefined : (allocationQuery.data?.items.length ?? 0) > 0}
        />
      </div>
    </div>
  )
}
