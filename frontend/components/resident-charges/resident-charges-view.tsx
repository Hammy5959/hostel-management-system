"use client";

import { useState, type SubmitEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Pencil,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldOff,
} from "lucide-react";

import { cn, formatCurrency } from "@/lib/utils";
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
import { usePermissions } from "@/lib/permissions";
import { ApiError, getResidentCharges } from "@/lib/api";
import type { ResidentCharge, ResidentChargeStatus } from "@/lib/types";
import {
  RESIDENT_CHARGE_STATUS_OPTIONS,
  ResidentChargeFormDialog,
} from "@/components/resident-charges/resident-charge-form-dialog";
import { ResidentChargeDetailDialog } from "@/components/resident-charges/resident-charge-detail-dialog";

const STATUS_TONE: Record<ResidentChargeStatus, string> = {
  pending: "border-amber-200 bg-amber-100 text-amber-800",
  invoiced: "border-blue-200 bg-blue-100 text-blue-800",
  paid: "border-emerald-200 bg-emerald-100 text-emerald-800",
  partially_paid: "border-yellow-200 bg-yellow-100 text-yellow-800",
  waived: "border-gray-200 bg-gray-100 text-gray-600",
  cancelled: "border-gray-200 bg-gray-100 text-gray-600",
  overdue: "border-error/30 bg-error-container text-on-error-container",
};

const STATUS_LABEL: Record<ResidentChargeStatus, string> = {
  pending: "Pending",
  invoiced: "Invoiced",
  paid: "Paid",
  partially_paid: "Partially Paid",
  waived: "Waived",
  cancelled: "Cancelled",
  overdue: "Overdue",
};

function initials(firstName: string, lastName: string | null): string {
  return `${firstName[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();
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

function StatCard({
  icon: Icon,
  chipClassName,
  label,
  value,
}: {
  icon: typeof Receipt;
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

/** The card's amount/footer treatment depends purely on status (pending,
 * invoiced, paid, overdue, waived, cancelled) — charges are invoice-level
 * only, so there is no per-charge partially-paid state to render. */
function ChargeFooter({ charge }: { charge: ResidentCharge }) {
  const status = charge.status as ResidentChargeStatus;

  const amountClass =
    status === "overdue"
      ? "text-error"
      : status === "waived" || status === "cancelled"
        ? "text-on-surface-variant line-through"
        : "text-primary";

  const dateLabel =
    status === "paid"
      ? `Paid: ${formatDate(charge.updated_at)}`
      : status === "waived"
        ? `Waived: ${formatDate(charge.updated_at)}`
        : status === "cancelled"
          ? `Cancelled: ${formatDate(charge.updated_at)}`
          : charge.due_date
            ? `Due: ${formatDate(charge.due_date)}`
            : "No due date";

  return (
    <div>
      <div className={cn("text-lg font-bold", amountClass)}>{formatCurrency(charge.amount)}</div>
      <div className={cn("mt-1 text-xs", status === "overdue" ? "text-error" : "text-on-surface-variant")}>
        {dateLabel}
      </div>
    </div>
  );
}

function ChargeCard({
  charge,
  canManage,
  onEdit,
  onView,
}: {
  charge: ResidentCharge;
  canManage: boolean;
  onEdit: () => void;
  onView: () => void;
}) {
  const status = charge.status as ResidentChargeStatus;
  const resident = charge.resident;
  const residentName = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const muted = status === "waived" || status === "cancelled";

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-sm transition-shadow hover:shadow-md",
        muted && "opacity-75",
      )}
    >
      {status === "overdue" && <div className="absolute inset-y-0 left-0 w-1 bg-error" />}
      <div className={cn("mb-4 flex items-start justify-between gap-3", status === "overdue" && "pl-2")}>
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 border border-outline-variant">
            <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={residentName} />
            <AvatarFallback>{resident ? initials(resident.first_name, resident.last_name) : "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3
              className={cn(
                "truncate text-sm font-bold text-on-surface",
                status === "waived" && "line-through decoration-on-surface-variant/50",
              )}
            >
              {residentName}
            </h3>
            <span className="truncate text-xs text-on-surface-variant">
              {charge.room_number ? `Room ${charge.room_number}` : "No room"}
            </span>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_TONE[status])}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <div className={cn("mb-4 flex-1", status === "overdue" && "pl-2")}>
        <div className={cn("mb-1 text-sm font-semibold text-on-surface", muted && "text-on-surface-variant")}>
          {charge.charge_type}
        </div>
        {charge.description && (
          <p className="line-clamp-2 text-sm text-on-surface-variant">{charge.description}</p>
        )}
      </div>

      <div className={cn("flex items-end justify-between border-t border-outline-variant pt-4", status === "overdue" && "pl-2")}>
        <ChargeFooter charge={charge} />
        {status === "paid" || status === "waived" || status === "cancelled" ? (
          <Button type="button" variant="outline" size="sm" onClick={onView}>
            View
          </Button>
        ) : (
          canManage && (
            <button
              type="button"
              aria-label="Edit charge"
              onClick={onEdit}
              className="shrink-0 rounded-lg p-2 text-primary transition-colors hover:bg-primary/10"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          )
        )}
      </div>
    </div>
  );
}

export function ResidentChargesView() {
  const { has } = usePermissions();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ResidentCharge | null>(null);
  const [viewing, setViewing] = useState<ResidentCharge | null>(null);

  const canCreate = has("resident_charges.create");
  const canUpdate = has("resident_charges.update");

  const query = useQuery({
    queryKey: ["resident-charges", { page, perPage, search, status }],
    queryFn: () =>
      getResidentCharges({
        page,
        per_page: perPage,
        search: search || undefined,
        status: status || undefined,
      }),
  });

  const items = query.data?.items ?? [];
  const summary = query.data?.summary;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(charge: ResidentCharge) {
    setEditing(charge);
    setDialogOpen(true);
  }

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Finance & Fees" }, { label: "Resident Charges" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Resident Charges
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Monitor and manage individual resident billing, one-time fees, and payment statuses.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Add Charge
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {query.isLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : (
          <>
            <StatCard
              icon={Receipt}
              chipClassName="bg-primary/10 text-primary"
              label="Total Charges"
              value={summary.total}
            />
            <StatCard
              icon={Clock}
              chipClassName="bg-amber-100 text-amber-700"
              label="Pending"
              value={summary.pending}
            />
            <StatCard
              icon={Send}
              chipClassName="bg-blue-100 text-blue-700"
              label="Invoiced"
              value={summary.invoiced}
            />
            <StatCard
              icon={CheckCircle2}
              chipClassName="bg-emerald-100 text-emerald-700"
              label="Paid"
              value={summary.paid}
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
                if (value.trim() === "") {
                  setPage(1);
                  setSearch("");
                }
              }}
              placeholder="Search by resident name or charge type…"
              aria-label="Search resident charges"
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
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-48">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              {RESIDENT_CHARGE_STATUS_OPTIONS.map((option) => (
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
          title="You don't have access to Resident Charges"
          description="Ask an administrator to grant you the resident_charges.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No charges found"
          description={
            search || status ? "No charges match your filters." : "Add your first resident charge to get started."
          }
          action={canCreate ? { label: "Add Charge", onClick: openCreate } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {items.map((charge) => (
                <ChargeCard
                  key={charge.id}
                  charge={charge}
                  canManage={canUpdate}
                  onEdit={() => openEdit(charge)}
                  onView={() => setViewing(charge)}
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

      <ResidentChargeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} charge={editing} />
      <ResidentChargeDetailDialog
        open={!!viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        charge={viewing}
      />
    </div>
  );
}
