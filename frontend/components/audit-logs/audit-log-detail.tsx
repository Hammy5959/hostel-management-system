import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AuditLogItem } from "@/lib/types"

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function humanizeField(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-on-surface-variant">{label}</span>
      <span className="text-right font-medium break-all text-on-surface">{value}</span>
    </div>
  )
}

/** Expanded audit-log row content: a field-level old→new diff (only changed
 * fields — added fields show new-only, removed fields show old-only), plus
 * an IP/user-agent/entity metadata footer. Nothing like this existed
 * elsewhere in the app; the metadata footer reuses the DetailRow pattern
 * from visitor-detail-dialog.tsx. */
export function AuditLogDetail({ log }: { log: AuditLogItem }) {
  const oldValues = log.old_values ?? {}
  const newValues = log.new_values ?? {}
  const keys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)])).filter((key) => {
    const hasOld = Object.prototype.hasOwnProperty.call(oldValues, key)
    const hasNew = Object.prototype.hasOwnProperty.call(newValues, key)
    if (hasOld && hasNew) return JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])
    return true
  })

  return (
    <div className="space-y-5 p-6">
      <div>
        <h4 className="mb-2 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
          Field Changes
        </h4>
        {keys.length === 0 ? (
          <p className="text-sm text-on-surface-variant italic">
            No field-level changes recorded for this action.
          </p>
        ) : (
          <div className="divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface-container-lowest">
            {keys.map((key) => {
              const hasOld = Object.prototype.hasOwnProperty.call(oldValues, key)
              const hasNew = Object.prototype.hasOwnProperty.call(newValues, key)
              return (
                <div key={key} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="w-40 shrink-0 font-medium text-on-surface">{humanizeField(key)}</span>
                  {hasOld && (
                    <span className={cn("text-on-surface-variant line-through", "font-mono text-xs")}>
                      {formatDiffValue(oldValues[key])}
                    </span>
                  )}
                  {hasOld && hasNew && <ArrowRight aria-hidden className="size-3.5 text-on-surface-variant" />}
                  {hasNew && (
                    <span className="font-mono text-xs font-medium text-emerald-700">
                      {formatDiffValue(newValues[key])}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
          Metadata
        </h4>
        <div className="divide-y divide-outline-variant rounded-lg border border-outline-variant bg-surface-container-lowest px-4">
          <DetailRow label="IP Address" value={log.ip_address ?? "—"} />
          <DetailRow label="User Agent" value={log.user_agent ?? "—"} />
          <DetailRow label="Entity Type" value={log.entity_type ?? "—"} />
          <DetailRow label="Entity ID" value={log.entity_id ?? "—"} />
        </div>
      </div>
    </div>
  )
}
