"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Megaphone, PackageX, UtensilsCrossed } from "lucide-react";

import { getInventoryReport, getMessReport, getNoticesReport } from "@/lib/api";
import { ErrorState } from "@/components/hostel/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/reports/report-stat-card";

function MealTile({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-on-surface">{label}</span>
        <span className="text-xs font-bold text-primary">{pct}%</span>
      </div>
      <div className="mt-2 text-lg font-bold text-on-surface">
        {count} / {total}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-container">
        <div className="h-1.5 rounded-full bg-primary-container" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FacilitiesTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const inventoryQuery = useQuery({
    queryKey: ["reports", "inventory"],
    queryFn: getInventoryReport,
  });
  const messQuery = useQuery({
    queryKey: ["reports", "mess", dateFrom, dateTo],
    queryFn: () => getMessReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
  });
  const noticesQuery = useQuery({
    queryKey: ["reports", "notices"],
    queryFn: getNoticesReport,
  });

  const isError = inventoryQuery.isError || messQuery.isError || noticesQuery.isError;
  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the facilities report."
        onRetry={() => {
          inventoryQuery.refetch();
          messQuery.refetch();
          noticesQuery.refetch();
        }}
      />
    );
  }

  const inventory = inventoryQuery.data;
  const mess = messQuery.data;
  const notices = noticesQuery.data;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-on-surface">Inventory</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={Boxes}
            iconClassName="bg-primary/10 text-primary"
            label="Total Items"
            value={inventory ? inventory.total_items.toLocaleString() : undefined}
          />
          <StatCard
            icon={AlertTriangle}
            iconClassName="bg-amber-50 text-amber-700"
            label="Low Stock"
            value={inventory ? inventory.low_stock_items.toLocaleString() : undefined}
          />
          <StatCard
            icon={PackageX}
            iconClassName="bg-error-container text-on-error-container"
            label="Out of Stock"
            value={inventory ? inventory.out_of_stock_items.toLocaleString() : undefined}
          />
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <UtensilsCrossed aria-hidden className="size-5 text-primary" />
          <h3 className="text-lg font-semibold text-on-surface">Mess & Meals</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={Boxes}
            iconClassName="bg-primary/10 text-primary"
            label="Total Records"
            value={mess ? mess.total_records.toLocaleString() : undefined}
          />
          <StatCard
            icon={Boxes}
            iconClassName="bg-primary/10 text-primary"
            label="Consumed"
            value={mess ? mess.consumed.toLocaleString() : undefined}
          />
          <StatCard
            icon={Boxes}
            iconClassName="bg-surface-container text-on-surface-variant"
            label="Not Consumed"
            value={mess ? mess.not_consumed.toLocaleString() : undefined}
          />
        </div>
        {mess ? (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-outline-variant pt-4 md:grid-cols-3">
            <MealTile label="Breakfast" count={mess.breakfast} total={mess.total_records} />
            <MealTile label="Lunch" count={mess.lunch} total={mess.total_records} />
            <MealTile label="Dinner" count={mess.dinner} total={mess.total_records} />
          </div>
        ) : (
          <Skeleton className="mt-4 h-20 w-full" />
        )}
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Megaphone aria-hidden className="size-5 text-primary" />
          <h3 className="text-lg font-semibold text-on-surface">Notices</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard icon={Megaphone} iconClassName="bg-primary/10 text-primary" label="Published" value={notices ? notices.published.toLocaleString() : undefined} />
          <StatCard icon={Megaphone} iconClassName="bg-surface-container text-on-surface-variant" label="Draft" value={notices ? notices.draft.toLocaleString() : undefined} />
          <StatCard icon={Megaphone} iconClassName="bg-primary/10 text-primary" label="All Audience" value={notices ? notices.audience_all.toLocaleString() : undefined} />
          <StatCard icon={Megaphone} iconClassName="bg-primary/10 text-primary" label="Building" value={notices ? notices.audience_building.toLocaleString() : undefined} />
          <StatCard icon={Megaphone} iconClassName="bg-primary/10 text-primary" label="Floor" value={notices ? notices.audience_floor.toLocaleString() : undefined} />
        </div>
      </div>
    </div>
  );
}
