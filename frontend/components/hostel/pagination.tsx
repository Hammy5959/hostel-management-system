import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PER_PAGE_OPTIONS = [10, 20, 50, 100]

/** Returns page numbers to render, with `"ellipsis"` markers for gaps —
 * mirrors the Stitch pagination mock (1 2 3 … N). */
function getPageItems(page: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const items = new Set<number>([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1])
  const sorted = [...items].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  let prev = 0
  for (const n of sorted) {
    if (prev && n - prev > 1) result.push("ellipsis")
    result.push(n)
    prev = n
  }
  return result
}

export function Pagination({
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
}: {
  page: number
  perPage: number
  total: number
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(page * perPage, total)
  const pageItems = getPageItems(page, totalPages)

  return (
    <div className="flex flex-col gap-3 border-t border-outline-variant bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-sm text-on-surface-variant">
        <span>
          {total === 0 ? "No entries" : `Showing ${from} to ${to} of ${total} entries`}
        </span>
        <Select
          value={String(perPage)}
          onValueChange={(value) => value && onPerPageChange(Number(value))}
        >
          <SelectTrigger size="sm" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PER_PAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex size-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronLeft aria-hidden className="size-5" />
        </button>

        {pageItems.map((item, i) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${i}`} className="px-1 text-sm text-on-surface-variant">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                "flex size-8 items-center justify-center rounded text-sm font-medium transition-colors",
                item === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-outline-variant text-on-surface hover:bg-surface-container-low",
              )}
            >
              {item}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex size-8 items-center justify-center rounded border border-outline-variant text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronRight aria-hidden className="size-5" />
        </button>
      </div>
    </div>
  )
}
