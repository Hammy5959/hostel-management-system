"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Briefcase, Pencil, Plus, Search, ShieldOff, UserCheck, UserCog } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
import { StatusBadge } from "@/components/hostel/status-badge"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, getStaffList, updateStaff } from "@/lib/api"
import type { Staff, StaffList } from "@/lib/types"
import { initials } from "@/components/users/user-badges"

import { StaffFormDialog } from "@/components/staff/staff-form-dialog"

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof UserCog
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

/** Pure date field (joining_date) — timeZone: "UTC" avoids an off-by-one-day
 * display, same convention as admissions-view.tsx's formatDate. No shared
 * date utility exists in this codebase to import instead. */
function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

type FormDialogState = { mode: "add" } | { mode: "edit"; staff: Staff } | null

export function StaffView() {
  const queryClient = useQueryClient()
  const { has } = usePermissions()

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [departmentFilter, setDepartmentFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [formDialog, setFormDialog] = useState<FormDialogState>(null)

  const canView = has("staff.view")
  const canCreate = has("staff.create")
  const canUpdate = has("staff.update")

  const totalQuery = useQuery({
    queryKey: ["staff-stat", "total"],
    queryFn: () => getStaffList({ per_page: 1 }),
    enabled: canView,
  })
  const activeQuery = useQuery({
    queryKey: ["staff-stat", "active"],
    queryFn: () => getStaffList({ per_page: 1, is_active: true }),
    enabled: canView,
  })
  // Capped at per_page: 100 (the backend max) — GET /staff has no department
  // groupby, so the breakdown and the filter dropdown's options are both
  // computed from this single unfiltered page. Exact as long as total staff
  // <= 100; see the plan's flagged limitation for hostels that exceed it.
  const departmentsQuery = useQuery({
    queryKey: ["staff-stat", "departments"],
    queryFn: () => getStaffList({ per_page: 100 }),
    enabled: canView,
  })

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of departmentsQuery.data?.items ?? []) {
      if (!s.department) continue
      counts.set(s.department, (counts.get(s.department) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [departmentsQuery.data])

  const query = useQuery({
    queryKey: ["staff", { page, perPage, search, departmentFilter, statusFilter }],
    queryFn: () =>
      getStaffList({
        page,
        per_page: perPage,
        search: search || undefined,
        department: departmentFilter === "all" ? undefined : departmentFilter,
        is_active: statusFilter === "all" ? undefined : statusFilter === "active",
      }),
    enabled: canView,
  })

  function submitSearch(e: SubmitEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => updateStaff(id, { is_active }),
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["staff"] })
      const previous = queryClient.getQueriesData<StaffList>({ queryKey: ["staff"] })
      queryClient.setQueriesData<StaffList>({ queryKey: ["staff"] }, (old) =>
        old ? { ...old, items: old.items.map((s) => (s.id === id ? { ...s, is_active } : s)) } : old,
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("staff.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["staff"] })
      queryClient.invalidateQueries({ queryKey: ["staff-stat"] })
    },
  })

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "User Management" }, { label: "Staff" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">Staff</h1>
            <p className="mt-1 text-sm leading-5 text-on-surface-variant">
              Manage staff records and employment details.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setFormDialog({ mode: "add" })}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-4.5" />
              Add Staff
            </Button>
          )}
        </div>
      </div>

      {canView && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={UserCog}
            iconClassName="bg-primary/10 text-primary"
            label="Total Staff"
            value={totalQuery.data?.total}
          />
          <StatCard
            icon={UserCheck}
            iconClassName="bg-emerald-100 text-emerald-700"
            label="Active Staff"
            value={activeQuery.data?.total}
          />
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-on-surface-variant">By Department</h3>
              <div className="flex size-10 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Briefcase aria-hidden className="size-5" />
              </div>
            </div>
            {departmentsQuery.isLoading ? (
              <Skeleton className="h-10 w-20" />
            ) : departmentCounts.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No departments yet</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {departmentCounts.map(([dept, count]) => (
                  <span
                    key={dept}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant"
                  >
                    {dept}
                    <span className="font-semibold text-on-surface">{count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-6">
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
                    setPage(1)
                    setSearch("")
                  }
                }}
                placeholder="Search by employee number or designation"
                aria-label="Search by employee number or designation"
                className="h-10 rounded-lg pl-10 text-sm"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <Select
              value={departmentFilter}
              onValueChange={(value) => {
                if (!value) return
                setDepartmentFilter(value)
                setPage(1)
              }}
            >
              <SelectTrigger
                className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44"
                aria-label="Filter by department"
              >
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departmentCounts.map(([dept]) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (!value) return
                setStatusFilter(value as "all" | "active" | "inactive")
                setPage(1)
              }}
            >
              <SelectTrigger
                className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-40"
                aria-label="Filter by status"
              >
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          {forbidden ? (
            <div className="p-4">
              <EmptyState
                icon={ShieldOff}
                title="You don't have access to Staff"
                description="Ask an administrator to grant you the staff.view permission."
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
          ) : query.data && query.data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={UserCog}
                title="No staff yet"
                description={
                  search || departmentFilter !== "all" || statusFilter !== "all"
                    ? "No staff match your filters."
                    : "Add your first staff record to get started."
                }
                action={canCreate ? { label: "Add Staff", onClick: () => setFormDialog({ mode: "add" }) } : undefined}
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
                          Staff
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Employee No
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Designation
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Department
                        </TableHead>
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Joining Date
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
                      {query.data.items.map((staff) => {
                        const name = staff.user
                          ? [staff.user.first_name, staff.user.last_name].filter(Boolean).join(" ")
                          : "Unlinked user"
                        return (
                          <TableRow
                            key={staff.id}
                            className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                          >
                            <TableCell className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="size-10 border border-outline-variant">
                                  <AvatarImage src={staff.user?.profile_picture_url ?? undefined} alt={name} />
                                  <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
                                    {staff.user ? initials(staff.user.first_name, staff.user.last_name) : "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-semibold text-on-surface">{name}</p>
                                  {staff.user?.email && (
                                    <p className="text-xs text-on-surface-variant">{staff.user.email}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                              {staff.employee_number ?? "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                              {staff.designation ?? "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              {staff.department ? <Badge variant="outline">{staff.department}</Badge> : "—"}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                              {formatDate(staff.joining_date)}
                            </TableCell>
                            <TableCell className="px-6 py-4">
                              <StatusBadge
                                status={staff.is_active ? "active" : "inactive"}
                                tone={staff.is_active ? "success" : "neutral"}
                              />
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              {canUpdate && (
                                <div className="flex items-center justify-end gap-2">
                                  <Switch
                                    checked={staff.is_active}
                                    disabled={toggleActive.isPending}
                                    onCheckedChange={(checked) =>
                                      toggleActive.mutate({ id: staff.id, is_active: checked })
                                    }
                                    aria-label={`Toggle active status for ${name}`}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Edit ${name}`}
                                    onClick={() => setFormDialog({ mode: "edit", staff })}
                                    className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                                  >
                                    <Pencil aria-hidden className="size-4" />
                                  </Button>
                                </div>
                              )}
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
      </div>

      <StaffFormDialog
        open={!!formDialog}
        onOpenChange={(open) => !open && setFormDialog(null)}
        staff={formDialog?.mode === "edit" ? formDialog.staff : undefined}
      />
    </div>
  )
}
