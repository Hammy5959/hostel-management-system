import { cn } from "@/lib/utils"
import type { Tone } from "@/components/hostel/status-badge"
import type { Role } from "@/lib/types"

/** Users' status strings collide with other modules' "active"/"inactive"
 * meanings in the shared STATUS_TONE map, so this module supplies its own
 * tone overrides (same pattern every module with ambiguous statuses uses).
 * Shared between the Users list and the User Detail page. */
export const USER_STATUS_TONE: Record<string, Tone> = {
  invited: "info",
  active: "success",
  inactive: "neutral",
  suspended: "danger",
}

/** Deterministic, stable color per role — the same role always gets the same
 * pill color across rows and page reloads. The palette reuses the app's
 * existing theme-token pairs (the same ones StatusBadge's TONE_CLASSES and
 * buildings-view.tsx's BuildingTypeBadge already use), no new raw hex.
 * super_admin gets a fixed distinct color rather than a hashed one. */
const ROLE_BADGE_PALETTE = [
  "bg-blue-50 text-blue-700",
  "bg-emerald-50 text-emerald-700",
  "bg-amber-50 text-amber-700",
  "bg-secondary-container text-on-secondary-container",
  "bg-surface-container-high text-on-surface",
] as const

const SUPER_ADMIN_ROLE_BADGE = "bg-primary-fixed text-on-primary-fixed"

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function roleBadgeClass(role: Role): string {
  if (role.name === "super_admin") return SUPER_ADMIN_ROLE_BADGE
  return ROLE_BADGE_PALETTE[hashString(role.id) % ROLE_BADGE_PALETTE.length]
}

export function RoleBadge({ role, fallbackLabel }: { role: Role | undefined; fallbackLabel: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        role ? roleBadgeClass(role) : "bg-surface-container-high text-on-surface-variant",
      )}
    >
      {role?.name ?? fallbackLabel}
    </span>
  )
}

export function initials(firstName: string, lastName: string | null): string {
  const first = firstName?.[0] ?? ""
  const last = lastName?.[0] ?? ""
  return (first + last).toUpperCase() || "?"
}

export function formatLastLogin(value: string | null): string {
  if (!value) return "Never"
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
