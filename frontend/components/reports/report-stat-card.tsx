import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** Shared across every Reports tab (components/reports/*-tab.tsx) — same
 * visual shape as the local StatCard/MetricCard each staff page (residents,
 * maintenance, dashboard) defines for itself, factored out once here since
 * six sibling tab files in this one feature would otherwise each duplicate
 * it. Not a global/cross-app component — stays local to components/reports/. */
export function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: React.ReactNode | undefined;
  /** Small secondary-text row under the value, e.g. "vs last month" or
   * "As of today" for endpoints the global date range doesn't affect. */
  caption?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={cn("flex size-9 items-center justify-center rounded-lg", iconClassName)}>
          <Icon aria-hidden className="size-4.5" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-9 w-20" />
      ) : (
        <p className="text-[28px] leading-none font-bold text-on-surface">{value}</p>
      )}
      {caption && <p className="mt-2 text-xs text-on-surface-variant">{caption}</p>}
    </div>
  );
}
