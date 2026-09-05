"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createNotice, getBuilding, getFloor, updateNotice } from "@/lib/api"
import { fetchBuildingOptions, fetchFloorOptions } from "@/lib/hostel-options"
import type { Notice, NoticeAudienceType } from "@/lib/types"

const SEND_TO_OPTIONS: { value: NoticeAudienceType; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "building", label: "Specific Building" },
  { value: "floor", label: "Specific Floor" },
]

const noticeSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  content: z.string().min(1, "Content is required"),
  category: z.string().max(100).optional().or(z.literal("")),
  expires_at: z.string().optional().or(z.literal("")),
})

type NoticeFormValues = z.infer<typeof noticeSchema>

export function NoticeFormDialog({
  open,
  onOpenChange,
  notice,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  notice: Notice | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!notice

  const [sendTo, setSendTo] = useState<NoticeAudienceType>(notice?.audience_type ?? "all")
  const [building, setBuilding] = useState<ComboOption | null>(null)
  const [floorBuilding, setFloorBuilding] = useState<ComboOption | null>(null)
  const [floor, setFloor] = useState<ComboOption | null>(null)
  const [audienceError, setAudienceError] = useState<string | null>(null)

  // Keep the audience controls in sync whenever the dialog is (re)opened for
  // a new target (create vs. a specific notice to edit).
  const [lastNoticeId, setLastNoticeId] = useState<string | null>(null)
  if ((notice?.id ?? null) !== lastNoticeId) {
    setLastNoticeId(notice?.id ?? null)
    setSendTo(notice?.audience_type ?? "all")
    setBuilding(null)
    setFloorBuilding(null)
    setFloor(null)
    setAudienceError(null)
  }

  // Notice only carries raw audience_building_id/audience_floor_id (no joined
  // name), so editing a building/floor-targeted notice resolves the real
  // name via a single lookup rather than showing a placeholder label in the
  // picker — Floor already includes building_id/building_name, so this also
  // recovers the floor's building for the "Specific Floor" picker's cascade.
  const editBuildingQuery = useQuery({
    queryKey: ["notice-audience-building", notice?.audience_building_id],
    queryFn: () => getBuilding(notice!.audience_building_id!),
    enabled: notice?.audience_type === "building" && !!notice.audience_building_id,
  })
  const editFloorQuery = useQuery({
    queryKey: ["notice-audience-floor", notice?.audience_floor_id],
    queryFn: () => getFloor(notice!.audience_floor_id!),
    enabled: notice?.audience_type === "floor" && !!notice.audience_floor_id,
  })

  const [syncedBuildingId, setSyncedBuildingId] = useState<string | null>(null)
  if (editBuildingQuery.data && editBuildingQuery.data.id !== syncedBuildingId) {
    setSyncedBuildingId(editBuildingQuery.data.id)
    setBuilding({
      value: editBuildingQuery.data.id,
      label: editBuildingQuery.data.name,
      sublabel: editBuildingQuery.data.code ?? undefined,
    })
  }
  const [syncedFloorId, setSyncedFloorId] = useState<string | null>(null)
  if (editFloorQuery.data && editFloorQuery.data.id !== syncedFloorId) {
    setSyncedFloorId(editFloorQuery.data.id)
    setFloor({ value: editFloorQuery.data.id, label: editFloorQuery.data.name, sublabel: `Floor ${editFloorQuery.data.floor_number}` })
    setFloorBuilding({
      value: editFloorQuery.data.building_id,
      label: editFloorQuery.data.building_name ?? "Building",
    })
  }

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof noticeSchema>, unknown, NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    values: {
      title: notice?.title ?? "",
      content: notice?.content ?? "",
      category: notice?.category ?? "",
      expires_at: notice?.expires_at ? notice.expires_at.slice(0, 10) : "",
    },
  })

  async function onSubmit(values: NoticeFormValues) {
    if (sendTo === "building" && !building) {
      setAudienceError("Select a building")
      return
    }
    if (sendTo === "floor" && !floor) {
      setAudienceError("Select a floor")
      return
    }
    setAudienceError(null)

    const audience =
      sendTo === "building"
        ? { audience_type: "building" as const, audience_building_id: building!.value, audience_floor_id: null }
        : sendTo === "floor"
          ? { audience_type: "floor" as const, audience_floor_id: floor!.value, audience_building_id: null }
          : { audience_type: "all" as const, audience_building_id: null, audience_floor_id: null }

    try {
      if (isEdit && notice) {
        await updateNotice(notice.id, {
          title: values.title,
          content: values.content,
          category: values.category || null,
          expires_at: values.expires_at || null,
          ...audience,
        })
        toast.success("Notice updated.")
      } else {
        await createNotice({
          title: values.title,
          content: values.content,
          category: values.category || null,
          expires_at: values.expires_at || null,
          ...audience,
        })
        toast.success("Notice created as a draft.")
      }
      queryClient.invalidateQueries({ queryKey: ["notices"] })
      queryClient.invalidateQueries({ queryKey: ["notices-total"] })
      queryClient.invalidateQueries({ queryKey: ["notices-published-total"] })
      queryClient.invalidateQueries({ queryKey: ["notices-categories"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "notices.update" : "notices.create")
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
          <DialogTitle>{isEdit ? "Edit notice" : "Create notice"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this notice's content and audience."
              : "This notice will be saved as a draft — publish it from the table when ready."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <FieldGroup>
              <Field data-invalid={!!errors.title}>
                <FieldLabel htmlFor="notice-title">
                  Title <span className="text-destructive">*</span>
                </FieldLabel>
                <Input id="notice-title" {...register("title")} aria-invalid={!!errors.title} />
                <FieldError errors={[errors.title]} />
              </Field>

              <Field data-invalid={!!errors.content}>
                <FieldLabel htmlFor="notice-content">
                  Content <span className="text-destructive">*</span>
                </FieldLabel>
                <Textarea id="notice-content" rows={4} {...register("content")} aria-invalid={!!errors.content} />
                <FieldError errors={[errors.content]} />
              </Field>

              <Field data-invalid={!!errors.category}>
                <FieldLabel htmlFor="notice-category">Category</FieldLabel>
                <Input id="notice-category" placeholder="e.g. Maintenance" {...register("category")} />
                <FieldError errors={[errors.category]} />
              </Field>

              <Field data-invalid={!!errors.expires_at}>
                <FieldLabel htmlFor="notice-expires">Expiry date</FieldLabel>
                <Input id="notice-expires" type="date" {...register("expires_at")} />
                <FieldError errors={[errors.expires_at]} />
              </Field>

              <Field data-invalid={!!audienceError}>
                <FieldLabel htmlFor="notice-send-to">Send to</FieldLabel>
                <Select
                  value={sendTo}
                  onValueChange={(value) => {
                    if (value) {
                      setSendTo(value as NoticeAudienceType)
                      setAudienceError(null)
                    }
                  }}
                >
                  <SelectTrigger id="notice-send-to" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEND_TO_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {sendTo === "building" && (
                  <EntityCombobox
                    value={building}
                    onChange={(next) => {
                      setBuilding(next)
                      if (next) setAudienceError(null)
                    }}
                    fetchOptions={fetchBuildingOptions}
                    placeholder="Select a building…"
                  />
                )}

                {sendTo === "floor" && (
                  <div className="space-y-2">
                    <EntityCombobox
                      value={floorBuilding}
                      onChange={(next) => {
                        setFloorBuilding(next)
                        setFloor(null)
                      }}
                      fetchOptions={fetchBuildingOptions}
                      placeholder="Pick a building to find a floor…"
                    />
                    <EntityCombobox
                      value={floor}
                      onChange={(next) => {
                        setFloor(next)
                        if (next) setAudienceError(null)
                      }}
                      fetchOptions={fetchFloorOptions(floorBuilding?.value)}
                      placeholder={floorBuilding ? "Select a floor…" : "Pick a building first"}
                      disabled={!floorBuilding}
                    />
                  </div>
                )}

                <FieldError errors={[audienceError ? { message: audienceError } : undefined]} />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create notice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
