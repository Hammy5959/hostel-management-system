"use client"

import { useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"

import { getRole } from "@/lib/api"
import { getStoredUser } from "@/lib/auth"

/**
 * Session-scoped set of permission names the backend has already told us we
 * don't have (403 `missing_permission`). Once denied, the gated action stays
 * hidden for the rest of the session — per spec, the UI never "unhides" a
 * permission speculatively. Call `markPermissionDenied` from a mutation's
 * `onError` when `err.code === "missing_permission"`.
 */
const denied = new Set<string>()
const listeners = new Set<() => void>()

export function markPermissionDenied(permission: string | undefined): void {
  if (!permission || denied.has(permission)) return
  denied.add(permission)
  listeners.forEach((listener) => listener())
}

function subscribeDenied(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Resolves the current user's effective permission set for gating UI.
 *
 * If the session can read roles (`roles.view`/`roles.manage`), permissions
 * resolve from the live `GET /roles/{role_id}`. Otherwise (typical for
 * residents/limited staff), gated actions render optimistically and the
 * backend's 403 `missing_permission` is the real authority — see
 * `markPermissionDenied`.
 */
export function usePermissions() {
  const user = getStoredUser()
  // Re-render when a new permission gets denied this session.
  useSyncExternalStore(subscribeDenied, () => denied.size, () => 0)

  const roleQuery = useQuery({
    queryKey: ["role-permissions", user?.role_id],
    queryFn: () => getRole(user!.role_id),
    enabled: !!user?.role_id,
    retry: false,
    staleTime: 5 * 60_000,
  })

  const known = roleQuery.data ? new Set(roleQuery.data.permissions) : null

  function has(permission: string): boolean {
    if (denied.has(permission)) return false
    if (known) return known.has(permission)
    return true
  }

  function hasAny(...names: string[]): boolean {
    return names.some((name) => has(name))
  }

  function hasAll(...names: string[]): boolean {
    return names.every((name) => has(name))
  }

  return {
    isLoading: roleQuery.isLoading,
    has,
    hasAny,
    hasAll,
  }
}
