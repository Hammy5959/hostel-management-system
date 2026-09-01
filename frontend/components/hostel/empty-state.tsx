import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-surface-container">
        <Icon aria-hidden className="size-6 text-on-surface-variant" strokeWidth={1.75} />
      </div>
      <h3 className="mb-1 text-base font-semibold text-on-surface">{title}</h3>
      {description && (
        <p className="mb-4 max-w-sm text-sm text-on-surface-variant">{description}</p>
      )}
      {action && (
        <Button type="button" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}
