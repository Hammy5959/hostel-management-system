"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CheckCircle2,
  DoorOpen,
  LayoutGrid,
  List,
  Plus,
  Search,
  ShieldOff,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
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
import { StatusBadge } from "@/components/hostel/status-badge";
import {
  EntityCombobox,
  type ComboOption,
} from "@/components/hostel/entity-combobox";
import { usePermissions } from "@/lib/permissions";
import { ApiError, getRooms } from "@/lib/api";
import { fetchBuildingOptions, fetchFloorOptions } from "@/lib/hostel-options";
import type { BuildingType, Room, RoomStatus } from "@/lib/types";
import {
  ROOM_STATUS_OPTIONS,
  RoomFormDialog,
} from "@/components/rooms/room-form-dialog";

const ROOM_STRIP_COLOR: Record<RoomStatus, string> = {
  active: "bg-emerald-500",
  inactive: "bg-outline",
  maintenance: "bg-amber-500",
};

const BUILDING_TYPE_LABEL: Record<BuildingType, string> = {
  boys: "Boys",
  girls: "Girls",
  mixed: "Mixed",
};

/** Bed/occupancy status is a *derived* value from this room's real bed
 * counts — a distinct concept from `room.status` (active/inactive/
 * maintenance), which is its own separate field/badge. Never conflate the
 * two: a room can be "active" with zero beds configured, or "inactive"
 * with beds still on it. */
function getOccupancySummary(totalBeds: number, occupiedBeds: number) {
  const availableBeds = totalBeds - occupiedBeds;
  if (totalBeds === 0) {
    return { configured: false, availableBeds: 0, fullyOccupied: false };
  }
  return {
    configured: true,
    availableBeds,
    fullyOccupied: availableBeds === 0,
  };
}

/** The occupancy block shared by the grid card and the detail page — real
 * bed counts only, in the exact wording the room card was specified with. */
function OccupancyLines({ room }: { room: Room }) {
  const { configured, availableBeds, fullyOccupied } = getOccupancySummary(
    room.total_beds,
    room.occupied_beds,
  );

  if (!configured) {
    return (
      <p className="text-sm font-medium text-on-surface-variant">
        No Beds Configured
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-on-surface">
        {room.occupied_beds} / {room.total_beds} Beds Occupied
      </p>
      <p
        className={cn(
          "text-sm font-bold",
          fullyOccupied ? "text-[#3525cd]" : "text-emerald-600",
        )}
      >
        {fullyOccupied
          ? "Fully Occupied"
          : `${availableBeds} Bed${availableBeds === 1 ? "" : "s"} Available`}
      </p>
      <div className="mt-2 h-2 w-full rounded-full bg-surface-container-high">
        <div
          className={cn(
            "h-2 rounded-full",
            fullyOccupied ? "bg-[#3525cd]" : "bg-emerald-500",
          )}
          style={{
            width: `${Math.min(100, (room.occupied_beds / room.total_beds) * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

function CurrentResidents({ room }: { room: Room }) {
  if (room.current_residents.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
        <Users aria-hidden className="size-3.5" />
        Current Residents
      </p>
      <ul className="space-y-1">
        {room.current_residents.map((resident) => (
          <li key={resident.id} className="text-sm text-on-surface">
            •{" "}
            {[resident.first_name, resident.last_name]
              .filter(Boolean)
              .join(" ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
}: {
  icon: typeof DoorOpen;
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

function RoomCard({ room, onOpen }: { room: Room; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left transition-shadow hover:shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-2px_rgba(0,0,0,0.05)]"
    >
      <div
        className={cn(
          "absolute top-0 left-0 h-2 w-full",
          ROOM_STRIP_COLOR[room.status],
        )}
      />
      <div className="flex flex-col gap-4 p-6 pt-7">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-xl font-semibold text-on-surface">
              Room {room.room_number}
            </h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              {[room.building_name, room.floor_name]
                .filter(Boolean)
                .join(" • ") || "—"}
            </p>
          </div>
          <StatusBadge status={room.status} />
        </div>

        <div>
          {room.room_type && (
            <p className="text-sm text-on-surface">{room.room_type}</p>
          )}
          <p className="text-sm text-on-surface-variant">
            Capacity: {room.capacity} Beds
          </p>
        </div>

        <OccupancyLines room={room} />
        <CurrentResidents room={room} />
      </div>
    </button>
  );
}

function RoomListRow({ room, onOpen }: { room: Room; onOpen: () => void }) {
  const { configured, availableBeds, fullyOccupied } = getOccupancySummary(
    room.total_beds,
    room.occupied_beds,
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-4 border-b border-outline-variant px-5 py-4 text-left transition-colors last:border-0 hover:bg-surface-container-low/60"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "size-2.5 shrink-0 rounded-full",
            ROOM_STRIP_COLOR[room.status],
          )}
        />
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-container text-primary">
          <DoorOpen aria-hidden className="size-4.5" />
        </div>
        <div>
          <p className="font-semibold text-on-surface">
            Room {room.room_number}
          </p>
          <p className="text-xs text-on-surface-variant">
            {[room.building_name, room.floor_name]
              .filter(Boolean)
              .join(" • ") || "—"}
            {room.room_type ? ` · ${room.room_type}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-on-surface-variant">
          {!configured
            ? "No Beds Configured"
            : fullyOccupied
              ? "Fully Occupied"
              : `${availableBeds} Bed${availableBeds === 1 ? "" : "s"} Available`}
        </span>
        <StatusBadge status={room.status} />
      </div>
    </button>
  );
}

export function RoomsView() {
  const { has } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [building, setBuilding] = useState<ComboOption | null>(() => {
    const id = searchParams.get("building_id");
    const label = searchParams.get("building_label");
    return id ? { value: id, label: label || "Building" } : null;
  });
  const [floor, setFloor] = useState<ComboOption | null>(() => {
    const id = searchParams.get("floor_id");
    const label = searchParams.get("floor_label");
    return id ? { value: id, label: label || "Floor" } : null;
  });
  const [status, setStatus] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);

  const canCreate = has("rooms.create");
  const canViewRooms = has("rooms.view");

  // No filters → every room. A building narrows to that building; a floor
  // (which already implies a building) narrows further to that floor.
  const query = useQuery({
    queryKey: [
      "rooms",
      {
        page,
        perPage,
        search,
        buildingId: building?.value,
        floorId: floor?.value,
        status,
      },
    ],
    queryFn: () =>
      getRooms({
        page,
        per_page: perPage,
        search: search || undefined,
        building_id: floor ? undefined : building?.value,
        floor_id: floor?.value,
        status: status || undefined,
      }),
  });

  const roomItems = query.data?.items ?? [];
  const summary = query.data?.summary;

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openDetail(room: Room) {
    router.push(`/rooms/${room.id}`);
  }

  function submitSearch(e: SubmitEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const forbidden =
    query.error instanceof ApiError &&
    query.error.code === "missing_permission";

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: "Hostel Management" }, { label: "Rooms" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Room Management
            </h1>
            <p className="mt-2 text-base leading-6 text-on-surface-variant">
              {building && floor
                ? `Manage inventory, occupancy, and status for ${building.label}, ${floor.label}.`
                : building
                  ? `Manage inventory, occupancy, and status for ${building.label}.`
                  : "Manage inventory, occupancy, and status across all rooms."}
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Add Room
            </Button>
          )}
        </div>
      </div>

      {canViewRooms && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {query.isLoading || !summary ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))
          ) : (
            <>
              <StatCard
                icon={DoorOpen}
                iconClassName="bg-primary/10 text-primary"
                label="Total Rooms"
                value={summary.total_rooms}
              />
              <StatCard
                icon={CheckCircle2}
                iconClassName="bg-emerald-50 text-emerald-600"
                label="Occupied"
                value={summary.occupied_rooms}
              />
              <StatCard
                icon={Users}
                iconClassName="bg-blue-50 text-blue-600"
                label="Available"
                value={summary.available_rooms}
              />
              <StatCard
                icon={Building2}
                iconClassName="bg-amber-50 text-amber-600"
                label="Full"
                value={summary.full_rooms}
              />
            </>
          )}
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center">
        <form
          onSubmit={submitSearch}
          className="flex flex-1 items-center gap-2"
        >
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
              placeholder="Search by room number..."
              aria-label="Search rooms"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            className="h-10 shrink-0 rounded-lg"
          >
            Search
          </Button>
        </form>

        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="w-full sm:max-w-56">
            <EntityCombobox
              value={building}
              onChange={(next) => {
                setBuilding(next);
                setFloor(null);
                setPage(1);
              }}
              fetchOptions={fetchBuildingOptions}
              placeholder="All Buildings"
            />
          </div>
          <div className="w-full sm:max-w-56">
            <EntityCombobox
              value={floor}
              onChange={(next) => {
                setFloor(next);
                setPage(1);
              }}
              fetchOptions={fetchFloorOptions(building?.value)}
              placeholder={building ? "All Floors" : "Pick a building first"}
              disabled={!building}
            />
          </div>
          <Select
            value={status || "all"}
            onValueChange={(value) =>
              setStatus(!value || value === "all" ? "" : value)
            }
          >
            <SelectTrigger className="h-10 w-full rounded-lg border-transparent bg-surface-container sm:w-44">
              <SelectValue placeholder="Status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              {ROOM_STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 border-outline-variant sm:border-l sm:pl-4">
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
          title="You don't have access to Rooms"
          description="Ask an administrator to grant you the rooms.view permission."
        />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error).message}
          onRetry={() => query.refetch()}
        />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={DoorOpen}
          title="No rooms found"
          description={
            search || building || floor || status
              ? "No rooms match your filters."
              : "Add your first room to get started."
          }
          action={
            canCreate ? { label: "Add Room", onClick: openCreate } : undefined
          }
        />
      ) : (
        query.data && (
          <>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {roomItems.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    onOpen={() => openDetail(room)}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                {roomItems.map((room) => (
                  <RoomListRow
                    key={room.id}
                    room={room}
                    onOpen={() => openDetail(room)}
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

      <RoomFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        room={editing}
        defaultBuilding={building}
        defaultFloor={floor}
      />
    </div>
  );
}
