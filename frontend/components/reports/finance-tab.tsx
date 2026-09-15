"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Receipt, Search, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { getDefaultersReport, getFinanceReport } from "@/lib/api";
import type { DefaulterRow } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { ErrorState } from "@/components/hostel/error-state";
import { EmptyState } from "@/components/hostel/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/reports/report-stat-card";

type SortKey = "name" | "student_id" | "amount" | "oldest_overdue_date";
type SortDir = "asc" | "desc";

function defaulterName(row: DefaulterRow): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ");
}

function initials(row: DefaulterRow): string {
  return [row.first_name, row.last_name]
    .filter(Boolean)
    .map((part) => part![0]!.toUpperCase())
    .join("");
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-on-surface"
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden className="size-3.5" />
          )
        ) : (
          <ArrowUpDown aria-hidden className="size-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

export function FinanceTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const financeQuery = useQuery({
    queryKey: ["reports", "finance", dateFrom, dateTo],
    queryFn: () => getFinanceReport({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
  });

  const defaultersQuery = useQuery({
    queryKey: ["reports", "defaulters"],
    queryFn: getDefaultersReport,
  });

  const isError = financeQuery.isError || defaultersQuery.isError;
  if (isError) {
    return (
      <ErrorState
        message="Couldn't load the finance report."
        onRetry={() => {
          financeQuery.refetch();
          defaultersQuery.refetch();
        }}
      />
    );
  }

  const finance = financeQuery.data;
  const totalInvoices = finance ? finance.paid_invoices + finance.overdue_invoices + finance.draft_invoices : 0;
  const pct = (n: number) => (totalInvoices > 0 ? Math.round((n / totalInvoices) * 100) : 0);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "amount" || key === "oldest_overdue_date" ? "desc" : "asc");
    }
  }

  const rows = useMemo(() => {
    const items = defaultersQuery.data?.items ?? [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? items.filter(
          (row) =>
            defaulterName(row).toLowerCase().includes(term) ||
            (row.student_id ?? "").toLowerCase().includes(term) ||
            (row.room_number ?? "").toLowerCase().includes(term),
        )
      : items;

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = defaulterName(a).localeCompare(defaulterName(b));
      else if (sortKey === "student_id") cmp = (a.student_id ?? "").localeCompare(b.student_id ?? "");
      else if (sortKey === "amount") cmp = Number(a.total_outstanding) - Number(b.total_outstanding);
      else cmp = (a.oldest_overdue_date ?? "").localeCompare(b.oldest_overdue_date ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [defaultersQuery.data, search, sortKey, sortDir]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          iconClassName="bg-primary/10 text-primary"
          label="Total Collected"
          value={finance ? formatCurrency(finance.total_payments) : undefined}
        />
        <StatCard
          icon={TrendingDown}
          iconClassName="bg-surface-container text-on-surface-variant"
          label="Total Expenses"
          value={finance ? formatCurrency(finance.total_expenses) : undefined}
        />
        <StatCard
          icon={Wallet}
          iconClassName="bg-error-container text-on-error-container"
          label="Outstanding Balance"
          value={finance ? formatCurrency(finance.outstanding_balance) : undefined}
          caption="As of today"
        />
        <StatCard
          icon={AlertTriangle}
          iconClassName="bg-error-container text-on-error-container"
          label="Overdue Invoices"
          value={finance ? finance.overdue_invoices.toLocaleString() : undefined}
          caption="As of today"
        />
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-on-surface">Invoice Status Distribution</h3>
        </div>
        {finance && totalInvoices > 0 ? (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-container">
              <div className="h-full bg-primary-container" style={{ width: `${pct(finance.paid_invoices)}%` }} />
              <div className="h-full bg-error" style={{ width: `${pct(finance.overdue_invoices)}%` }} />
              <div className="h-full bg-tertiary-container" style={{ width: `${pct(finance.draft_invoices)}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 border-t border-outline-variant pt-3 text-sm md:grid-cols-3">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-primary-container" />
                <span className="font-semibold text-on-surface">Paid:</span>
                <span className="text-on-surface-variant">{finance.paid_invoices} ({pct(finance.paid_invoices)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-error" />
                <span className="font-semibold text-on-surface">Overdue:</span>
                <span className="text-on-surface-variant">{finance.overdue_invoices} ({pct(finance.overdue_invoices)}%)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-tertiary-container" />
                <span className="font-semibold text-on-surface">Draft:</span>
                <span className="text-on-surface-variant">{finance.draft_invoices} ({pct(finance.draft_invoices)}%)</span>
              </div>
            </div>
          </>
        ) : finance ? (
          <p className="py-6 text-center text-sm text-on-surface-variant">No invoices yet.</p>
        ) : (
          <Skeleton className="h-4 w-full rounded-full" />
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <div className="flex flex-col gap-4 border-b border-outline-variant p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-on-surface">Fee Defaulters</h3>
            <p className="text-sm text-on-surface-variant">Residents with an overdue balance, as of today</p>
          </div>
          <div className="relative w-full md:w-72">
            <Search aria-hidden className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search resident, student ID, or room…"
              aria-label="Search defaulters"
              className="h-10 rounded-lg pl-9 text-sm"
            />
          </div>
        </div>

        {defaultersQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={search ? "No matching defaulters" : "No defaulters"}
            description={search ? "Try a different search." : "No residents currently have an overdue balance."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                  <SortHeader label="Resident Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3" />
                  <SortHeader label="Student ID" sortKey="student_id" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="px-4 py-3" />
                  <th className="px-4 py-3">Room / Bed</th>
                  <SortHeader label="Amount Owed" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="px-6 py-3 text-right" />
                  <SortHeader
                    label="Oldest Overdue Date"
                    sortKey="oldest_overdue_date"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    className="px-6 py-3"
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant text-sm">
                {rows.map((row) => (
                  <tr key={row.resident_id} className="hover:bg-surface-container-low/50">
                    <td className="flex items-center gap-3 px-6 py-4">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-container text-xs font-bold text-on-primary-container">
                        {initials(row)}
                      </div>
                      <p className="font-semibold text-on-surface">{defaulterName(row)}</p>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-on-surface-variant">{row.student_id ?? "—"}</td>
                    <td className="px-4 py-4 font-medium text-on-surface">
                      {row.room_number ? `${row.room_number}${row.bed_number ? ` / ${row.bed_number}` : ""}` : "—"}
                    </td>
                    <td className="px-6 py-4 text-right text-base font-bold text-error">
                      {formatCurrency(row.total_outstanding)}
                    </td>
                    <td className="px-6 py-4">
                      {row.oldest_overdue_date ? (
                        <span className="inline-flex items-center gap-1.5 rounded bg-error-container/60 px-2.5 py-1 text-xs font-semibold text-error">
                          <AlertTriangle aria-hidden className="size-3.5" />
                          {row.oldest_overdue_date}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
