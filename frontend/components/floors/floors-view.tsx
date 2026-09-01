"use client"

import { useState, type SubmitEvent } from "react"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Layers, MoreVertical, Pencil, Plus, Search, ShieldOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, createFloor, getFloors, updateFloor } from "@/lib/api"
import { fetchBuildingOptions } from "@/lib/hostel-options"
import type { Floor } from "@/lib/types"

const floorSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  floor_number: z.coerce.number().int().min(0, "Must be 0 or greater"),
  description: z.string().optional().or(z.literal("")),
})

type FloorFormValues = z.infer<typeof floorSchema>

function FloorFormDialog({
  open,
  onOpenChange,
  floor,
  defaultBuilding,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  floor: Floor | null
  defaultBuilding: ComboOption | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!floor
  const [building, setBuilding] = useState<ComboOption | null>(defaultBuilding)
  const [buildingError, setBuildingError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof floorSchema>, unknown, FloorFormValues>({
    resolver: zodResolver(floorSchema),
    values: {
      name: floor?.name ?? "",
      floor_number: floor?.floor_number ?? 0,
      description: floor?.description ?? "",
    },
  })

  // Keep the building selector in sync with the current filter/floor whenever
  // the dialog is (re)opened for a new target.
  const [lastFloorId, setLastFloorId] = useState<string | null>(null)
  if ((floor?.id ?? null) !== lastFloorId) {
    setLastFloorId(floor?.id ?? null)
    setBuilding(floor ? { value: floor.building_id, label: "Current building" } : defaultBuilding)
  }

  async function onSubmit(values: FloorFormValues) {
    if (!isEdit && !building) {
      setBuildingError("Building is required")
      return
    }
    setBuildingError(null)
    try {
      if (isEdit && floor) {
        await updateFloor(floor.id, {
          name: values.name,
          floor_number: values.floor_number,
          description: values.description || null,
        })
        toast.success("Floor updated.")
      } else {
        await createFloor({
          building_id: building!.value,
          name: values.name,
          floor_number: values.floor_number,
          description: values.description || null,
        })
        toast.success("Floor created.")
      }
      queryClient.invalidateQueries({ queryKey: ["floors"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "floors.update" : "floors.create")
        }
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit floor" : "Add floor"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this floor's details." : "Add a new floor to a building."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!buildingError}>
              <FieldLabel htmlFor="floor-building">
                Building <span className="text-destructive">*</span>
              </FieldLabel>
              <EntityCombobox
                id="floor-building"
                value={building}
                onChange={(next) => {
                  setBuilding(next)
                  if (next) setBuildingError(null)
                }}
                fetchOptions={fetchBuildingOptions}
                placeholder="Select a building…"
                disabled={isEdit}
              />
              <FieldError errors={[buildingError ? { message: buildingError } : undefined]} />
            </Field>

            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="floor-name">
                Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="floor-name" placeholder="e.g. Ground Floor" {...register("name")} aria-invalid={!!errors.name} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.floor_number}>
              <FieldLabel htmlFor="floor-number">
                Floor number <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="floor-number"
                type="number"
                min={0}
                step={1}
                {...register("floor_number")}
                aria-invalid={!!errors.floor_number}
              />
              <FieldError errors={[errors.floor_number]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="floor-description">Description</FieldLabel>
              <Textarea id="floor-description" rows={3} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create floor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function FloorsView() {
  const { has } = usePermissions()
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(12)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [building, setBuilding] = useState<ComboOption | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Floor | null>(null)

  const canCreate = has("floors.create")
  const canUpdate = has("floors.update")

  const query = useQuery({
    queryKey: ["floors", { page, perPage, search, buildingId: building?.value }],
    queryFn: () =>
      getFloors({
        page,
        per_page: perPage,
        search: search || undefined,
        building_id: building?.value,
      }),
  })

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(floor: Floor) {
    setEditing(floor)
    setDialogOpen(true)
  }

  function manageFloor(floor: Floor) {
    const params = new URLSearchParams({
      building_id: floor.building_id,
      building_label: building?.label ?? "",
      floor_id: floor.id,
      floor_label: floor.name,
    })
    router.push(`/rooms?${params.toString()}`)
  }

  function submitSearch(e: SubmitEvent) {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const forbidden = query.error instanceof ApiError && query.error.code === "missing_permission"

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs
          items={[
            { label: "Hostel Management" },
            ...(building ? [{ label: building.label }] : []),
            { label: "Floors" },
          ]}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              {building ? `${building.label} Floors` : "Floors"}
            </h1>
            <p className="mt-1 text-sm leading-5 text-on-surface-variant">
              Manage room allocations and statuses across all floors.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-5" />
              Add Floor
            </Button>
          )}
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 sm:flex-row sm:items-center">
        <div className="w-full sm:max-w-64">
          <EntityCombobox
            value={building}
            onChange={(next) => {
              setBuilding(next)
              setPage(1)
            }}
            fetchOptions={fetchBuildingOptions}
            placeholder="All buildings"
          />
        </div>
        <form onSubmit={submitSearch} className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-xs">
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
              placeholder="Search floors by name…"
              aria-label="Search floors"
              className="h-10 rounded-lg pl-10 text-sm"
            />
          </div>
          <Button type="submit" variant="outline" className="h-10 rounded-lg">
            Search
          </Button>
        </form>
      </div>

      {!canCreate && !building && (
        <p className="-mt-4 text-sm text-on-surface-variant">
          Tip: select a building above to browse its floors.
        </p>
      )}

      {forbidden ? (
        <EmptyState
          icon={ShieldOff}
          title="You don't have access to Floors"
          description="Ask an administrator to grant you the floors.view permission."
        />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full rounded-xl" />
          ))}
        </div>
      ) : query.data && query.data.items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No floors yet"
          description={
            building
              ? "This building doesn't have any floors yet."
              : "Add a floor to get started, or select a building above to narrow the list."
          }
          action={canCreate ? { label: "Add Floor", onClick: openCreate } : undefined}
        />
      ) : (
        query.data && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {query.data.items.map((floor) => (
                <div
                  key={floor.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest transition-shadow duration-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-outline-variant bg-surface-container-low/50 p-5">
                    <div>
                      <h3 className="mb-1 text-xl font-semibold text-on-surface">{floor.name}</h3>
                      {floor.building_name && (
                        <p className="text-sm text-on-surface-variant">{floor.building_name}</p>
                      )}
                    </div>
                    {canUpdate && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <button
                              type="button"
                              aria-label={`More actions for ${floor.name}`}
                              className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                            />
                          }
                        >
                          <MoreVertical aria-hidden className="size-5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => openEdit(floor)}>
                            <Pencil aria-hidden className="size-4" />
                            Edit details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>

                  <div className="flex-1 p-5">
                    <div className="mb-6 grid grid-cols-2 gap-x-2 gap-y-4">
                      <div>
                        <p className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Rooms
                        </p>
                        <p className="text-2xl font-semibold text-on-surface">{floor.total_rooms}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Total Beds
                        </p>
                        <p className="text-2xl font-semibold text-on-surface">{floor.total_beds}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="mb-2 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Occupancy Status
                        </p>
                        <div className="mb-1 flex items-end justify-between">
                          <span className="text-sm text-on-surface">{floor.occupied_beds} Occupied</span>
                          <span className="text-sm font-bold text-[#3525cd]">{floor.available_beds} Available</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-surface-container-high">
                          <div
                            className="h-2.5 rounded-full bg-[#3525cd]"
                            style={{
                              width: `${floor.total_beds ? Math.min(100, (floor.occupied_beds / floor.total_beds) * 100) : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 border-t border-outline-variant p-4">
                    {canUpdate && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 rounded-lg px-4 text-sm font-medium text-[#3525cd] hover:bg-[#3525cd]/10 hover:text-[#3525cd]"
                        onClick={() => openEdit(floor)}
                      >
                        Edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="h-9 rounded-lg bg-secondary-container px-4 text-sm font-medium text-on-secondary-container shadow-none hover:bg-secondary-container/80"
                      onClick={() => manageFloor(floor)}
                    >
                      Manage Floor
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Pagination
              page={query.data.page}
              perPage={query.data.per_page}
              total={query.data.total}
              onPageChange={setPage}
              onPerPageChange={(next) => {
                setPerPage(next)
                setPage(1)
              }}
            />
          </>
        )
      )}

      <FloorFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        floor={editing}
        defaultBuilding={building}
      />
    </div>
  )
}
