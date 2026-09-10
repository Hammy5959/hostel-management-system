"use client"

import { useSyncExternalStore } from "react"

import { getStoredPermissions, subscribeUser } from "@/lib/auth"

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
 * The permission list is delivered once at login (alongside `user`) and
 * cached in localStorage — read synchronously here via `useSyncExternalStore`,
 * the same flash-free pattern `getStoredUser()` already uses. This is
 * ground truth for every role (not just roles that can read `GET /roles`),
 * so `has()` no longer needs to guess before the real answer is known.
 */
export function usePermissions() {
  const permissions = useSyncExternalStore(subscribeUser, getStoredPermissions, () => null)
  // Re-render when a new permission gets denied this session.
  useSyncExternalStore(subscribeDenied, () => denied.size, () => 0)

  const known = permissions ? new Set(permissions) : null

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
    isLoading: known === null,
    has,
    hasAny,
    hasAll,
  }
}
