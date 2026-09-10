"use client"

import { ShieldOff } from "lucide-react"

import { EmptyState } from "@/components/hostel/empty-state"
import { usePermissions } from "@/lib/permissions"

/**
 * Gates an entire page body on a view permission — no page content, buttons,
 * or modals render underneath when denied. Existing in-page action gating
 * (canCreate/canUpdate/etc.) is a separate, untouched layer inside `children`.
 *
 * `permission` is read from the synchronous login-time permission cache
 * (see `usePermissions`), so the correct branch renders on first paint with
 * no flash, including on reload. Pass `null` for pages the backend itself
 * requires no permission for (e.g. Notices).
 */
export function PageAccessGuard({
  permission,
  children,
}: {
  permission: string | string[] | null
  children: React.ReactNode
}) {
  const { has, hasAny, isLoading } = usePermissions()

  if (isLoading) return null

  const allowed =
    permission === null ? true : Array.isArray(permission) ? hasAny(...permission) : has(permission)

  if (!allowed) {
    const label = Array.isArray(permission) ? permission.join(" or ") : permission
    return (
      <EmptyState
        icon={ShieldOff}
        title="You don't have access to this page"
        description={`Ask an administrator to grant you the ${label} permission.`}
      />
    )
  }

  return <>{children}</>
}
