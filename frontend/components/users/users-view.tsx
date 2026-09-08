"use client"

import { useState, type SubmitEvent } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil, Plus, Search, ShieldOff, Trash2, UserCheck, UserCog, Users as UsersIcon, UserX } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { StatusBadge } from "@/components/hostel/status-badge"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { getStoredUser } from "@/lib/auth"
import { ApiError, deleteUser, getRoles, getUsers, setUserStatus } from "@/lib/api"
import type { User, UserList } from "@/lib/types"

import { UserFormDialog } from "@/components/users/user-form-dialog"
import { RoleBadge, USER_STATUS_TONE, formatLastLogin, formatRoleName, initials } from "@/components/users/user-badges"

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof UsersIcon
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

export function UsersView() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { has } = usePermissions()
  const me = getStoredUser()

  const [tab, setTab] = useState<"all" | "archived">("all")
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [roleFilter, setRoleFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "suspended">("all")
  const [addOpen, setAddOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<User | null>(null)
  const [archiving, setArchiving] = useState(false)

  const canView = has("users.view")
  const canCreate = has("users.create")
  const canUpdate = has("users.update")

  const rolesQuery = useQuery({
    queryKey: ["roles", { include_inactive: false }],
    queryFn: () => getRoles({ include_inactive: false }),
    enabled: canView,
  })

  const totalQuery = useQuery({
    queryKey: ["users-stat", "total"],
    queryFn: () => getUsers({ per_page: 1 }),
    enabled: canView,
  })
  const activeQuery = useQuery({
    queryKey: ["users-stat", "active"],
    queryFn: () => getUsers({ status: "active", per_page: 1 }),
    enabled: canView,
  })
  const inactiveQuery = useQuery({
    queryKey: ["users-stat", "inactive"],
    queryFn: () => getUsers({ status: "inactive", per_page: 1 }),
    enabled: canView,
  })
  const suspendedQuery = useQuery({
    queryKey: ["users-stat", "suspended"],
    queryFn: () => getUsers({ status: "suspended", per_page: 1 }),
    enabled: canView,
  })

  const query = useQuery({
    queryKey: ["users", { page, perPage, search, roleFilter, statusFilter, tab }],
    queryFn: () =>
      getUsers({
        page,
        per_page: perPage,
        search: search || undefined,
        role_id: roleFilter === "all" ? undefined : roleFilter,
        status: tab === "archived" ? "deleted" : statusFilter === "all" ? undefined : statusFilter,
      }),
    enabled: canView,
  })

  function submitSearch(e: SubmitEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function changeTab(value: string) {
    if (value !== "all" && value !== "archived") return
    setTab(value)
    setPage(1)
  }

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "inactive" }) =>
      setUserStatus(id, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["users"] })
      const previous = queryClient.getQueriesData<UserList>({ queryKey: ["users"] })
      queryClient.setQueriesData<UserList>({ queryKey: ["users"] }, (old) =>
        old ? { ...old, items: old.items.map((u) => (u.id === id ? { ...u, status } : u)) } : old,
      )
      return { previous }
    },
    onError: (err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("users.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-stat"] })
    },
  })

  async function confirmArchive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await deleteUser(archiveTarget.id)
      toast.success(`${archiveTarget.first_name} was archived.`)
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-stat"] })
      setArchiveTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("users.update")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setArchiving(false)
    }
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "User Management" }, { label: "Users" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Users
            </h1>
            <p className="mt-1 text-sm leading-5 text-on-surface-variant">
              Manage user accounts and their roles.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setAddOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-4.5" />
              Add User
            </Button>
          )}
        </div>
      </div>

      {canView && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={UsersIcon}
            iconClassName="bg-primary/10 text-primary"
            label="Total Users"
            value={totalQuery.data?.total}
          />
          <StatCard
            icon={UserCheck}
            iconClassName="bg-emerald-100 text-emerald-700"
            label="Active"
            value={activeQuery.data?.total}
          />
          <StatCard
            icon={UserCog}
            iconClassName="bg-surface-container-high text-on-surface-variant"
            label="Inactive"
            value={inactiveQuery.data?.total}
          />
          <StatCard
            icon={UserX}
            iconClassName="bg-error-container text-on-error-container"
            label="Suspended"
            value={suspendedQuery.data?.total}
          />
        </div>
      )}

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="all"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              All Users
            </TabsTrigger>
            <TabsTrigger
              value="archived"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Archived
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={tab} className="space-y-6 pt-6">
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
                  placeholder="Search by name or email"
                  aria-label="Search by name or email"
                  className="h-10 rounded-lg pl-10 text-sm"
                />
              </div>
              <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
                Search
              </Button>
            </form>

            <div className="flex items-center gap-3">
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  if (!value) return
                  setRoleFilter(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-lg sm:w-40" aria-label="Filter by role">
                  <SelectValue>
                    {(value: string) =>
                      value === "all"
                        ? "All Roles"
                        : (formatRoleName(rolesQuery.data?.find((role) => role.id === value)?.name ?? "") || "All Roles")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {rolesQuery.data?.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {formatRoleName(role.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tab === "all" && (
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    if (!value) return
                    setStatusFilter(value as "all" | "active" | "inactive" | "suspended")
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-10 w-full rounded-lg sm:w-40" aria-label="Filter by status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            {forbidden ? (
              <div className="p-4">
                <EmptyState
                  icon={ShieldOff}
                  title="You don't have access to Users"
                  description="Ask an administrator to grant you the users.view permission."
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
                  icon={UsersIcon}
                  title={tab === "archived" ? "No archived users" : "No users yet"}
                  description={
                    search
                      ? "No users match your search."
                      : tab === "archived"
                        ? "Archived (deleted) users will show up here."
                        : "Add your first user to get started."
                  }
                  action={tab === "all" && canCreate ? { label: "Add User", onClick: () => setAddOpen(true) } : undefined}
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
                            User
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Role
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Status
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Last Login
                          </TableHead>
                          <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-outline-variant">
                        {query.data.items.map((user) => {
                          const isSelf = !!me && user.id === me.id
                          const name = `${user.first_name} ${user.last_name ?? ""}`.trim()
                          return (
                            <TableRow
                              key={user.id}
                              className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                            >
                              <TableCell className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <Avatar className="size-10 border border-outline-variant">
                                    <AvatarImage src={user.profile_picture_url ?? undefined} alt={name} />
                                    <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
                                      {initials(user.first_name, user.last_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-semibold text-on-surface">{name}</p>
                                    <p className="text-xs text-on-surface-variant">{user.email}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <RoleBadge
                                  role={rolesQuery.data?.find((role) => role.id === user.role_id)}
                                  fallbackLabel="—"
                                />
                              </TableCell>
                              <TableCell className="px-6 py-4">
                                <StatusBadge status={user.status} tone={USER_STATUS_TONE[user.status]} />
                              </TableCell>
                              <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                                {formatLastLogin(user.last_login_at)}
                              </TableCell>
                              <TableCell className="px-6 py-4 text-right">
                                {isSelf ? (
                                  <span className="text-xs font-medium text-on-surface-variant">Current User</span>
                                ) : (
                                  canUpdate && (
                                    <div className="flex items-center justify-end gap-2">
                                      <Switch
                                        checked={user.status === "active"}
                                        disabled={toggleStatus.isPending}
                                        onCheckedChange={(checked) =>
                                          toggleStatus.mutate({ id: user.id, status: checked ? "active" : "inactive" })
                                        }
                                        aria-label={`Toggle active status for ${name}`}
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Edit ${name}`}
                                        onClick={() => router.push(`/users/${user.id}`)}
                                        className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                                      >
                                        <Pencil aria-hidden className="size-4" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        size="icon-sm"
                                        aria-label={`Archive ${name}`}
                                        onClick={() => setArchiveTarget(user)}
                                        className="rounded-full"
                                      >
                                        <Trash2 aria-hidden className="size-4" />
                                      </Button>
                                    </div>
                                  )
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
        </TabsContent>
      </Tabs>

      <UserFormDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archive this user?"
        description={`${archiveTarget ? `${archiveTarget.first_name} ${archiveTarget.last_name ?? ""}`.trim() : "This user"} will be archived and blocked from signing in. This can be undone by an administrator later.`}
        confirmLabel="Archive"
        destructive
        loading={archiving}
        onConfirm={confirmArchive}
      />
    </div>
  )
}
