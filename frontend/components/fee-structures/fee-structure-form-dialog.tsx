"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createFeeStructure, updateFeeStructure } from "@/lib/api"
import type { FeeStructure } from "@/lib/types"

export const FEE_STRUCTURE_FREQUENCY_OPTIONS = ["Monthly", "Weekly", "Yearly", "One-time"] as const

const feeStructureSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().or(z.literal("")),
  amount: z.coerce.number().min(0, "Must be 0 or more"),
  frequency: z.enum(FEE_STRUCTURE_FREQUENCY_OPTIONS),
  is_active: z.boolean(),
  effective_from: z.string().optional().or(z.literal("")),
  effective_until: z.string().optional().or(z.literal("")),
})

type FeeStructureFormValues = z.infer<typeof feeStructureSchema>

/** Shared create/edit fee structure form — "+ Add Fee Structure" and every
 * card's "Edit" button both open this same dialog, so there is exactly one
 * fee-structure-editing implementation in the app (mirrors RoomFormDialog). */
export function FeeStructureFormDialog({
  open,
  onOpenChange,
  feeStructure,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  feeStructure: FeeStructure | null
}) {
  const queryClient = useQueryClient()
  const isEdit = !!feeStructure

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof feeStructureSchema>, unknown, FeeStructureFormValues>({
    resolver: zodResolver(feeStructureSchema),
    values: {
      name: feeStructure?.name ?? "",
      description: feeStructure?.description ?? "",
      amount: feeStructure ? Number(feeStructure.amount) : 0,
      frequency: (feeStructure?.frequency as FeeStructureFormValues["frequency"]) ?? "Monthly",
      is_active: feeStructure?.is_active ?? true,
      effective_from: feeStructure?.effective_from ?? "",
      effective_until: feeStructure?.effective_until ?? "",
    },
  })

  async function onSubmit(values: FeeStructureFormValues) {
    try {
      const payload = {
        name: values.name,
        description: values.description || null,
        amount: values.amount,
        frequency: values.frequency,
        is_active: values.is_active,
        effective_from: values.effective_from || null,
        effective_until: values.effective_until || null,
      }
      if (isEdit && feeStructure) {
        await updateFeeStructure(feeStructure.id, payload)
        toast.success("Fee structure updated.")
      } else {
        await createFeeStructure(payload)
        toast.success("Fee structure created.")
      }
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("fee_structures.manage")
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
          <DialogTitle>{isEdit ? "Edit fee structure" : "Add fee structure"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this fee structure's pricing, frequency, and effective dates."
              : "Define a new fee category, its amount, and when it applies."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="fee-name">
                  Name <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="fee-name"
                  placeholder="e.g. Monthly Rent"
                  {...register("name")}
                  aria-invalid={!!errors.name}
                />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.amount}>
                <FieldLabel htmlFor="fee-amount">
                  Amount <span className="text-destructive">*</span>
                </FieldLabel>
                <Input
                  id="fee-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  {...register("amount")}
                  aria-invalid={!!errors.amount}
                />
                <FieldError errors={[errors.amount]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="fee-frequency">
                  Frequency <span className="text-destructive">*</span>
                </FieldLabel>
                <Controller
                  control={control}
                  name="frequency"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        if (value) field.onChange(value)
                      }}
                    >
                      <SelectTrigger id="fee-frequency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FEE_STRUCTURE_FREQUENCY_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="fee-effective-from">Effective from</FieldLabel>
                <Input id="fee-effective-from" type="date" {...register("effective_from")} />
              </Field>

              <Field>
                <FieldLabel htmlFor="fee-effective-until">Effective until</FieldLabel>
                <Input id="fee-effective-until" type="date" {...register("effective_until")} />
              </Field>

              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="fee-description">Description</FieldLabel>
                <Textarea id="fee-description" rows={2} {...register("description")} />
                <FieldError errors={[errors.description]} />
              </Field>

              <Field orientation="horizontal">
                <FieldLabel htmlFor="fee-active">Active</FieldLabel>
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => (
                    <Switch
                      id="fee-active"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create fee structure"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
