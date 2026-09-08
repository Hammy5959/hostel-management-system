"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorState } from "@/components/hostel/error-state"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, getPermissions, getRole, updateRolePermissions } from "@/lib/api"
import { formatRoleName } from "@/components/users/user-badges"
import type { Permission, Role } from "@/lib/types"

export function ManagePermissionsDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Role | null
}) {
  const queryClient = useQueryClient()
  const isSuperAdmin = role?.name === "super_admin"

  const catalogQuery = useQuery({
    queryKey: ["permissions"],
    queryFn: () => getPermissions(),
    enabled: open && !!role,
  })
  const roleDetailQuery = useQuery({
    queryKey: ["role", role?.id],
    queryFn: () => getRole(role!.id),
    enabled: open && !!role && !isSuperAdmin,
  })

  // The role's current permission set, resolved via the catalog (name -> id).
  // Not local state — it's derived fresh from the two queries so there's no
  // effect needed to "seed" anything.
  const initialSelectedIds = useMemo(() => {
    if (!catalogQuery.data || !roleDetailQuery.data) return null
    const nameToId = new Map(catalogQuery.data.map((permission) => [permission.name, permission.id]))
    return new Set(
      roleDetailQuery.data.permissions
        .map((name) => nameToId.get(name))
        .filter((id): id is string => !!id),
    )
  }, [catalogQuery.data, roleDetailQuery.data])

  // Only the checkboxes the viewer has actually touched this session — every
  // other permission falls back to initialSelectedIds. Reset on close.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [saving, setSaving] = useState(false)

  function isChecked(id: string): boolean {
    if (isSuperAdmin) return true
    if (overrides.has(id)) return overrides.get(id)!
    return initialSelectedIds?.has(id) ?? false
  }

  const grouped = useMemo(() => {
    const byModule = new Map<string, Permission[]>()
    for (const permission of catalogQuery.data ?? []) {
      const list = byModule.get(permission.module) ?? []
      list.push(permission)
      byModule.set(permission.module, list)
    }
    return [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [catalogQuery.data])

  function toggleOne(id: string, checked: boolean) {
    setOverrides((prev) => {
      const next = new Map(prev)
      next.set(id, checked)
      return next
    })
  }

  function toggleModule(perms: Permission[], checked: boolean) {
    setOverrides((prev) => {
      const next = new Map(prev)
      for (const permission of perms) next.set(permission.id, checked)
      return next
    })
  }

  async function handleSave() {
    if (!role || !catalogQuery.data) return
    setSaving(true)
    try {
      const permissionIds = catalogQuery.data.filter((permission) => isChecked(permission.id)).map((p) => p.id)
      await updateRolePermissions(role.id, { permission_ids: permissionIds })
      toast.success("Permissions updated.")
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      queryClient.invalidateQueries({ queryKey: ["role", role.id] })
      queryClient.invalidateQueries({ queryKey: ["role-permissions"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("roles.manage")
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  const loading = catalogQuery.isLoading || (!isSuperAdmin && roleDetailQuery.isLoading)
  const error = catalogQuery.error ?? roleDetailQuery.error

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setOverrides(new Map())
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-4xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Manage Permissions{role ? ` — ${formatRoleName(role.name)}` : ""}</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? "Super Admin has all permissions and cannot be changed."
              : "Choose which permissions this role grants."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          {!role ? null : error ? (
            <ErrorState
              message={(error as Error).message}
              onRetry={() => {
                catalogQuery.refetch()
                roleDetailQuery.refetch()
              }}
            />
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            grouped.map(([module, perms]) => {
              const allSelected = perms.every((permission) => isChecked(permission.id))
              return (
                <div key={module}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-on-surface capitalize">
                      {module.replace(/_/g, " ")}
                    </h3>
                    {!isSuperAdmin && (
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-on-surface-variant">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(checked) => toggleModule(perms, !!checked)}
                        />
                        Select all
                      </label>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-2 lg:grid-cols-3">
                    {perms.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex items-start gap-2 rounded-md p-1.5 text-sm hover:bg-surface-container-low"
                      >
                        <Checkbox
                          className="mt-0.5"
                          checked={isChecked(permission.id)}
                          disabled={isSuperAdmin}
                          onCheckedChange={(checked) => toggleOne(permission.id, !!checked)}
                        />
                        <span>
                          <span className="block font-medium text-on-surface">{permission.name}</span>
                          {permission.description && (
                            <span className="block text-xs text-on-surface-variant">{permission.description}</span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <DialogFooter className="mt-2 shrink-0 border-t border-outline-variant pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {isSuperAdmin ? "Close" : "Cancel"}
          </Button>
          {!isSuperAdmin && (
            <Button type="button" disabled={saving || loading} onClick={handleSave}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
