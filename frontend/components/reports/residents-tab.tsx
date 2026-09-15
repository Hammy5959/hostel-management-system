"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, LogIn, LogOut, Users, XCircle } from "lucide-react";

import { getAdmissionsReport, getStaysReport } from "@/lib/api";
import type { AdmissionsReport } from "@/lib/types";
import { ErrorState } from "@/components/hostel/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/reports/report-stat-card";

const ADMISSION_BARS: { key: keyof AdmissionsReport; label: string; color: string }[] = [
  { key: "total", label: "Total", color: "bg-primary-container" },
  { key: "pending", label: "Pending", color: "bg-surface-container-highest" },
  { key: "approved", label: "Approved", color: "bg-primary" },
  { key: "rejected", label: "Rejected", color: "bg-error" },
  { key: "cancelled", label: "Cancelled", color: "bg-outline" },
];

export function ResidentsTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const admissionsQuery = useQuery({
    queryKey: ["reports", "admissions", dateFrom, dateTo],
    queryFn: () => getAdmissionsReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
  });

  const staysQuery = useQuery({
    queryKey: ["reports", "stays", dateFrom, dateTo],
    queryFn: () => getStaysReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
  });

  const isError = admissionsQuery.isError || staysQuery.isError;
  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the residents report."
        onRetry={() => {
          admissionsQuery.refetch();
          staysQuery.refetch();
        }}
      />
    );
  }

  const admissions = admissionsQuery.data;
  const stays = staysQuery.data;
  const maxAdmission = admissions ? Math.max(admissions.total, 1) : 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Users} iconClassName="bg-primary/10 text-primary" label="Total Applications" value={admissions ? admissions.total.toLocaleString() : undefined} />
        <StatCard icon={Clock} iconClassName="bg-surface-container text-on-surface-variant" label="Pending" value={admissions ? admissions.pending.toLocaleString() : undefined} />
        <StatCard icon={CheckCircle2} iconClassName="bg-primary/10 text-primary" label="Approved" value={admissions ? admissions.approved.toLocaleString() : undefined} />
        <StatCard icon={XCircle} iconClassName="bg-error-container text-on-error-container" label="Rejected" value={admissions ? admissions.rejected.toLocaleString() : undefined} />
        <StatCard icon={XCircle} iconClassName="bg-surface-container text-on-surface-variant" label="Cancelled" value={admissions ? admissions.cancelled.toLocaleString() : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={LogIn} iconClassName="bg-primary/10 text-primary" label="Checked In" value={stays ? stays.checked_in.toLocaleString() : undefined} />
        <StatCard icon={LogOut} iconClassName="bg-surface-container text-on-surface-variant" label="Checked Out" value={stays ? stays.checked_out.toLocaleString() : undefined} />
        <StatCard icon={Clock} iconClassName="bg-primary/10 text-primary" label="Scheduled" value={stays ? stays.scheduled.toLocaleString() : undefined} />
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-on-surface">Admissions by Status</h3>
          <p className="text-sm text-on-surface-variant">For the selected date range</p>
        </div>
        {!admissions ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="flex h-48 items-end justify-around gap-4 border-b border-outline-variant px-2">
            {ADMISSION_BARS.map((bar) => {
              const count = admissions[bar.key];
              const pct = Math.max((count / maxAdmission) * 100, count > 0 ? 4 : 0);
              return (
                <div key={bar.key} className="flex flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-on-surface">{count}</span>
                  <div className="flex h-32 w-full max-w-[64px] items-end">
                    <div className={`w-full rounded-t-md ${bar.color}`} style={{ height: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-on-surface-variant">{bar.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
