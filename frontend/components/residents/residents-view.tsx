"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutGrid,
  List,
  Phone,
  Plus,
  Search,
  ShieldOff,
  UserCheck,
  UserRound,
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
import { StatusBadge, type Tone } from "@/components/hostel/status-badge";
import { usePermissions } from "@/lib/permissions";
import { ApiError, getResidentInstitutions, getResidents } from "@/lib/api";
import type { Resident, ResidentStatus } from "@/lib/types";
import {
  RESIDENT_STATUS_OPTIONS,
  ResidentFormDialog,
} from "@/components/residents/resident-form-dialog";

const RESIDENT_STATUS_TONE: Record<ResidentStatus, Tone> = {
  applicant: "info",
  active: "success",
  on_leave: "warning",
  checked_out: "neutral",
  inactive: "danger",
};

function initials(firstName: string, lastName: string | null): string {
  return [firstName, lastName]
    .filter(Boolean)
    .map((part) => part![0]!.toUpperCase())
    .join("");
}

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof Users;
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
        <p className="text-[32px] leading-none font-bold text-on-surface">{value.toLocaleString()}</p>
      )}
    </div>
  );
}

function ResidentCard({
  resident,
  onOpen,
}: {
  resident: Resident;
  onOpen: () => void;
}) {
  const isCheckedOut = resident.status === "checked_out";
  const name = [resident.first_name, resident.last_name].filter(Boolean).join(" ");

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm transition-shadow hover:shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.05)]">
      <div className="mb-6 flex items-start justify-between gap-2">
        <div className="flex items-center gap-4">
          <Avatar className="size-14 border-2 border-surface-container-low">
            <AvatarImage src={resident.profile_picture_url ?? undefined} alt={name} />
            <AvatarFallback className="bg-secondary-container text-base font-bold text-on-secondary-container">
              {initials(resident.first_name, resident.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h3
              className={cn(
                "text-xl font-semibold text-on-surface",
                isCheckedOut && "text-on-surface/60",
              )}
            >
              {name}
            </h3>
            <span className="text-xs font-semibold text-on-surface-variant">
              {resident.student_id ? `ID: ${resident.student_id}` : "—"}
            </span>
          </div>
        </div>
        <StatusBadge status={resident.status} tone={RESIDENT_STATUS_TONE[resident.status]} />
      </div>

      <div className={cn("mb-6 flex-1 space-y-3", isCheckedOut && "opacity-70")}>
        <div className="flex items-start gap-3">
          <GraduationCap aria-hidden className="mt-0.5 size-5 shrink-0 text-outline" />
          <div>
            <p className="text-sm text-on-surface">{resident.program || "—"}</p>
            <p className="text-xs text-on-surface-variant">{resident.semester || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Building2 aria-hidden className="size-5 shrink-0 text-outline" />
          <p className="text-sm text-on-surface">{resident.institution || "—"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Phone aria-hidden className="size-5 shrink-0 text-outline" />
          <p className="text-sm text-on-surface">{resident.phone || "—"}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "w-full rounded-lg border border-outline-variant py-2.5 text-sm font-medium transition-colors hover:bg-surface-container-low",
          isCheckedOut ? "text-on-surface-variant" : "text-primary",
        )}
      >
        {isCheckedOut ? "View Record" : "View Profile"}
      </button>
    </div>
  );
}

function ResidentListRow({
  resident,
  onOpen,
}: {
  resident: Resident;
  onOpen: () => void;
}) {
  const name = [resident.first_name, resident.last_name].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 border-b border-outline-variant px-5 py-4 text-left transition-colors last:border-0 hover:bg-surface-container-low/60"
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-9">
          <AvatarImage src={resident.profile_picture_url ?? undefined} alt={name} />
          <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
            {initials(resident.first_name, resident.last_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-on-surface">{name}</p>
          <p className="text-xs text-on-surface-variant">
            {resident.student_id ? `ID: ${resident.student_id}` : "—"}
            {resident.institution ? ` · ${resident.institution}` : ""}
          </p>
        </div>
      </div>
      <StatusBadge status={resident.status} tone={RESIDENT_STATUS_TONE[resident.status]} />
    </button>
  );
}

export function ResidentsView() {
  const { has } = usePermissions();
  const router = useRouter();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<string>("");
  const [institution, setInstitution] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const canCreate = has("residents.create");
  const canViewResidents = has("residents.view");

  const query = useQuery({
    queryKey: ["residents", { page, perPage, search, status, institution }],
    queryFn: () =>
      getResidents({
        page,
        per_page: perPage,
        search: search || undefined,
        status: status || undefined,
        institution: institution || undefined,
      }),
  });

  const institutionsQuery = useQuery({
    queryKey: ["resident-institutions"],
    queryFn: getResidentInstitutions,
    staleTime: 5 * 60_000,
  });

  const residentItems = query.data?.items ?? [];
  const summary = query.data?.summary;

  function openCreate() {
    setDialogOpen(true);
  }

  function openDetail(resident: Resident) {
    router.push(`/residents/${resident.id}`);
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
        <Breadcrumbs items={[{ label: "Residents & Admissions" }, { label: "Residents" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Residents
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              Manage all residents, their profiles, documents, and status.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Add Resident
            </Button>
          )}
        </div>
      </div>

      {canViewResidents && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {query.isLoading || !summary ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))
          ) : (
            <>
              <StatCard
                icon={Users}
                iconClassName="bg-primary/10 text-primary"
                label="Total Residents"
                value={summary.total}
              />
              <StatCard
                icon={UserCheck}
                iconClassName="bg-emerald-50 text-emerald-600"
                label="Active"
                value={summary.active}
              />
              <StatCard
                icon={CalendarDays}
                iconClassName="bg-blue-50 text-blue-600"
                label="On Leave"
                value={summary.on_leave}
              />
              <StatCard
                icon={ClipboardList}
                iconClassName="bg-amber-50 text-amber-600"
                label="Applicants"
                value={summary.applicant}
              />
            </>
          )}
        </div>
      )}

      {/* Filters bar */}
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
                const value = e.target.value;
                setSearchInput(value);
                // Clearing the box resets the list immediately — only a
                // non-empty search term needs an explicit Search click.
                if (value.trim() === "") {
                  setPage(1);
                  setSearch("");
                }
              }}
              placeholder="Search by name, student ID, email, or phone…"
              aria-label="Search residents"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
            Search
          </Button>
        </form>

        <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:flex-none">
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
              {RESIDENT_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={institution || "all"}
            onValueChange={(value) => {
              setInstitution(!value || value === "all" ? "" : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-48">
              <SelectValue placeholder="Institution: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Institution: All</SelectItem>
              {(institutionsQuery.data ?? []).map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 border-outline-variant lg:border-l lg:pl-4">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded-md p-2 transition-colors",
              viewMode === "grid"
                ? "bg-surface-container-high text-primary"
                : "text-on-surface-variant hover:bg-surface-container",
            )}
          >
            <LayoutGrid aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className={cn(
              "rounded-md p-2 transition-colors",
              viewMode === "list"
                ? "bg-surface-container-high text-primary"
                : "text-on-surface-variant hover:bg-surface-container",
            )}
          >
            <List aria-hidden className="size-5" />
          </button>
        </div>
      </div>

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Residents"
          description="Ask an administrator to grant you the residents.view permission."
        />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-2xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No residents found"
          description={
            search || status || institution
              ? "No residents match your filters."
              : "Add your first resident to get started."
          }
          action={
            canCreate ? { label: "Add Resident", onClick: openCreate } : undefined
          }
        />
      ) : (
        query.data && (
          <>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {residentItems.map((resident) => (
                  <ResidentCard
                    key={resident.id}
                    resident={resident}
                    onOpen={() => openDetail(resident)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                {residentItems.map((resident) => (
                  <ResidentListRow
                    key={resident.id}
                    resident={resident}
                    onOpen={() => openDetail(resident)}
                  />
                ))}
              </div>
            )}

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

      <ResidentFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
