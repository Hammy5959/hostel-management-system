"use client";

import { useState, type SubmitEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  Clock,
  Infinity as InfinityIcon,
  Plus,
  Search,
  ShieldOff,
  Wallet,
} from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Breadcrumbs } from "@/components/hostel/breadcrumbs";
import { EmptyState } from "@/components/hostel/empty-state";
import { ErrorState } from "@/components/hostel/error-state";
import { Pagination } from "@/components/hostel/pagination";
import { usePermissions } from "@/lib/permissions";
import { ApiError, getFeeStructures } from "@/lib/api";
import type { FeeStructure } from "@/lib/types";
import { FeeStructureFormDialog } from "@/components/fee-structures/fee-structure-form-dialog";

const FREQUENCY_TONE: Record<string, string> = {
  Monthly: "border-blue-200 bg-blue-100 text-blue-800",
  Weekly: "border-cyan-200 bg-cyan-100 text-cyan-800",
  Yearly: "border-indigo-200 bg-indigo-100 text-indigo-800",
  "One-time": "border-purple-200 bg-purple-100 text-purple-800",
};
const FREQUENCY_TONE_DEFAULT = "border-outline-variant bg-surface-container-high text-on-surface-variant";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonthYear(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function StatCard({
  icon: Icon,
  chipClassName,
  label,
  value,
}: {
  icon: typeof Wallet;
  chipClassName: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
            {label}
          </p>
          <h3 className="text-2xl font-semibold text-on-surface">{value.toLocaleString()}</h3>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", chipClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
    </div>
  );
}

/** The footer row's icon/text/color depends purely on date_status — the same
 * computation the backend uses to decide is_currently_usable, just rendered
 * for a human (independent of the separate Active/Inactive badge above). */
function EffectiveFooter({ fs }: { fs: FeeStructure }) {
  if (fs.date_status === "continuous") {
    return (
      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
        <InfinityIcon aria-hidden className="size-4" />
        Effective: Continuous
      </div>
    );
  }
  if (fs.date_status === "expired") {
    return (
      <div className="flex items-center gap-2 text-xs text-destructive">
        <CalendarOff aria-hidden className="size-4" />
        Effective: Expired {formatMonthYear(fs.effective_until)}
      </div>
    );
  }
  if (fs.date_status === "not_yet_active") {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-600">
        <Clock aria-hidden className="size-4" />
        Not yet active — starts {formatDate(fs.effective_from)}
      </div>
    );
  }
  const range =
    fs.effective_from && fs.effective_until
      ? `${formatDate(fs.effective_from)} - ${formatDate(fs.effective_until)}`
      : fs.effective_from
        ? `From ${formatDate(fs.effective_from)}`
        : `Until ${formatDate(fs.effective_until)}`;
  return (
    <div className="flex items-center gap-2 text-xs text-on-surface-variant">
      <CalendarDays aria-hidden className="size-4" />
      Effective: {range}
    </div>
  );
}

function FeeStructureCard({
  fs,
  canManage,
  onEdit,
}: {
  fs: FeeStructure;
  canManage: boolean;
  onEdit: () => void;
}) {
  const muted = !fs.is_currently_usable;
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-transform hover:-translate-y-0.5",
        muted && "opacity-75",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-lg font-bold text-on-surface">{fs.name}</h4>
          {fs.description && (
            <p className="mt-1 line-clamp-2 text-sm text-on-surface-variant">{fs.description}</p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 text-right text-xl font-bold",
            muted ? "text-on-surface-variant" : "text-primary",
          )}
        >
          {formatCurrency(fs.amount)}
        </span>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            FREQUENCY_TONE[fs.frequency] ?? FREQUENCY_TONE_DEFAULT,
          )}
        >
          {fs.frequency}
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-semibold",
            fs.is_active
              ? "border-emerald-200 bg-emerald-100 text-emerald-800"
              : "border-gray-200 bg-gray-100 text-gray-800",
          )}
        >
          {fs.is_active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-outline-variant pt-4">
        <EffectiveFooter fs={fs} />
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-outline-variant hover:bg-surface-container-low"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}

export function FeeStructuresView() {
  const { has } = usePermissions();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);

  const canManage = has("fee_structures.manage");

  const query = useQuery({
    queryKey: ["fee-structures", { page, perPage, search, status }],
    queryFn: () =>
      getFeeStructures({
        page,
        per_page: perPage,
        search: search || undefined,
        is_active: status === "active" ? true : status === "inactive" ? false : undefined,
      }),
  });

  const items = query.data?.items ?? [];
  const summary = query.data?.summary;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(fs: FeeStructure) {
    setEditing(fs);
    setDialogOpen(true);
  }

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const forbidden =
    query.error instanceof ApiError && query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Finance & Fees" }, { label: "Fee Structures" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Fee Structures
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Manage and configure fee categories, pricing, and billing frequencies.
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Add Fee Structure
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {query.isLoading || !summary ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={Wallet}
              chipClassName="bg-primary/10 text-primary"
              label="Total Fee Structures"
              value={summary.total}
            />
            <StatCard
              icon={CheckCircle2}
              chipClassName="bg-emerald-100 text-emerald-700"
              label="Active"
              value={summary.active}
            />
            <StatCard
              icon={Ban}
              chipClassName="bg-error-container text-on-error-container"
              label="Inactive"
              value={summary.inactive}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-md">
            <Search
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                // Clearing the box resets the list immediately — only a
                // non-empty search term needs an explicit Search click.
                if (value.trim() === "") {
                  setPage(1);
                  setSearch("");
                }
              }}
              placeholder="Search fee structures by name…"
              aria-label="Search fee structures"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="sm:ml-auto">
          <Select
            value={status || "all"}
            onValueChange={(value) => {
              setStatus(!value || value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-44">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Fee Structures"
          description="Ask an administrator to grant you the fee_structures.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No fee structures found"
          description={
            search || status
              ? "No fee structures match your filters."
              : "Add your first fee structure to get started."
          }
          action={canManage ? { label: "Add Fee Structure", onClick: openCreate } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {items.map((fs) => (
                <FeeStructureCard
                  key={fs.id}
                  fs={fs}
                  canManage={canManage}
                  onEdit={() => openEdit(fs)}
                />
              ))}
            </div>

            <Pagination
              page={query.data.page}
              perPage={query.data.per_page}
              total={query.data.total}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next);
                setPage(1);
              }}
            />
          </>
        )
      )}

      <FeeStructureFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        feeStructure={editing}
      />
    </div>
  );
}
