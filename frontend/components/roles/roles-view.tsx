"use client"

import { useMemo, useState, type SubmitEvent } from "react"
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query"
import { KeyRound, Lock, Pencil, Plus, Search, ShieldCheck, ShieldOff, Trash2, UserCog } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
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
import { ConfirmDialog } from "@/components/hostel/confirm-dialog"
import { StatusBadge } from "@/components/hostel/status-badge"
import { RoleBadge, formatRoleName } from "@/components/users/user-badges"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, deleteRole, getRoles, getUsers } from "@/lib/api"
import type { Role } from "@/lib/types"

import { RoleFormDialog } from "@/components/roles/role-form-dialog"
import { ManagePermissionsDialog } from "@/components/roles/manage-permissions-dialog"

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof ShieldCheck
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

type TypeFilter = "all" | "system" | "custom"
type StatusFilterValue = "all" | "active" | "inactive"
type FormDialogState = { mode: "create" } | { mode: "edit"; role: Role } | null

export function RolesView() {
  const queryClient = useQueryClient()
  const { has } = usePermissions()

  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all")
  const [formDialog, setFormDialog] = useState<FormDialogState>(null)
  const [managingRole, setManagingRole] = useState<Role | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canView = has("roles.view") || has("roles.manage")
  const canManage = has("roles.manage")
  const canViewUserCounts = has("users.view")

  // Unfiltered — keeps the stat cards showing true totals even while a search
  // term is applied to the table below.
  const statsQuery = useQuery({
    queryKey: ["roles", { include_inactive: true }],
    queryFn: () => getRoles({ include_inactive: true }),
    enabled: canView,
  })

  const rolesQuery = useQuery({
    queryKey: ["roles", { include_inactive: true, search }],
    queryFn: () => getRoles({ include_inactive: true, search: search || undefined }),
    enabled: canView,
  })

  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])
  const statsRoles = useMemo(() => statsQuery.data ?? [], [statsQuery.data])

  const filteredRoles = useMemo(() => {
    return roles.filter((role) => {
      if (typeFilter === "system" && !role.is_system_role) return false
      if (typeFilter === "custom" && role.is_system_role) return false
      if (statusFilter === "active" && !role.is_active) return false
      if (statusFilter === "inactive" && role.is_active) return false
      return true
    })
  }, [roles, typeFilter, statusFilter])

  const totalRoles = statsRoles.length
  const systemRoleCount = statsRoles.filter((role) => role.is_system_role).length
  const customRoleCount = totalRoles - systemRoleCount

  function submitSearch(e: SubmitEvent) {
    e.preventDefault()
    setSearch(searchInput.trim())
  }

  const userCountQueries = useQueries({
    queries: filteredRoles.map((role) => ({
      queryKey: ["users-stat", "by-role", role.id],
      queryFn: () => getUsers({ role_id: role.id, per_page: 1 }),
      enabled: canView && canViewUserCounts,
    })),
  })

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteRole(deleteTarget.id)
      toast.success(`${deleteTarget.name} was deleted.`)
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      setDeleteTarget(null)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("roles.manage")
          toast.error(err.message)
        } else if (err.code === "role_in_use") {
          toast.error("Cannot delete a role assigned to users. Deactivate it instead.")
        } else {
          toast.error(err.message)
        }
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setDeleting(false)
    }
  }

  const forbidden = rolesQuery.error instanceof ApiError && rolesQuery.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "User Management" }, { label: "Roles" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Roles
            </h1>
            <p className="mt-1 text-sm leading-5 text-on-surface-variant">
              Manage roles and their permissions.
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              onClick={() => setFormDialog({ mode: "create" })}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-4.5" />
              Add Role
            </Button>
          )}
        </div>
      </div>

      {canView && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={ShieldCheck}
            iconClassName="bg-primary/10 text-primary"
            label="Total Roles"
            value={statsQuery.data ? totalRoles : undefined}
          />
          <StatCard
            icon={Lock}
            iconClassName="bg-surface-container-high text-on-surface-variant"
            label="System Roles"
            value={statsQuery.data ? systemRoleCount : undefined}
          />
          <StatCard
            icon={UserCog}
            iconClassName="bg-emerald-100 text-emerald-700"
            label="Custom Roles"
            value={statsQuery.data ? customRoleCount : undefined}
          />
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
                  if (value.trim() === "") setSearch("")
                }}
                placeholder="Search by name or description"
                aria-label="Search roles"
                className="h-10 rounded-lg pl-10 text-sm"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
              Search
            </Button>
          </form>

          <Select value={typeFilter} onValueChange={(value) => value && setTypeFilter(value as TypeFilter)}>
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44">
              <SelectValue placeholder="Type: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Type: All</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(value) => value && setStatusFilter(value as StatusFilterValue)}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          {forbidden ? (
            <div className="p-4">
              <EmptyState
                icon={ShieldOff}
                title="You don't have access to Roles"
                description="Ask an administrator to grant you the roles.view permission."
              />
            </div>
          ) : rolesQuery.isError ? (
            <div className="p-4">
              <ErrorState message={(rolesQuery.error as Error).message} onRetry={() => rolesQuery.refetch()} />
            </div>
          ) : rolesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredRoles.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ShieldCheck}
                title="No roles found"
                description={
                  search || typeFilter !== "all" || statusFilter !== "all"
                    ? "No roles match your filters."
                    : "No roles yet."
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full border-collapse text-left">
                <TableHeader>
                  <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Role
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Type
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Status
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Assigned Users
                    </TableHead>
                    <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-outline-variant">
                  {filteredRoles.map((role, index) => {
                    const isSuperAdmin = role.name === "super_admin"
                    const userCountQuery = userCountQueries[index]
                    const canEdit = canManage && !isSuperAdmin
                    const canDelete = canManage && !role.is_system_role

                    return (
                      <TableRow
                        key={role.id}
                        className="border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                      >
                        <TableCell className="px-6 py-4">
                          <RoleBadge role={role} fallbackLabel="—" />
                          {role.description && (
                            <p className="mt-1 max-w-xs truncate text-xs text-on-surface-variant">
                              {role.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <StatusBadge
                            status={role.is_system_role ? "system" : "custom"}
                            tone={role.is_system_role ? "info" : "neutral"}
                            label={role.is_system_role ? "System" : "Custom"}
                          />
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <StatusBadge
                            status={role.is_active ? "active" : "inactive"}
                            tone={role.is_active ? "success" : "neutral"}
                          />
                        </TableCell>
                        <TableCell className="px-6 py-4 text-sm text-on-surface-variant">
                          {canViewUserCounts
                            ? (userCountQuery?.data?.total ?? (userCountQuery?.isLoading ? "…" : "—"))
                            : "—"}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                          {canManage && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Manage permissions for ${formatRoleName(role.name)}`}
                                onClick={() => setManagingRole(role)}
                                className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                              >
                                <KeyRound aria-hidden className="size-4" />
                              </Button>
                              {canEdit && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={`Edit ${formatRoleName(role.name)}`}
                                  onClick={() => setFormDialog({ mode: "edit", role })}
                                  className="rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-primary"
                                >
                                  <Pencil aria-hidden className="size-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="icon-sm"
                                  aria-label={`Delete ${formatRoleName(role.name)}`}
                                  onClick={() => setDeleteTarget(role)}
                                  className="rounded-full"
                                >
                                  <Trash2 aria-hidden className="size-4" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      <RoleFormDialog
        open={!!formDialog}
        onOpenChange={(open) => !open && setFormDialog(null)}
        role={formDialog?.mode === "edit" ? formDialog.role : undefined}
      />

      <ManagePermissionsDialog
        open={!!managingRole}
        onOpenChange={(open) => !open && setManagingRole(null)}
        role={managingRole}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this role?"
        description={`${deleteTarget ? deleteTarget.name : "This role"} will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  )
}
