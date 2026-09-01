"use client";

import { useState, type SubmitEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  CheckCircle2,
  Clock,
  DoorOpen,
  Plus,
  Search,
  ShieldOff,
  UserRoundX,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { ConfirmDialog } from "@/components/hostel/confirm-dialog";
import {
  EntityCombobox,
  type ComboOption,
} from "@/components/hostel/entity-combobox";
import { usePermissions, markPermissionDenied } from "@/lib/permissions";
import { ApiError, getAllocations, releaseAllocation } from "@/lib/api";
import { fetchBuildingOptions } from "@/lib/hostel-options";
import type { Allocation, AllocationStatus } from "@/lib/types";
import { AllocateBedDialog } from "@/components/allocations/allocate-bed-dialog";
import { TransferAllocationDialog } from "@/components/allocations/transfer-allocation-dialog";
import { AllocationDetailsDialog } from "@/components/allocations/allocation-details-dialog";
import { toast } from "sonner";

const STATUS_OPTIONS: { value: AllocationStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "transferred", label: "Transferred" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "Date Range: All Time" },
  { value: "month", label: "This Month" },
  { value: "30d", label: "Last 30 Days" },
] as const;

function dateFromForPreset(preset: string): string | undefined {
  const now = new Date();
  if (preset === "month") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  }
  if (preset === "30d") {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  return undefined;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function initials(firstName: string, lastName: string | null): string {
  return [firstName, lastName]
    .filter(Boolean)
    .map((part) => part![0]!.toUpperCase())
    .join("");
}

type PillTone = "success" | "info" | "warning" | "danger" | "neutral";

const PILL_TONE: Record<PillTone, string> = {
  success: "bg-emerald-50 text-emerald-700",
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-highest text-on-surface-variant",
};

const STATUS_TONE: Record<AllocationStatus, PillTone> = {
  active: "success",
  transferred: "info",
  completed: "neutral",
  cancelled: "danger",
};

const STATUS_LABEL: Record<AllocationStatus, string> = {
  active: "Active",
  transferred: "Transferred",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Compact uppercase pill matching the Stitch reference's status/payment
 * badges exactly (structure + spacing), re-expressed with this app's own
 * design tokens instead of the mock's raw hex fills. */
function Pill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold tracking-wide uppercase",
        PILL_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

function StatCard({
  icon: Icon,
  chipClassName,
  label,
  value,
}: {
  icon: typeof BedDouble;
  chipClassName: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", chipClassName)}>
        <Icon aria-hidden className="size-5" />
      </div>
      <div>
        <p className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
          {label}
        </p>
        <p className="text-[28px] leading-9 font-semibold tracking-[-0.01em] text-on-surface">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function AllocationCard({
  allocation,
  canTransfer,
  canCheckout,
  onTransfer,
  onCheckout,
  onDetails,
}: {
  allocation: Allocation;
  canTransfer: boolean;
  canCheckout: boolean;
  onTransfer: () => void;
  onCheckout: () => void;
  onDetails: () => void;
}) {
  const resident = allocation.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const isCompleted = allocation.status === "completed" || allocation.status === "cancelled";
  const payment = allocation.payment_status;

  return (
    <div className="group flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12 border border-outline-variant">
            <AvatarImage
              src={resident?.profile_picture_url ?? undefined}
              alt={residentName}
            />
            <AvatarFallback>
              {resident ? initials(resident.first_name, resident.last_name) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h4 className="truncate text-base font-semibold text-on-surface">{residentName}</h4>
            <p className="truncate text-xs text-on-surface-variant">
              {resident?.student_id ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Pill tone={STATUS_TONE[allocation.status]}>{STATUS_LABEL[allocation.status]}</Pill>
          {payment && (
            <Pill
              tone={
                payment.status === "paid"
                  ? "success"
                  : payment.status === "no_dues"
                    ? "neutral"
                    : payment.status === "overdue"
                      ? "danger"
                      : "warning"
              }
            >
              {payment.status === "paid"
                ? "Paid"
                : payment.status === "no_dues"
                  ? "No Dues"
                  : payment.status === "overdue"
                    ? "Overdue"
                    : "Pending"}
            </Pill>
          )}
        </div>
      </div>

      <div
        className={cn(
          "mb-4 rounded-lg border border-outline-variant/50 bg-surface-container-low p-3",
          isCompleted && "opacity-70",
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase">Building</p>
            <p className="text-sm font-medium text-on-surface">
              {allocation.room?.building_name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase">Floor</p>
            <p className="text-sm font-medium text-on-surface">
              {allocation.room?.floor_name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase">Room</p>
            <p className="flex items-center gap-1 text-sm font-medium text-on-surface">
              <DoorOpen aria-hidden className="size-4 text-primary" />
              {allocation.room?.room_number ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant uppercase">Bed</p>
            <p className="flex items-center gap-1 text-sm font-medium text-on-surface">
              <BedDouble aria-hidden className="size-4 text-primary" />
              {allocation.bed?.bed_number ?? "—"}
            </p>
          </div>
        </div>
        <div className="mt-2 border-t border-outline-variant/30 pt-2 text-xs text-on-surface-variant">
          From: {formatDate(allocation.allocated_from)}
        </div>
      </div>

      <div className="mt-auto flex gap-2">
        {allocation.status === "active" && (
          <>
            {canTransfer && (
              <button
                type="button"
                onClick={onTransfer}
                className="flex-1 rounded-lg border border-outline-variant py-1.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low"
              >
                Transfer
              </button>
            )}
            {canCheckout && (
              <button
                type="button"
                onClick={onCheckout}
                className="flex-1 rounded-lg border border-destructive/30 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5"
              >
                Checkout
              </button>
            )}
          </>
        )}
        {allocation.status === "transferred" && (
          <button
            type="button"
            onClick={onDetails}
            className="flex-1 rounded-lg border border-outline-variant py-1.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Details
          </button>
        )}
        {(allocation.status === "completed" || allocation.status === "cancelled") && (
          <button
            type="button"
            onClick={onDetails}
            className="flex-1 rounded-lg border border-outline-variant py-1.5 text-sm font-medium text-on-surface transition-colors hover:bg-surface-container-low"
          >
            History
          </button>
        )}
      </div>
    </div>
  );
}

export function AllocationsView() {
  const { has } = usePermissions();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [building, setBuilding] = useState<ComboOption | null>(null);
  const [dateRange, setDateRange] = useState<string>("all");

  const [allocateOpen, setAllocateOpen] = useState(false);
  const [transferAllocationItem, setTransferAllocationItem] = useState<Allocation | null>(null);
  const [detailsAllocation, setDetailsAllocation] = useState<Allocation | null>(null);
  const [checkoutAllocation, setCheckoutAllocation] = useState<Allocation | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const canCreate = has("allocations.create");
  const canTransfer = has("allocations.transfer");
  const canCheckout = has("allocations.update");

  const query = useQuery({
    queryKey: [
      "allocations",
      { page, perPage, search, status, buildingId: building?.value, dateRange },
    ],
    queryFn: () =>
      getAllocations({
        page,
        per_page: perPage,
        search: search || undefined,
        status: status || undefined,
        building_id: building?.value,
        date_from: dateFromForPreset(dateRange),
      }),
  });

  const items = query.data?.items ?? [];
  const summary = query.data?.summary;

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function confirmCheckout() {
    if (!checkoutAllocation) return;
    setCheckingOut(true);
    try {
      await releaseAllocation(checkoutAllocation.id);
      toast.success("Resident checked out and bed released.");
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setCheckoutAllocation(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("allocations.update");
        }
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setCheckingOut(false);
    }
  }

  const forbidden =
    query.error instanceof ApiError && query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Hostel Management" }, { label: "Allocations" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Room Allocations
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Monitor real-time bed occupancy and manage resident placements across all blocks.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setAllocateOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Allocate Bed
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {query.isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={BedDouble}
              chipClassName="bg-primary/10 text-primary"
              label="Total Beds"
              value={summary.total_beds}
            />
            <StatCard
              icon={CheckCircle2}
              chipClassName="bg-emerald-50 text-emerald-600"
              label="Occupied Beds"
              value={summary.occupied_beds}
            />
            <StatCard
              icon={Users}
              chipClassName="bg-blue-50 text-blue-600"
              label="Available Beds"
              value={summary.available_beds}
            />
            <StatCard
              icon={Clock}
              chipClassName="bg-error-container text-destructive"
              label="Pending Payments"
              value={summary.pending_payments}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center">
        <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-xs">
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
              placeholder="Search by resident name, ID or room…"
              aria-label="Search allocations"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
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
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-full sm:max-w-56">
            <EntityCombobox
              value={building}
              onChange={(next) => {
                setBuilding(next);
                setPage(1);
              }}
              fetchOptions={fetchBuildingOptions}
              placeholder="Block: All Buildings"
            />
          </div>

          <Select
            value={dateRange}
            onValueChange={(value) => {
              setDateRange(value || "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Allocations"
          description="Ask an administrator to grant you the allocations.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={UserRoundX}
          title="No allocations found"
          description={
            search || status || building || dateRange !== "all"
              ? "No allocations match your filters."
              : "Allocate a bed to get started."
          }
          action={canCreate ? { label: "Allocate Bed", onClick: () => setAllocateOpen(true) } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((allocation) => (
                <AllocationCard
                  key={allocation.id}
                  allocation={allocation}
                  canTransfer={canTransfer}
                  canCheckout={canCheckout}
                  onTransfer={() => setTransferAllocationItem(allocation)}
                  onCheckout={() => setCheckoutAllocation(allocation)}
                  onDetails={() => setDetailsAllocation(allocation)}
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

      <AllocateBedDialog open={allocateOpen} onOpenChange={setAllocateOpen} />

      <TransferAllocationDialog
        open={!!transferAllocationItem}
        onOpenChange={(open) => !open && setTransferAllocationItem(null)}
        allocation={transferAllocationItem}
      />

      <AllocationDetailsDialog
        open={!!detailsAllocation}
        onOpenChange={(open) => !open && setDetailsAllocation(null)}
        allocation={detailsAllocation}
      />

      <ConfirmDialog
        open={!!checkoutAllocation}
        onOpenChange={(open) => !open && setCheckoutAllocation(null)}
        title="Check out this resident?"
        description={`This releases bed ${checkoutAllocation?.bed?.bed_number ?? ""} and completes the allocation. This cannot be undone.`}
        confirmLabel="Checkout"
        destructive
        loading={checkingOut}
        onConfirm={confirmCheckout}
      />
    </div>
  );
}
