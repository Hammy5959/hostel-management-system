import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-16 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-error-container">
        <AlertTriangle aria-hidden className="size-6 text-on-error-container" strokeWidth={1.75} />
      </div>
      <h3 className="mb-1 text-base font-semibold text-on-surface">Couldn&apos;t load this page</h3>
      <p className="mb-4 max-w-sm text-sm text-on-surface-variant">
        {message ?? "Something went wrong. Please try again."}
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
