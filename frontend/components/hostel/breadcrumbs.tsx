import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  /** Omit for a non-clickable crumb — the sidebar group label (e.g. "Hostel
   * Management") and the current page (the last item) are never links. */
  href?: string;
}

/** Shared breadcrumb trail, used above the page header on every Hostel
 * Management page (Buildings/Floors/Rooms/Room Detail/Allocations). */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-2 flex items-center text-xs font-semibold tracking-wide text-on-surface-variant uppercase"
    >
      <ol className="inline-flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="size-4" />}
              {item.href ? (
                <Link href={item.href} className="transition-colors hover:text-primary">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "font-bold text-primary" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
