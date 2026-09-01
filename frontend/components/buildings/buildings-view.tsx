"use client"

import { useState, type SubmitEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Building2, Pencil, Plus, Search, ShieldOff } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { Breadcrumbs } from "@/components/hostel/breadcrumbs"
import { EmptyState } from "@/components/hostel/empty-state"
import { ErrorState } from "@/components/hostel/error-state"
import { Pagination } from "@/components/hostel/pagination"
import { StatusBadge } from "@/components/hostel/status-badge"
import { usePermissions, markPermissionDenied } from "@/lib/permissions"
import { ApiError, createBuilding, getBuildings, updateBuilding } from "@/lib/api"
import type { Building, BuildingType } from "@/lib/types"

const BUILDING_TYPE_OPTIONS: { value: BuildingType; label: string }[] = [
  { value: "boys", label: "Boys" },
  { value: "girls", label: "Girls" },
  { value: "mixed", label: "Mixed" },
]

/** Matches the exact Stitch "Type" pill treatment per value — Girls and Boys
 * map onto theme tokens already wired in globals.css; Mixed uses Stitch's
 * `primary-fixed-dim` / `on-primary-fixed-variant` pair verbatim (that pair
 * isn't in this project's token set, so it's inlined as a literal color). */
const BUILDING_TYPE_BADGE: Record<BuildingType, string> = {
  girls: "bg-secondary-fixed text-on-secondary-fixed",
  boys: "bg-surface-container-high text-on-surface",
  mixed: "bg-[#c3c0ff] text-[#3323cc]",
}

function BuildingTypeBadge({ type }: { type: BuildingType }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        BUILDING_TYPE_BADGE[type],
      )}
    >
      {BUILDING_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type}
    </span>
  )
}

const buildingSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  code: z.string().max(50).optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
  type: z.enum(["boys", "girls", "mixed"]),
  is_active: z.boolean(),
})

type BuildingFormValues = z.infer<typeof buildingSchema>

function BuildingFormDialog({
  open,
  onOpenChange,
  building,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  building: Building | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!building

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BuildingFormValues>({
    resolver: zodResolver(buildingSchema),
    values: {
      name: building?.name ?? "",
      code: building?.code ?? "",
      description: building?.description ?? "",
      type: building?.type ?? "mixed",
      is_active: building?.is_active ?? true,
    },
  })

  async function onSubmit(values: BuildingFormValues) {
    const payload = {
      name: values.name,
      code: values.code || null,
      description: values.description || null,
      type: values.type,
      is_active: values.is_active,
    }
    try {
      if (isEdit && building) {
        await updateBuilding(building.id, payload)
        toast.success("Building updated.")
      } else {
        await createBuilding(payload)
        toast.success("Building created.")
      }
      queryClient.invalidateQueries({ queryKey: ["buildings"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "buildings.update" : "buildings.create")
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
          <DialogTitle>{isEdit ? "Edit building" : "Add building"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this building's details."
              : "Add a new building to the campus."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="building-name">
                Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="building-name" {...register("name")} aria-invalid={!!errors.name} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.code}>
              <FieldLabel htmlFor="building-code">Code</FieldLabel>
              <Input id="building-code" placeholder="e.g. WING-A" {...register("code")} aria-invalid={!!errors.code} />
              <FieldError errors={[errors.code]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="building-type">
                Type <span className="text-destructive">*</span>
              </FieldLabel>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <SelectTrigger id="building-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BUILDING_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="building-description">Description</FieldLabel>
              <Textarea id="building-description" rows={3} {...register("description")} />
              <FieldError errors={[errors.description]} />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="building-active">Active</FieldLabel>
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => (
                  <Switch
                    id="building-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create building"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function BuildingsView() {
  const { has } = usePermissions()
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | BuildingType>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Building | null>(null)

  const canCreate = has("buildings.create")
  const canUpdate = has("buildings.update")

  const query = useQuery({
    queryKey: ["buildings", { page, perPage, search, statusFilter, typeFilter }],
    queryFn: () =>
      getBuildings({
        page,
        per_page: perPage,
        search: search || undefined,
        active_only: statusFilter === "active" ? true : undefined,
        type: typeFilter === "all" ? undefined : typeFilter,
      }),
  })

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(building: Building) {
    setEditing(building)
    setDialogOpen(true)
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
        <Breadcrumbs items={[{ label: "Hostel Management" }, { label: "Buildings" }]} />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.02em] text-on-surface">
              Buildings
            </h1>
            <p className="mt-1 text-sm leading-5 text-on-surface-variant">
              Manage and monitor all hostel facilities across the campus.
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              onClick={openCreate}
              className="h-10 gap-2 rounded-lg px-4 text-sm font-medium shadow-sm"
            >
              <Plus aria-hidden className="size-4.5" />
              Add Building
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        {/* Toolbar */}
        <form
          onSubmit={submitSearch}
          className="flex flex-col items-center justify-between gap-4 border-b border-outline-variant bg-background/60 p-4 sm:flex-row"
        >
          <div className="flex w-full flex-1 items-center gap-2 sm:max-w-sm">
            <div className="relative w-full">
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
                placeholder="Search buildings…"
                aria-label="Search buildings"
                className="h-10 rounded-lg pl-10 text-sm"
              />
            </div>
            <Button type="submit" variant="outline" className="h-10 shrink-0 rounded-lg">
              Search
            </Button>
          </div>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                if (!value) return
                setTypeFilter(value as "all" | BuildingType)
                setPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-lg sm:w-36" aria-label="Filter by type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {BUILDING_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (!value) return
                setStatusFilter(value as "all" | "active")
                setPage(1)
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-lg sm:w-40" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>

        {forbidden ? (
          <div className="p-4">
            <EmptyState
              icon={ShieldOff}
              title="You don't have access to Buildings"
              description="Ask an administrator to grant you the buildings.view permission."
            />
          </div>
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
          </div>
        ) : query.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : query.data && query.data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Building2}
              title="No buildings yet"
              description={
                search
                  ? "No buildings match your search."
                  : "Add your first building to start structuring the campus."
              }
              action={canCreate ? { label: "Add Building", onClick: openCreate } : undefined}
            />
          </div>
        ) : (
          query.data && (
            <>
              <div className="overflow-x-auto">
                <Table className="w-full border-collapse text-left">
                  <TableHeader>
                    <TableRow className="border-b border-outline-variant bg-background/60 hover:bg-background/60">
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Building Name
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Type
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Total Capacity
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Occupancy %
                      </TableHead>
                      <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                        Status
                      </TableHead>
                      {canUpdate && (
                        <TableHead className="h-auto whitespace-nowrap px-6 py-4 text-right text-xs font-semibold tracking-wider text-on-surface-variant uppercase">
                          Actions
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-outline-variant">
                    {query.data.items.map((building) => {
                      const occupancyPct = Math.round(building.occupancy_rate)
                      return (
                        <TableRow
                          key={building.id}
                          className="group border-b border-outline-variant last:border-0 hover:bg-surface-container-low/60"
                        >
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-primary">
                                <Building2 aria-hidden className="size-4.5" />
                              </div>
                              <div>
                                <p className="font-semibold text-on-surface">{building.name}</p>
                                {building.code && (
                                  <p className="text-xs text-on-surface-variant">{building.code}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <BuildingTypeBadge type={building.type} />
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <p className="text-sm text-on-surface">
                              {building.total_capacity} {building.total_capacity === 1 ? "Bed" : "Beds"}
                            </p>
                            <p className="text-xs text-on-surface-variant">
                              {building.total_rooms} {building.total_rooms === 1 ? "Room" : "Rooms"}
                            </p>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-full max-w-25 rounded-full bg-surface-container-highest">
                                <div
                                  className={cn(
                                    "h-2 rounded-full",
                                    building.is_active ? "bg-primary" : "bg-outline",
                                  )}
                                  style={{ width: `${Math.min(100, occupancyPct)}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold text-on-surface">{occupancyPct}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                            <StatusBadge status={building.is_active ? "active" : "inactive"} />
                          </TableCell>
                          {canUpdate && (
                            <TableCell className="px-6 py-4 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Edit ${building.name}`}
                                onClick={() => openEdit(building)}
                                className="rounded-full text-on-surface-variant opacity-0 transition-opacity duration-200 group-hover:opacity-100 hover:bg-surface-container-low hover:text-primary focus-visible:opacity-100"
                              >
                                <Pencil aria-hidden className="size-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
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
      </div>

      <BuildingFormDialog open={dialogOpen} onOpenChange={setDialogOpen} building={editing} />
    </div>
  )
}
