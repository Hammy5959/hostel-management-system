"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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
  EntityCombobox,
  type ComboOption,
} from "@/components/hostel/entity-combobox"
import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createRoom, updateRoom } from "@/lib/api"
import { fetchBuildingOptions, fetchFloorOptions } from "@/lib/hostel-options"
import type { Room, RoomStatus } from "@/lib/types"

export const ROOM_STATUS_OPTIONS: { value: RoomStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "maintenance", label: "Maintenance" },
]

const roomSchema = z.object({
  room_number: z.string().min(1, "Room number is required").max(50),
  room_type: z.string().max(100).optional().or(z.literal("")),
  capacity: z.coerce.number().int().min(1, "Must be at least 1"),
  status: z.enum(["active", "inactive", "maintenance"]),
  description: z.string().optional().or(z.literal("")),
})

type RoomFormValues = z.infer<typeof roomSchema>

/** Shared create/edit room form — used by both the Rooms list page ("Add
 * Room") and the Room detail page ("Edit Details"), so there is exactly one
 * room-editing implementation in the app. */
export function RoomFormDialog({
  open,
  onOpenChange,
  room,
  defaultBuilding,
  defaultFloor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: Room | null
  /** Convenience prefill from the page-level filters, if any are set — the
   * user is never required to have picked these first. */
  defaultBuilding: ComboOption | null
  defaultFloor: ComboOption | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!room
  const [building, setBuilding] = useState<ComboOption | null>(defaultBuilding)
  const [floor, setFloor] = useState<ComboOption | null>(defaultFloor)
  const [floorError, setFloorError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof roomSchema>, unknown, RoomFormValues>({
    resolver: zodResolver(roomSchema),
    values: {
      room_number: room?.room_number ?? "",
      room_type: room?.room_type ?? "",
      capacity: room?.capacity ?? 1,
      status: room?.status ?? "active",
      description: room?.description ?? "",
    },
  })

  // Keep the building/floor selectors in sync whenever the dialog is
  // (re)opened for a new target (create vs. a specific room to edit).
  const [lastRoomId, setLastRoomId] = useState<string | null>(null)
  if ((room?.id ?? null) !== lastRoomId) {
    setLastRoomId(room?.id ?? null)
    if (room) {
      setBuilding(
        room.building_id
          ? { value: room.building_id, label: room.building_name ?? "Building" }
          : null,
      )
      setFloor({ value: room.floor_id, label: room.floor_name ?? "Floor" })
    } else {
      setBuilding(defaultBuilding)
      setFloor(defaultFloor)
    }
  }

  async function onSubmit(values: RoomFormValues) {
    if (!isEdit && !floor) {
      setFloorError("Floor is required")
      return
    }
    setFloorError(null)
    try {
      if (isEdit && room) {
        await updateRoom(room.id, {
          room_number: values.room_number,
          room_type: values.room_type || null,
          capacity: values.capacity,
          status: values.status,
          description: values.description || null,
        })
        toast.success("Room updated.")
      } else {
        await createRoom({
          floor_id: floor!.value,
          room_number: values.room_number,
          room_type: values.room_type || null,
          capacity: values.capacity,
          status: values.status,
          description: values.description || null,
        })
        toast.success("Room created.")
      }
      queryClient.invalidateQueries({ queryKey: ["rooms"] })
      if (room) {
        queryClient.invalidateQueries({ queryKey: ["room-detail", room.id] })
      }
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "rooms.update" : "rooms.create")
        }
        toast.error(err.message)
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit room" : "Add room"}</DialogTitle>

          <DialogDescription>
            {isEdit
              ? "Update this room's details."
              : "Select a building and floor, then add the room."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Scrollable form area */}
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <FieldGroup>
              {isEdit ? (
                <Field>
                  <FieldLabel>Location</FieldLabel>

                  <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-on-surface-variant">
                    {[room?.building_name, room?.floor_name]
                      .filter(Boolean)
                      .join(" • ") || "—"}
                  </p>
                </Field>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="room-building">
                      Building <span className="text-destructive">*</span>
                    </FieldLabel>

                    <EntityCombobox
                      id="room-building"
                      value={building}
                      onChange={(next) => {
                        setBuilding(next)
                        setFloor(null)
                      }}
                      fetchOptions={fetchBuildingOptions}
                      placeholder="Select a building…"
                    />
                  </Field>

                  <Field data-invalid={!!floorError}>
                    <FieldLabel htmlFor="room-floor">
                      Floor <span className="text-destructive">*</span>
                    </FieldLabel>

                    <EntityCombobox
                      id="room-floor"
                      value={floor}
                      onChange={(next) => {
                        setFloor(next)

                        if (next) {
                          setFloorError(null)
                        }
                      }}
                      fetchOptions={fetchFloorOptions(building?.value)}
                      placeholder={
                        building ? "Select a floor…" : "Pick a building first"
                      }
                      disabled={!building}
                    />

                    <FieldError
                      errors={[
                        floorError ? { message: floorError } : undefined,
                      ]}
                    />
                  </Field>
                </>
              )}

              <Field data-invalid={!!errors.room_number}>
                <FieldLabel htmlFor="room-number">
                  Room number <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  id="room-number"
                  placeholder="e.g. 301A"
                  {...register("room_number")}
                  aria-invalid={!!errors.room_number}
                />

                <FieldError errors={[errors.room_number]} />
              </Field>

              <Field data-invalid={!!errors.room_type}>
                <FieldLabel htmlFor="room-type">Room type</FieldLabel>

                <Input
                  id="room-type"
                  placeholder="e.g. Double, Suite"
                  {...register("room_type")}
                  aria-invalid={!!errors.room_type}
                />

                <FieldError errors={[errors.room_type]} />
              </Field>

              <Field data-invalid={!!errors.capacity}>
                <FieldLabel htmlFor="room-capacity">
                  Capacity (beds) <span className="text-destructive">*</span>
                </FieldLabel>

                <Input
                  id="room-capacity"
                  type="number"
                  min={1}
                  step={1}
                  {...register("capacity")}
                  aria-invalid={!!errors.capacity}
                />

                <FieldError errors={[errors.capacity]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="room-status">Status</FieldLabel>

                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        if (value) {
                          field.onChange(value)
                        }
                      }}
                    >
                      <SelectTrigger id="room-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {ROOM_STATUS_OPTIONS.map((option) => (
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
                <FieldLabel htmlFor="room-description">Description</FieldLabel>

                <Textarea
                  id="room-description"
                  rows={3}
                  {...register("description")}
                />

                <FieldError errors={[errors.description]} />
              </Field>
            </FieldGroup>
          </div>

          {/* Fixed footer */}
          <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create room"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
