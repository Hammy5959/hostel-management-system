export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm leading-5 text-on-surface-variant">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  )
}
