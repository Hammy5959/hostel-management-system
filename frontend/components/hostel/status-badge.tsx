import { cn } from "@/lib/utils"

export type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "violet"

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-error-container text-on-error-container border border-error-container",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  neutral: "bg-surface-container-high text-on-surface-variant border border-outline-variant",
  violet: "bg-primary-fixed text-on-primary-fixed border border-primary-fixed",
}

/** Exact backend status strings for the 5 hostel-structure modules. */
const STATUS_TONE: Record<string, Tone> = {
  // rooms.status
  active: "success",
  inactive: "neutral",
  maintenance: "warning",
  // beds.status
  available: "success",
  occupied: "violet",
  cleaning: "warning",
  // room_allocations.status
  transferred: "info",
  completed: "neutral",
  cancelled: "danger",
  // resident_stays.status
  scheduled: "info",
  checked_in: "success",
  checked_out: "neutral",
  // residents.status (active/inactive collide with rooms.status above and
  // need a different tone here — pass an explicit `tone` prop for those)
  applicant: "info",
  on_leave: "warning",
}

function humanize(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function StatusBadge({
  status,
  tone: toneOverride,
  label,
  className,
}: {
  status: string
  /** Bypasses the shared status→tone lookup — needed for status strings
   * (e.g. "active"/"inactive") whose meaning differs by module. */
  tone?: Tone
  /** Bypasses the default humanize(status) display text — needed when a
   * status's stored value shouldn't be shown to users verbatim (e.g.
   * attendance's "excused" is displayed as "On Leave"). */
  label?: string
  className?: string
}) {
  const tone = toneOverride ?? STATUS_TONE[status] ?? "neutral"
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "success" && "bg-emerald-500",
          tone === "warning" && "bg-amber-500",
          tone === "danger" && "bg-destructive",
          tone === "info" && "bg-blue-500",
          tone === "neutral" && "bg-outline",
          tone === "violet" && "bg-primary",
        )}
      />
      {label ?? humanize(status)}
    </span>
  )
}
