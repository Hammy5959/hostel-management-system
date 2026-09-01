"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  Calendar,
  ChevronRight,
  ClipboardPlus,
  DoorOpen,
  GraduationCap,
  HeartPulse,
  LogOut,
  Pencil,
  ShieldOff,
  User,
  UserCheck,
  Users,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ConfirmDialog } from "@/components/hostel/confirm-dialog";
import { EmptyState } from "@/components/hostel/empty-state";
import { ErrorState } from "@/components/hostel/error-state";
import { StatusBadge, type Tone } from "@/components/hostel/status-badge";
import { usePermissions, markPermissionDenied } from "@/lib/permissions";
import {
  ApiError,
  checkoutResident,
  getAdmissions,
  getAllocations,
  getResident,
  markResidentReturned,
} from "@/lib/api";
import type { AdmissionFullStatus, Allocation, AllocationStatus, Resident, ResidentStatus } from "@/lib/types";
import { ResidentFormDialog } from "@/components/residents/resident-form-dialog";
import { CheckoutResidentDialog } from "@/components/residents/checkout-resident-dialog";

const RESIDENT_STATUS_TONE: Record<ResidentStatus, Tone> = {
  applicant: "info",
  active: "success",
  on_leave: "warning",
  checked_out: "neutral",
  inactive: "danger",
};

const DETAIL_TABS = ["profile", "allocation", "admissions"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function isDetailTab(value: string | null): value is DetailTab {
  return !!value && (DETAIL_TABS as readonly string[]).includes(value);
}

const ADMISSION_STATUS_TONE: Record<AdmissionFullStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "danger",
};

const ALLOCATION_STATUS_TONE: Record<AllocationStatus, Tone> = {
  active: "success",
  transferred: "info",
  completed: "neutral",
  cancelled: "danger",
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

function InfoRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
        {label}
      </dt>
      <dd className="text-sm text-on-surface">{value || "—"}</dd>
    </div>
  );
}

function ProfileTab({ resident }: { resident: Resident }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
          <User aria-hidden className="size-5 text-primary" />
          Personal Information
        </h3>
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
          <InfoRow label="Date of Birth" value={formatDate(resident.date_of_birth)} />
          <InfoRow label="Gender" value={resident.gender} />
          <InfoRow className="md:col-span-2" label="Email" value={resident.email} />
          <InfoRow className="md:col-span-2" label="Phone" value={resident.phone} />
          <InfoRow className="md:col-span-2" label="Address" value={resident.address} />
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
          <GraduationCap aria-hidden className="size-5 text-primary" />
          Academic Information
        </h3>
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
          <InfoRow label="Student ID" value={resident.student_id} />
          <InfoRow label="Institution" value={resident.institution} />
          <InfoRow className="md:col-span-2" label="Department" value={resident.department} />
          <InfoRow label="Program" value={resident.program} />
          <InfoRow label="Semester" value={resident.semester} />
        </div>
      </div>

      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-on-surface">
          <Users aria-hidden className="size-5 text-primary" />
          Guardian Information
        </h3>
        <div className="grid grid-cols-1 gap-y-6">
          <div className="flex items-center justify-between border-b border-outline-variant/60 pb-4">
            <InfoRow label="Name" value={resident.guardian_name} />
            <InfoRow className="text-right" label="Relationship" value={resident.guardian_relationship} />
          </div>
          <InfoRow label="Phone" value={resident.guardian_phone} />
          <InfoRow label="Address" value={resident.guardian_address} />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-red-200 bg-red-50 p-6">
        <HeartPulse
          aria-hidden
          className="absolute top-0 right-0 size-24 translate-x-2 -translate-y-2 text-red-600/10"
        />
        <h3 className="relative mb-6 flex items-center gap-2 text-lg font-semibold text-red-700">
          <HeartPulse aria-hidden className="size-5 text-red-700" />
          Emergency Contact
        </h3>
        <div className="relative grid grid-cols-1 gap-y-6">
          <div className="flex items-center justify-between border-b border-red-200 pb-4">
            <div>
              <dt className="mb-1 text-xs font-semibold tracking-wider text-red-800/80 uppercase">
                Name
              </dt>
              <dd className="text-sm font-medium text-red-900">
                {resident.emergency_contact_name || "—"}
              </dd>
            </div>
            <div className="text-right">
              <dt className="mb-1 text-xs font-semibold tracking-wider text-red-800/80 uppercase">
                Relationship
              </dt>
              <dd className="text-sm text-red-900">
                {resident.emergency_contact_relationship || "—"}
              </dd>
            </div>
          </div>
          <div>
            <dt className="mb-1 text-xs font-semibold tracking-wider text-red-800/80 uppercase">
              Phone
            </dt>
            <dd className="text-lg font-bold text-red-900">
              {resident.emergency_contact_phone || "—"}
            </dd>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAYMENT_STATUS_TEXT_TONE: Record<string, string> = {
  paid: "text-emerald-700",
  no_dues: "text-on-surface-variant",
  pending: "text-amber-700",
  overdue: "text-destructive",
};

function AllocationCard({ allocation }: { allocation: Allocation }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <DoorOpen aria-hidden className="size-5 text-primary" />
          Current Allocation
        </h3>
        <StatusBadge status={allocation.status} tone={ALLOCATION_STATUS_TONE[allocation.status]} />
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-6 md:grid-cols-2">
        <InfoRow label="Building" value={allocation.room?.building_name} />
        <InfoRow label="Floor" value={allocation.room?.floor_name} />
        <InfoRow
          label="Room"
          value={
            allocation.room?.room_number ? (
              <span className="inline-flex items-center gap-1.5">
                <DoorOpen aria-hidden className="size-4 text-primary" />
                {allocation.room.room_number}
              </span>
            ) : undefined
          }
        />
        <InfoRow
          label="Bed"
          value={
            allocation.bed?.bed_number ? (
              <span className="inline-flex items-center gap-1.5">
                <BedDouble aria-hidden className="size-4 text-primary" />
                {allocation.bed.bed_number}
              </span>
            ) : undefined
          }
        />
        <InfoRow
          label="Allocated From"
          value={
            <span className="inline-flex items-center gap-1.5">
              <Calendar aria-hidden className="size-4 text-outline" />
              {formatDate(allocation.allocated_from)}
            </span>
          }
        />
        {allocation.payment_status && (
          <div>
            <dt className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
              Payment Status
            </dt>
            <dd
              className={
                "text-sm font-medium " +
                (PAYMENT_STATUS_TEXT_TONE[allocation.payment_status.status] ?? "text-on-surface")
              }
            >
              {allocation.payment_status.label}
            </dd>
          </div>
        )}
      </div>
    </div>
  );
}

function AllocationTab({ residentId }: { residentId: string }) {
  const currentQuery = useQuery({
    queryKey: ["allocations", { residentId, active: true }],
    queryFn: () => getAllocations({ resident_id: residentId, active_only: true, per_page: 1 }),
  });
  const historyQuery = useQuery({
    queryKey: ["allocations", { residentId, history: true }],
    queryFn: () => getAllocations({ resident_id: residentId, per_page: 50 }),
  });

  const forbidden =
    currentQuery.error instanceof ApiError && currentQuery.error.code === "missing_permission";
  const current = currentQuery.data?.items[0];
  const history = historyQuery.data?.items ?? [];

  if (forbidden) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="You don't have access to allocations"
        description="Ask an administrator to grant you the allocations.view permission."
      />
    );
  }

  return (
    <div className="space-y-6">
      {currentQuery.isError ? (
        <ErrorState message={(currentQuery.error as Error).message} onRetry={() => currentQuery.refetch()} />
      ) : currentQuery.isLoading ? (
        <Skeleton className="h-56 w-full rounded-xl" />
      ) : current ? (
        <AllocationCard allocation={current} />
      ) : (
        <EmptyState
          icon={DoorOpen}
          title="No active allocation"
          description="This resident does not currently hold a room allocation."
        />
      )}

      <div>
        <h3 className="mb-4 text-sm font-semibold text-on-surface-variant uppercase">Allocation History</h3>
        {historyQuery.isError ? (
          <ErrorState message={(historyQuery.error as Error).message} onRetry={() => historyQuery.refetch()} />
        ) : historyQuery.isLoading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : history.length === 0 ? (
          <EmptyState icon={DoorOpen} title="No allocation history" description="This resident has never been allocated a bed." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Bed</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Until</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((allocation) => (
                  <TableRow key={allocation.id}>
                    <TableCell className="font-medium text-on-surface">
                      {allocation.room?.room_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-on-surface-variant">
                      {allocation.bed?.bed_number ?? "—"}
                    </TableCell>
                    <TableCell className="text-on-surface-variant">
                      {formatDate(allocation.allocated_from)}
                    </TableCell>
                    <TableCell className="text-on-surface-variant">
                      {formatDate(allocation.allocated_until)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={allocation.status} tone={ALLOCATION_STATUS_TONE[allocation.status]} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function AdmissionsTab({ residentId }: { residentId: string }) {
  const query = useQuery({
    queryKey: ["resident-admissions", residentId],
    queryFn: () => getAdmissions({ resident_id: residentId, per_page: 100 }),
  });

  const forbidden =
    query.error instanceof ApiError && query.error.code === "missing_permission";
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to admissions"
          description="Ask an administrator to grant you the admissions.view permission."
        />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ClipboardPlus}
          title="No admissions on record"
          description="This resident has no admission applications yet."
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admission #</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Admitted</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((admission) => (
                <TableRow key={admission.id}>
                  <TableCell className="font-medium text-on-surface">
                    {admission.admission_number}
                  </TableCell>
                  <TableCell className="text-on-surface-variant">
                    {formatDate(admission.application_date)}
                  </TableCell>
                  <TableCell className="text-on-surface-variant">
                    {formatDate(admission.admission_date)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={admission.status}
                      tone={ADMISSION_STATUS_TONE[admission.status]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function ResidentDetailView({ residentId }: { residentId: string }) {
  const { has } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [markReturnedOpen, setMarkReturnedOpen] = useState(false);
  const [markReturnedLoading, setMarkReturnedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>(() => {
    const tab = searchParams.get("tab");
    return isDetailTab(tab) ? tab : "profile";
  });

  const canEdit = has("residents.update");
  const canCheckout = has("residents.checkout");
  const canMarkReturned = has("residents.mark_returned");

  const query = useQuery({
    queryKey: ["resident", residentId],
    queryFn: () => getResident(residentId),
  });

  // Shared with AllocationTab's current-allocation query (same key) so
  // react-query dedupes the fetch — the checkout dialog needs the active
  // allocation for its room/bed summary and dues warning.
  const activeAllocationQuery = useQuery({
    queryKey: ["allocations", { residentId, active: true }],
    queryFn: () => getAllocations({ resident_id: residentId, active_only: true, per_page: 1 }),
  });

  async function handleCheckoutConfirm(reason: string) {
    setCheckoutLoading(true);
    try {
      await checkoutResident(residentId, { reason: reason.trim() || undefined });
      toast.success("Resident checked out.");
      queryClient.invalidateQueries({ queryKey: ["resident", residentId] });
      queryClient.invalidateQueries({ queryKey: ["residents"] });
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setCheckoutOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("residents.checkout");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleMarkReturnedConfirm() {
    setMarkReturnedLoading(true);
    try {
      await markResidentReturned(residentId);
      toast.success("Resident marked as returned.");
      queryClient.invalidateQueries({ queryKey: ["resident", residentId] });
      queryClient.invalidateQueries({ queryKey: ["residents"] });
      queryClient.invalidateQueries({ queryKey: ["allocations"] });
      setMarkReturnedOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") markPermissionDenied("residents.mark_returned");
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setMarkReturnedLoading(false);
    }
  }

  const forbidden =
    query.error instanceof ApiError && query.error.code === "missing_permission";
  const notFound =
    query.error instanceof ApiError && query.error.code === "resident_not_found";

  if (forbidden) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="You don't have access to this resident"
        description="Ask an administrator to grant you the residents.view permission."
      />
    );
  }

  if (notFound) {
    return (
      <EmptyState
        icon={UserRound}
        title="Resident not found"
        description="This resident may have been removed. Go back to Residents and try again."
        action={{ label: "Back to Residents", onClick: () => router.push("/residents") }}
      />
    );
  }

  if (query.isError) {
    return (
      <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
    );
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const resident = query.data;
  const name = [resident.first_name, resident.last_name].filter(Boolean).join(" ");
  const subline = [
    resident.student_id ? `ID: ${resident.student_id}` : null,
    resident.program,
    resident.semester,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="space-y-8">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center text-xs font-semibold tracking-wide text-on-surface-variant uppercase"
      >
        <ol className="inline-flex items-center gap-1">
          <li>
            <span>Residents &amp; Admissions</span>
          </li>
          <li className="inline-flex items-center gap-1">
            <ChevronRight aria-hidden className="size-4" />
            <Link href="/residents" className="transition-colors hover:text-primary">
              Residents
            </Link>
          </li>
          <li className="inline-flex items-center gap-1" aria-current="page">
            <ChevronRight aria-hidden className="size-4" />
            <span className="font-bold text-primary">{name}</span>
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-6">
          <Avatar className="size-24 border-2 border-surface-container-low">
            <AvatarImage src={resident.profile_picture_url ?? undefined} alt={name} />
            <AvatarFallback className="bg-secondary-container text-2xl font-bold text-on-secondary-container">
              {initials(resident.first_name, resident.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="mb-1 flex items-center gap-3">
              <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
                {name}
              </h1>
              <StatusBadge status={resident.status} tone={RESIDENT_STATUS_TONE[resident.status]} />
            </div>
            <p className="text-sm text-on-surface-variant">{subline || "—"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 self-start md:self-auto">
          {canMarkReturned && resident.status === "on_leave" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setMarkReturnedOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium"
            >
              <UserCheck aria-hidden className="size-4" />
              Mark Returned
            </Button>
          )}
          {canCheckout && (resident.status === "active" || resident.status === "on_leave") && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCheckoutOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium text-destructive hover:bg-destructive/5"
            >
              <LogOut aria-hidden className="size-4" />
              Check Out
            </Button>
          )}
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium"
            >
              <Pencil aria-hidden className="size-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => isDetailTab(value) && setActiveTab(value)}
      >
        <div className="border-b border-outline-variant">
          <TabsList variant="line" className="h-auto justify-start gap-8 bg-transparent p-0">
            <TabsTrigger
              value="profile"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="allocation"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Allocation
            </TabsTrigger>
            <TabsTrigger
              value="admissions"
              className="rounded-none border-none px-1 py-4 text-sm font-medium text-on-surface-variant data-active:font-bold data-active:text-primary data-active:after:bg-primary"
            >
              Admissions
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="profile" className="pt-6">
          <ProfileTab resident={resident} />
        </TabsContent>
        <TabsContent value="allocation" className="pt-6">
          <AllocationTab residentId={resident.id} />
        </TabsContent>
        <TabsContent value="admissions" className="pt-6">
          <AdmissionsTab residentId={resident.id} />
        </TabsContent>
      </Tabs>

      <ResidentFormDialog open={editOpen} onOpenChange={setEditOpen} resident={resident} />

      <CheckoutResidentDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        resident={resident}
        allocation={activeAllocationQuery.data?.items[0] ?? null}
        loading={checkoutLoading}
        onConfirm={handleCheckoutConfirm}
      />

      <ConfirmDialog
        open={markReturnedOpen}
        onOpenChange={setMarkReturnedOpen}
        title="Mark as returned"
        description={`Mark ${name} as returned from leave? Their status will change back to active.`}
        confirmLabel="Mark Returned"
        loading={markReturnedLoading}
        onConfirm={handleMarkReturnedConfirm}
      />
    </div>
  );
}
