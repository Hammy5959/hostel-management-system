"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bed, ChevronDown, ChevronRight, DoorOpen, Sparkles, Wrench } from "lucide-react";

import { getOccupancyReport } from "@/lib/api";
import type { OccupancyBuildingBreakdownRow, OccupancyFloorBreakdownRow } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/hostel/error-state";
import { EmptyState } from "@/components/hostel/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/reports/report-stat-card";

function isBuildingRow(
  row: OccupancyBuildingBreakdownRow | OccupancyFloorBreakdownRow,
): row is OccupancyBuildingBreakdownRow {
  return "building_id" in row && "building_name" in row;
}

function FloorDrilldown({ buildingId }: { buildingId: string }) {
  const query = useQuery({
    queryKey: ["reports", "occupancy-floors", buildingId],
    queryFn: () => getOccupancyReport({ building_id: buildingId }),
  });

  if (query.isError) {
    return (
      <p className="p-4 text-sm text-on-surface-variant">
        Couldn&apos;t load floors for this building.
      </p>
    );
  }

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const floors = (query.data?.breakdown ?? []).filter(
    (row): row is OccupancyFloorBreakdownRow => !isBuildingRow(row),
  );

  if (floors.length === 0) {
    return <p className="p-4 text-sm text-on-surface-variant">No floors found for this building.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
      {floors.map((floor) => (
        <div key={floor.floor_id} className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-on-surface">{floor.floor_name}</span>
            <span className="text-xs font-bold text-primary">{floor.occupancy_rate}%</span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {floor.occupied_beds}/{floor.total_beds} beds · {floor.total_rooms} rooms
          </p>
        </div>
      ))}
    </div>
  );
}

export function OccupancyTab() {
  const [buildingFilter, setBuildingFilter] = useState<string>("all");
  const [expandedBuildingId, setExpandedBuildingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reports", "occupancy"],
    queryFn: () => getOccupancyReport(),
  });

  if (query.isError) {
    return <ErrorState message="Couldn't load the occupancy report." onRetry={() => query.refetch()} />;
  }

  const report = query.data;
  const buildingRows = (report?.breakdown ?? []).filter(isBuildingRow);
  const visibleRows =
    buildingFilter === "all" ? buildingRows : buildingRows.filter((row) => row.building_id === buildingFilter);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Bed}
          iconClassName="bg-primary/10 text-primary"
          label="Total Beds"
          value={report ? report.total_beds.toLocaleString() : undefined}
        />
        <StatCard
          icon={DoorOpen}
          iconClassName="bg-primary/10 text-primary"
          label="Occupied"
          value={report ? report.occupied.toLocaleString() : undefined}
        />
        <StatCard
          icon={DoorOpen}
          iconClassName="bg-surface-container text-on-surface-variant"
          label="Available"
          value={report ? report.available.toLocaleString() : undefined}
        />
        <StatCard
          icon={Wrench}
          iconClassName="bg-amber-50 text-amber-700"
          label="Maintenance"
          value={report ? report.maintenance.toLocaleString() : undefined}
        />
        <StatCard
          icon={Sparkles}
          iconClassName="bg-amber-50 text-amber-700"
          label="Cleaning"
          value={report ? report.cleaning.toLocaleString() : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <label className="text-sm text-on-surface-variant" htmlFor="occupancy-building-filter">
            Filter Facility:
          </label>
          <Select value={buildingFilter} onValueChange={(value) => setBuildingFilter(value ?? "all")}>
            <SelectTrigger id="occupancy-building-filter" className="h-10 w-56 rounded-lg border-transparent bg-surface-container">
              <SelectValue placeholder="All Buildings" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buildings</SelectItem>
              {buildingRows.map((row) => (
                <SelectItem key={row.building_id} value={row.building_id}>
                  {row.building_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex items-center justify-between border-b border-outline-variant px-6 py-4">
          <h3 className="text-lg font-semibold text-on-surface">Building Breakdown</h3>
          <span className="text-xs text-on-surface-variant">Click a row to inspect floors</span>
        </div>
        {query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <EmptyState icon={Bed} title="No buildings found" description="No building occupancy data is available." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                  <th className="px-6 py-3">Building</th>
                  <th className="px-4 py-3">Total Rooms</th>
                  <th className="px-4 py-3">Total Beds</th>
                  <th className="px-4 py-3">Occupied</th>
                  <th className="px-4 py-3">Available</th>
                  <th className="px-6 py-3">Occupancy Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant text-sm">
                {visibleRows.map((row) => {
                  const expanded = expandedBuildingId === row.building_id;
                  return (
                    <Fragment key={row.building_id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedBuildingId(expanded ? null : row.building_id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedBuildingId(expanded ? null : row.building_id);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface-container-low/60"
                      >
                        <td className="flex items-center gap-2 px-6 py-4 font-semibold text-on-surface">
                          {expanded ? (
                            <ChevronDown aria-hidden className="size-4 text-on-surface-variant" />
                          ) : (
                            <ChevronRight aria-hidden className="size-4 text-on-surface-variant" />
                          )}
                          {row.building_name}
                        </td>
                        <td className="px-4 py-4 text-on-surface-variant">{row.total_rooms}</td>
                        <td className="px-4 py-4 font-medium text-on-surface">{row.total_beds}</td>
                        <td className="px-4 py-4 font-semibold text-on-surface">{row.occupied_beds}</td>
                        <td className="px-4 py-4 text-on-surface-variant">{row.available_beds}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 rounded-full bg-surface-container">
                              <div
                                className={cn("h-2 rounded-full bg-primary-container")}
                                style={{ width: `${Math.min(row.occupancy_rate, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold">{row.occupancy_rate}%</span>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-surface-container-low/40">
                          <td colSpan={6} className="p-0">
                            <FloorDrilldown buildingId={row.building_id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
