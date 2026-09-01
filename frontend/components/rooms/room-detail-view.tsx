"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BedDouble,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  MoreVertical,
  Pencil,
  Plus,
  PlusCircle,
  ShieldOff,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/hostel/empty-state";
import { ErrorState } from "@/components/hostel/error-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions, markPermissionDenied } from "@/lib/permissions";
import { ApiError, getRoomDetail, updateBed } from "@/lib/api";
import type { BedStatus, Room, RoomDetailBed } from "@/lib/types";
import { RoomFormDialog } from "@/components/rooms/room-form-dialog";
import { AddBedDialog } from "@/components/rooms/add-bed-dialog";
import { EditBedDialog } from "@/components/rooms/edit-bed-dialog";
import { AssignBedDialog } from "@/components/rooms/assign-bed-dialog";
import { TransferBedDialog } from "@/components/rooms/transfer-bed-dialog";

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

/** Bespoke status pill for every bed status — pixel-matched to the Stitch
 * reference for occupied / vacant / cleaning, with a matching treatment
 * added for maintenance (not part of the Stitch reference). */
function BedStatusPill({ status }: { status: BedStatus }) {
  if (status === "occupied") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-variant px-3 py-1 text-xs font-semibold text-on-surface-variant">
        <span className="size-2 rounded-full bg-secondary" />
        Occupied
      </span>
    );
  }
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/20 bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        <span className="size-2 rounded-full bg-emerald-500" />
        Vacant
      </span>
    );
  }
  if (status === "cleaning") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-600/20 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        <span className="size-2 animate-pulse rounded-full bg-amber-500" />
        Cleaning in Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-error-container px-3 py-1 text-xs font-semibold text-on-error-container">
      <span className="size-2 rounded-full bg-destructive" />
      Under Maintenance
    </span>
  );
}

/** 3-dot menu shared by every bed card — edit-only, no delete option. Status
 * is read-only on the card itself; it's only ever changed inside the Edit
 * Bed modal this menu opens, so there is exactly one path to change it. */
function BedCardMenu({ canEdit, onEdit }: { canEdit: boolean; onEdit: () => void }) {
  if (!canEdit) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="More bed actions"
            className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high"
          />
        }
      >
        <MoreVertical aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil aria-hidden className="size-4" />
          Edit Bed
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OccupiedBedCard({
  bed,
  canTransfer,
  canManageStatus,
  onViewProfile,
  onTransfer,
  onEdit,
}: {
  bed: RoomDetailBed;
  canTransfer: boolean;
  canManageStatus: boolean;
  onViewProfile: () => void;
  onTransfer: () => void;
  onEdit: () => void;
}) {
  const resident = bed.resident;
  const contextParts = resident
    ? [resident.program, resident.semester].filter(Boolean)
    : [];
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant transition-colors hover:border-primary/50">
      <div className="flex items-center justify-between border-b border-outline-variant/50 bg-surface/50 p-6">
        <div className="flex items-center gap-3">
          <BedDouble aria-hidden className="size-7 text-on-surface-variant" />
          <h3 className="text-xl leading-7 font-semibold text-on-surface">
            Bed {bed.bed_number}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <BedStatusPill status={bed.status} />
          <BedCardMenu canEdit={canManageStatus} onEdit={onEdit} />
        </div>
      </div>

      <div className="p-6">
        {resident ? (
          <div className="flex items-start gap-4 mt-6">
            <Avatar className="size-16 border-2 border-surface-container-low">
              <AvatarImage
                src={resident.profile_picture_url ?? undefined}
                alt={[resident.first_name, resident.last_name].filter(Boolean).join(" ")}
              />
              <AvatarFallback>
                {initials(resident.first_name, resident.last_name)}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1 ">
              <h4 className="text-xl leading-7 font-semibold text-on-surface">
                {[resident.first_name, resident.last_name].filter(Boolean).join(" ")}
              </h4>
              <p className="mb-4 text-sm text-on-surface-variant">
                {[contextParts.join(", "), resident.student_id ? `ID: ${resident.student_id}` : null]
                  .filter(Boolean)
                  .join(" • ") || "—"}
              </p>

              <div className="mb-4 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                    Check-in Date
                  </span>
                  <p className="mt-1 text-sm text-on-surface">{formatDate(bed.check_in_date)}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                    Rent Status
                  </span>
                  <p
                    className={cn(
                      "mt-1 text-sm font-medium",
                      bed.rent_status?.status === "overdue"
                        ? "text-destructive"
                        : bed.rent_status?.status === "pending"
                          ? "text-amber-600"
                          : "text-emerald-600",
                    )}
                  >
                    {bed.rent_status?.label ?? "—"}
                  </p>
                </div>
              </div>

              <div className="flex gap-4 ml-6 mt-7">
                <button
                  type="button"
                  onClick={onViewProfile}
                  className="rounded-lg border border-primary/20 bg-surface px-4 py-2 text-sm text-primary transition-colors hover:bg-primary/5 hover:cursor-pointer"
                >
                  View Profile
                </button>
                {canTransfer && (
                  <button
                    type="button"
                    onClick={onTransfer}
                    className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-low hover:cursor-pointer"
                  >
                    Transfer
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">
            This bed is occupied, but no resident record is linked yet.
          </p>
        )}
      </div>
    </div>
  );
}

function VacantBedCard({
  bed,
  canAssign,
  canManageStatus,
  onAssign,
  onEdit,
}: {
  bed: RoomDetailBed;
  canAssign: boolean;
  canManageStatus: boolean;
  onAssign: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-600/30">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-emerald-600/5 to-transparent" />
      <div className="flex items-center justify-between border-b border-emerald-600/10 bg-emerald-50/50 p-6">
        <div className="flex items-center gap-3">
          <BedDouble aria-hidden className="size-7 text-emerald-600" />
          <h3 className="text-xl leading-7 font-semibold text-on-surface">
            Bed {bed.bed_number}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <BedStatusPill status={bed.status} />
          <BedCardMenu canEdit={canManageStatus} onEdit={onEdit} />
        </div>
      </div>

      <div className="flex min-h-55 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <UserPlus aria-hidden className="size-8" />
        </div>
        <h4 className="mb-2 text-xl leading-7 font-semibold text-on-surface">
          Ready for Assignment
        </h4>
        <p className="mb-6 max-w-xs text-sm text-on-surface-variant">
          This bed is cleaned, inspected, and ready for a new resident.
        </p>
        {canAssign && (
          <button
            type="button"
            onClick={onAssign}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white hover:cursor-pointer shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            <PlusCircle aria-hidden className="size-5" />
            Assign Bed
          </button>
        )}
      </div>
    </div>
  );
}

function CleaningBedCard({
  bed,
  canManageStatus,
  onMarkClean,
  onEdit,
}: {
  bed: RoomDetailBed;
  canManageStatus: boolean;
  onMarkClean: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-600/30">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-amber-600/5 to-transparent" />
      <div className="flex items-center justify-between border-b border-amber-600/10 bg-amber-50/50 p-6">
        <div className="flex items-center gap-3">
          <BedDouble aria-hidden className="size-7 text-amber-600" />
          <h3 className="text-xl leading-7 font-semibold text-on-surface">
            Bed {bed.bed_number}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <BedStatusPill status={bed.status} />
          <BedCardMenu canEdit={canManageStatus} onEdit={onEdit} />
        </div>
      </div>

      <div className="flex min-h-55 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Sparkles aria-hidden className="size-8" />
        </div>
        <h4 className="mb-2 text-xl leading-7 font-semibold text-on-surface">
          Cleaning in Progress
        </h4>
        <p className="mb-6 max-w-xs text-sm text-on-surface-variant">
          This bed is being turned over between residents. Mark it clean once it&apos;s ready for a
          new assignment.
        </p>
        {canManageStatus && (
          <button
            type="button"
            onClick={onMarkClean}
            className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Mark as Clean
          </button>
        )}
      </div>
    </div>
  );
}

function MaintenanceBedCard({
  bed,
  canManageStatus,
  onMarkAvailable,
  onEdit,
}: {
  bed: RoomDetailBed;
  canManageStatus: boolean;
  onMarkAvailable: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-destructive/30">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-destructive/5 to-transparent" />
      <div className="flex items-center justify-between border-b border-destructive/10 bg-error-container/30 p-6">
        <div className="flex items-center gap-3">
          <BedDouble aria-hidden className="size-7 text-destructive" />
          <h3 className="text-xl leading-7 font-semibold text-on-surface">
            Bed {bed.bed_number}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <BedStatusPill status={bed.status} />
          <BedCardMenu canEdit={canManageStatus} onEdit={onEdit} />
        </div>
      </div>

      <div className="flex min-h-55 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-error-container text-on-error-container">
          <Wrench aria-hidden className="size-8" />
        </div>
        <h4 className="mb-2 text-xl leading-7 font-semibold text-on-surface">
          Under Maintenance
        </h4>
        <p className="mb-6 max-w-xs text-sm text-on-surface-variant">
          This bed is currently under maintenance.
        </p>
        {canManageStatus && (
          <button
            type="button"
            onClick={onMarkAvailable}
            className="rounded-lg border border-outline-variant bg-surface px-4 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-low"
          >
            Mark as Available
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  chipClassName,
  label,
  value,
  valueClassName,
}: {
  icon: typeof BedDouble;
  chipClassName: string;
  label: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
      <div className={cn("flex size-12 items-center justify-center rounded-full", chipClassName)}>
        <Icon aria-hidden className="size-5" />
      </div>
      <div>
        <div className="text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
          {label}
        </div>
        <div
          className={cn(
            "text-[24px] leading-8 font-semibold tracking-[-0.01em] text-on-surface",
            valueClassName,
          )}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export function RoomDetailView({ roomId }: { roomId: string }) {
  const { has } = usePermissions();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [addBedOpen, setAddBedOpen] = useState(false);
  const [assignBed, setAssignBed] = useState<RoomDetailBed | null>(null);
  const [transferBed, setTransferBed] = useState<RoomDetailBed | null>(null);
  const [editBed, setEditBed] = useState<RoomDetailBed | null>(null);

  const canUpdateRoom = has("rooms.update");
  const canAddBed = has("beds.create");
  const canAssign = has("allocations.create");
  const canTransfer = has("allocations.transfer");
  const canManageStatus = has("beds.update");

  const query = useQuery({
    queryKey: ["room-detail", roomId],
    queryFn: () => getRoomDetail(roomId),
  });

  async function setBedStatus(bedId: string, status: Exclude<BedStatus, "occupied">) {
    try {
      await updateBed(bedId, { status });
      queryClient.invalidateQueries({ queryKey: ["room-detail", roomId] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      toast.success(`Bed marked as ${status}.`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("beds.update");
        }
        toast.error(err.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    }
  }

  const forbidden =
    query.error instanceof ApiError && query.error.code === "missing_permission";
  const notFound =
    query.error instanceof ApiError && query.error.code === "room_not_found";

  if (forbidden) {
    return (
      <EmptyState
        icon={ShieldOff}
        title="You don't have access to this room"
        description="Ask an administrator to grant you the rooms.view permission."
      />
    );
  }

  if (notFound) {
    return (
      <EmptyState
        icon={DoorOpen}
        title="Room not found"
        description="This room may have been removed. Go back to Rooms and try again."
        action={{ label: "Back to Rooms", onClick: () => router.push("/rooms") }}
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
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { room, summary, beds } = query.data;
  const capacityFull = beds.length >= room.capacity;

  return (
    <div className="space-y-8">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center text-xs font-semibold tracking-wide text-on-surface-variant uppercase"
        >
          <ol className="inline-flex items-center gap-1">
            <li>
              <span>Hostel Management</span>
            </li>
            <li className="inline-flex items-center gap-1">
              <ChevronRight aria-hidden className="size-4" />
              <Link href="/rooms" className="transition-colors hover:text-primary">
                Rooms
              </Link>
            </li>
            <li className="inline-flex items-center gap-1" aria-current="page">
              <ChevronRight aria-hidden className="size-4" />
              <span className="font-bold text-primary">Room {room.room_number}</span>
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Room {room.room_number} Bed Management
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              {[room.building_name, room.floor_name].filter(Boolean).join(" • ") || "—"}
            </p>
          </div>
          {canUpdateRoom && (
            <Button
              type="button"
              onClick={() => setEditOpen(true)}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Pencil aria-hidden className="size-4" />
              Edit Details
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          icon={BedDouble}
          chipClassName="bg-primary/10 text-primary"
          label="Total Beds"
          value={summary.total_beds}
        />
        <SummaryCard
          icon={Users}
          chipClassName="bg-surface-container-high text-on-surface-variant"
          label="Occupied"
          value={summary.occupied_beds}
        />
        <SummaryCard
          icon={CheckCircle2}
          chipClassName="bg-emerald-50 text-emerald-600"
          label="Vacant"
          value={summary.vacant_beds}
          valueClassName="text-emerald-600"
        />
        <SummaryCard
          icon={Sparkles}
          chipClassName="bg-amber-50 text-amber-600"
          label="Cleaning"
          value={summary.cleaning_beds}
          valueClassName="text-amber-600"
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-on-surface">Beds in this Room</h2>
        {canAddBed && (
          <Button
            type="button"
            variant="outline"
            disabled={capacityFull}
            onClick={() => setAddBedOpen(true)}
            className="h-9 gap-2 rounded-lg px-3 text-sm font-medium"
          >
            <Plus aria-hidden className="size-4" />
            {capacityFull ? "Bed capacity full" : "Add Bed"}
          </Button>
        )}
      </div>

      {beds.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title="No beds configured for this room"
          description="Add beds to this room to start assigning residents."
          action={canAddBed ? { label: "Add Bed", onClick: () => setAddBedOpen(true) } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {beds.map((bed) => {
            if (bed.status === "occupied") {
              return (
                <OccupiedBedCard
                  key={bed.id}
                  bed={bed}
                  canTransfer={canTransfer}
                  canManageStatus={canManageStatus}
                  onViewProfile={() => bed.resident && router.push(`/residents/${bed.resident.id}`)}
                  onTransfer={() => setTransferBed(bed)}
                  onEdit={() => setEditBed(bed)}
                />
              );
            }
            if (bed.status === "available") {
              return (
                <VacantBedCard
                  key={bed.id}
                  bed={bed}
                  canAssign={canAssign}
                  canManageStatus={canManageStatus}
                  onAssign={() => setAssignBed(bed)}
                  onEdit={() => setEditBed(bed)}
                />
              );
            }
            if (bed.status === "cleaning") {
              return (
                <CleaningBedCard
                  key={bed.id}
                  bed={bed}
                  canManageStatus={canManageStatus}
                  onMarkClean={() => setBedStatus(bed.id, "available")}
                  onEdit={() => setEditBed(bed)}
                />
              );
            }
            return (
              <MaintenanceBedCard
                key={bed.id}
                bed={bed}
                canManageStatus={canManageStatus}
                onMarkAvailable={() => setBedStatus(bed.id, "available")}
                onEdit={() => setEditBed(bed)}
              />
            );
          })}
        </div>
      )}

      <RoomFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        room={room as Room}
        defaultBuilding={null}
        defaultFloor={null}
      />

      <AddBedDialog open={addBedOpen} onOpenChange={setAddBedOpen} roomId={roomId} />

      <EditBedDialog
        open={!!editBed}
        onOpenChange={(open: boolean) => !open && setEditBed(null)}
        roomId={roomId}
        bed={editBed}
      />

      <AssignBedDialog
        open={!!assignBed}
        onOpenChange={(open: boolean) => !open && setAssignBed(null)}
        roomId={roomId}
        bed={assignBed}
      />

      <TransferBedDialog
        open={!!transferBed}
        onOpenChange={(open: boolean) => !open && setTransferBed(null)}
        roomId={roomId}
        bed={transferBed}
      />
    </div>
  );
}
