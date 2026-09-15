"use client";

import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AlertTriangle, DoorOpen, PercentCircle, Users, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getCollectionsTrend, getDashboardSummary, getOccupancyTrend } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ErrorState } from "@/components/hostel/error-state";
import { StatCard } from "@/components/reports/report-stat-card";

function periodLabel(period: string): string {
  try {
    return format(parseISO(period), "MMM");
  } catch {
    return period;
  }
}

export function OverviewTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const summaryQuery = useQuery({
    queryKey: ["reports", "summary"],
    queryFn: getDashboardSummary,
  });

  const collectionsQuery = useQuery({
    queryKey: ["reports", "trends-collections", dateFrom, dateTo],
    queryFn: () =>
      getCollectionsTrend({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        granularity: "month",
      }),
  });

  const occupancyTrendQuery = useQuery({
    queryKey: ["reports", "trends-occupancy", dateFrom, dateTo],
    queryFn: () =>
      getOccupancyTrend({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        granularity: "month",
      }),
  });

  const isError = summaryQuery.isError || collectionsQuery.isError || occupancyTrendQuery.isError;
  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the overview report."
        onRetry={() => {
          summaryQuery.refetch();
          collectionsQuery.refetch();
          occupancyTrendQuery.refetch();
        }}
      />
    );
  }

  const summary = summaryQuery.data;
  const collectionsData = (collectionsQuery.data?.items ?? []).map((point) => ({
    period: periodLabel(point.period),
    total: Number(point.total),
  }));
  const occupancyData = (occupancyTrendQuery.data?.items ?? []).map((point) => ({
    period: periodLabel(point.period),
    rate: point.occupancy_rate,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={Users}
          iconClassName="bg-primary/10 text-primary"
          label="Total Residents"
          value={summary ? summary.total_residents.toLocaleString() : undefined}
        />
        <StatCard
          icon={PercentCircle}
          iconClassName="bg-primary/10 text-primary"
          label="Occupancy Rate"
          value={summary ? `${summary.occupancy_rate}%` : undefined}
        />
        <StatCard
          icon={Wallet}
          iconClassName="bg-error-container text-on-error-container"
          label="Outstanding Balance"
          value={summary ? formatCurrency(summary.outstanding_balance) : undefined}
        />
        <StatCard
          icon={AlertTriangle}
          iconClassName="bg-surface-container text-on-surface-variant"
          label="Open Complaints"
          value={summary ? summary.open_complaints.toLocaleString() : undefined}
        />
        <StatCard
          icon={DoorOpen}
          iconClassName="bg-primary/10 text-primary"
          label="Beds Available"
          value={summary ? summary.available_beds.toLocaleString() : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Collections Over Time</h2>
              <p className="text-sm text-on-surface-variant">Monthly payments received</p>
            </div>
          </div>
          {collectionsData.length === 0 ? (
            <p className="py-12 text-center text-sm text-on-surface-variant">No collections data for this range.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={collectionsData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-outline-variant" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} className="text-xs fill-on-surface-variant" />
                <YAxis tickLine={false} axisLine={false} width={56} className="text-xs fill-on-surface-variant" />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} cursor={{ fill: "var(--color-surface-container)" }} />
                <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">Occupancy Trend</h2>
              <p className="text-sm text-on-surface-variant">Monthly occupancy rate</p>
            </div>
          </div>
          {occupancyData.length === 0 ? (
            <p className="py-12 text-center text-sm text-on-surface-variant">No occupancy trend data for this range.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={occupancyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-outline-variant" />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} className="text-xs fill-on-surface-variant" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tickFormatter={(value: number) => `${value}%`}
                    className="text-xs fill-on-surface-variant"
                  />
                  <Tooltip formatter={(value) => `${Number(value)}%`} />
                  <Line type="monotone" dataKey="rate" stroke="var(--color-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
              {occupancyTrendQuery.data?.note && (
                <p className="mt-3 border-t border-outline-variant pt-3 text-xs text-on-surface-variant">
                  {occupancyTrendQuery.data.note}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
