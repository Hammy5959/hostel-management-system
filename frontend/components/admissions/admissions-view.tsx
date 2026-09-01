"use client";

import { useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Calendar,
  ClipboardList,
  Hourglass,
  Notebook,
  Plus,
  Search,
  ShieldOff,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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
import { StatusBadge, type Tone } from "@/components/hostel/status-badge";
import { usePermissions, markPermissionDenied } from "@/lib/permissions";
import {
  ApiError,
  approveAdmission,
  cancelAdmission,
  getAdmissions,
  rejectAdmission,
} from "@/lib/api";
import type { AdmissionFull, AdmissionFullStatus } from "@/lib/types";
import { NewAdmissionDialog } from "@/components/admissions/new-admission-dialog";
import { RejectAdmissionDialog } from "@/components/admissions/reject-admission-dialog";

const STATUS_OPTIONS: { value: AdmissionFullStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const ADMISSION_STATUS_TONE: Record<AdmissionFullStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
};

const STRIP_COLOR: Record<AdmissionFullStatus, string> = {
  pending: "bg-amber-400",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  cancelled: "bg-outline",
};

function initials(firstName: string, lastName: string | null): string {
  return [firstName, lastName]
    .filter(Boolean)
    .map((part) => part![0]!.toUpperCase())
    .join("");
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
  iconClassName,
  label,
  value,
}: {
  icon: typeof Award;
  iconClassName: string;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface-variant">{label}</h3>
        <div className={cn("flex size-10 items-center justify-center rounded-full", iconClassName)}>
          <Icon aria-hidden className="size-5" />
        </div>
      </div>
      {value === undefined ? (
        <Skeleton className="h-10 w-20" />
      ) : (
        <p className="text-[40px] leading-none font-bold text-on-surface">{value}</p>
      )}
    </div>
  );
}

function AdmissionCard({
  admission,
  canApprove,
  canReject,
  canCancel,
  onApprove,
  onReject,
  onCancel,
}: {
  admission: AdmissionFull;
  canApprove: boolean;
  canReject: boolean;
  canCancel: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const resident = admission.resident;
  const name = resident
    ? [resident.first_name, resident.last_name].filter(Boolean).join(" ")
    : "Unknown resident";
  const contextLine = resident
    ? [resident.institution, resident.semester].filter(Boolean).join(" • ")
    : "—";
  const isPending = admission.status === "pending";
  const showActions = isPending && (canApprove || canReject || canCancel);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm transition-shadow hover:shadow-md">
      <div className={cn("absolute inset-y-0 left-0 w-1", STRIP_COLOR[admission.status])} />

      <div className="flex items-start justify-between border-b border-outline-variant/50 p-5 pl-6">
        <div>
          <h3 className="text-lg font-semibold text-on-surface">{admission.admission_number}</h3>
          <p className="mt-1 text-xs text-on-surface-variant">
            Application Date: {formatDate(admission.application_date)}
          </p>
        </div>
        <StatusBadge status={admission.status} tone={ADMISSION_STATUS_TONE[admission.status]} />
      </div>

      <div className="flex-1 p-5 pl-6">
        <div className="mb-4 flex items-center gap-3">
          <Avatar className="size-11 border border-outline-variant">
            <AvatarImage src={resident?.profile_picture_url ?? undefined} alt={name} />
            <AvatarFallback className="bg-secondary-container text-sm font-bold text-on-secondary-container">
              {resident ? initials(resident.first_name, resident.last_name) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-on-surface">{name}</p>
            <p className="truncate text-xs text-on-surface-variant">{contextLine}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 text-on-surface-variant">
            <Calendar aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm">
              <span className="block font-medium text-on-surface">Admission Date</span>
              {formatDate(admission.admission_date)}
            </p>
          </div>
          {admission.notes && (
            <div className="flex items-start gap-3 text-on-surface-variant">
              <Notebook aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p className="line-clamp-2 text-sm">{admission.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-outline-variant/50 bg-surface-container-low p-4 pl-6">
        {showActions ? (
          <>
            {canCancel && (
              <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {canReject && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={onReject}
              >
                Reject
              </Button>
            )}
            {canApprove && (
              <Button
                type="button"
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={onApprove}
              >
                Approve
              </Button>
            )}
          </>
        ) : (
          <Link
            href={`/residents/${admission.resident_id}?tab=admissions`}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-primary transition-colors hover:bg-surface-container"
          >
            View Detail
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

export function AdmissionsView() {
  const { has } = usePermissions();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [newOpen, setNewOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<AdmissionFull | null>(null);
  const [approveTarget, setApproveTarget] = useState<AdmissionFull | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdmissionFull | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canCreate = has("admissions.create");
  const canApprove = has("admissions.approve");
  const canReject = has("admissions.reject");
  const canCancel = has("admissions.update");

  const query = useQuery({
    queryKey: ["admissions", { page, perPage, search, status }],
    queryFn: () =>
      getAdmissions({
        page,
        per_page: perPage,
        search: search || undefined,
        status: status || undefined,
      }),
  });

  const totalQuery = useQuery({
    queryKey: ["admissions-count", "all"],
    queryFn: () => getAdmissions({ per_page: 1 }),
    staleTime: 60_000,
  });
  const pendingQuery = useQuery({
    queryKey: ["admissions-count", "pending"],
    queryFn: () => getAdmissions({ per_page: 1, status: "pending" }),
    staleTime: 60_000,
  });
  const approvedQuery = useQuery({
    queryKey: ["admissions-count", "approved"],
    queryFn: () => getAdmissions({ per_page: 1, status: "approved" }),
    staleTime: 60_000,
  });
  const rejectedQuery = useQuery({
    queryKey: ["admissions-count", "rejected"],
    queryFn: () => getAdmissions({ per_page: 1, status: "rejected" }),
    staleTime: 60_000,
  });

  function invalidateAfterAction() {
    queryClient.invalidateQueries({ queryKey: ["admissions"] });
    queryClient.invalidateQueries({ queryKey: ["admissions-count"] });
    queryClient.invalidateQueries({ queryKey: ["residents"] });
    queryClient.invalidateQueries({ queryKey: ["resident"] });
    queryClient.invalidateQueries({ queryKey: ["resident-admissions"] });
  }

  async function handleApprove() {
    if (!approveTarget) return;
    setActionLoading(true);
    try {
      await approveAdmission(approveTarget.id);
      toast.success("Admission approved. Resident is now active.");
      invalidateAfterAction();
      setApproveTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("admissions.approve");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(notes: string) {
    if (!rejectTarget) return;
    setActionLoading(true);
    try {
      await rejectAdmission(rejectTarget.id, notes || undefined);
      toast.success("Admission rejected.");
      invalidateAfterAction();
      setRejectTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("admissions.reject");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setActionLoading(true);
    try {
      await cancelAdmission(cancelTarget.id);
      toast.success("Admission cancelled.");
      invalidateAfterAction();
      setCancelTarget(null);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("admissions.update");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const items = query.data?.items ?? [];
  const forbidden =
    query.error instanceof ApiError && query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Residents & Admissions" }, { label: "Admissions" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Admissions
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Manage admission applications, approvals, and status.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={() => setNewOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              New Admission
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          iconClassName="bg-primary/10 text-primary"
          label="Total Admissions"
          value={totalQuery.data?.total}
        />
        <StatCard
          icon={Hourglass}
          iconClassName="bg-amber-50 text-amber-600"
          label="Pending"
          value={pendingQuery.data?.total}
        />
        <StatCard
          icon={Award}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Approved"
          value={approvedQuery.data?.total}
        />
        <StatCard
          icon={XCircle}
          iconClassName="bg-red-50 text-red-600"
          label="Rejected"
          value={rejectedQuery.data?.total}
        />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 lg:flex-row lg:items-center">
        <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-on-surface-variant"
            />
            <Input
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value
                setSearchInput(value)
                // Clearing the box resets the list immediately — only a
                // non-empty search term needs an explicit Search click.
                if (value.trim() === "") {
                  setPage(1)
                  setSearch("")
                }
              }}
              placeholder="Search by admission number…"
              aria-label="Search admissions"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <Select
          value={status || "all"}
          onValueChange={(value) => {
            setStatus(!value || value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container lg:w-44">
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
      </div>

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Admissions"
          description="Ask an administrator to grant you the admissions.view permission."
        />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No admissions found"
          description={
            search || status
              ? "No admissions match your filters."
              : "Create your first admission application to get started."
          }
          action={canCreate ? { label: "New Admission", onClick: () => setNewOpen(true) } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {items.map((admission) => (
                <AdmissionCard
                  key={admission.id}
                  admission={admission}
                  canApprove={canApprove}
                  canReject={canReject}
                  canCancel={canCancel}
                  onApprove={() => setApproveTarget(admission)}
                  onReject={() => setRejectTarget(admission)}
                  onCancel={() => setCancelTarget(admission)}
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

      <NewAdmissionDialog open={newOpen} onOpenChange={setNewOpen} />

      <RejectAdmissionDialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        admission={rejectTarget}
        loading={actionLoading}
        onConfirm={handleReject}
      />

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title="Approve admission"
        description={`Approving ${approveTarget?.admission_number ?? "this admission"} will set the resident's status to active. Continue?`}
        confirmLabel="Approve"
        loading={actionLoading}
        onConfirm={handleApprove}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel admission"
        description={`Cancel ${cancelTarget?.admission_number ?? "this admission"}? This cannot be undone.`}
        confirmLabel="Cancel Admission"
        destructive
        loading={actionLoading}
        onConfirm={handleCancel}
      />
    </div>
  );
}
