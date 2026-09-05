"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"

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
import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createMessMenu, updateMessMenu } from "@/lib/api"
import type { MenuOut } from "@/lib/types"

const menuSchema = z.object({
  menu_date: z.string().min(1, "Date is required"),
  breakfast: z.string().optional().or(z.literal("")),
  lunch: z.string().optional().or(z.literal("")),
  dinner: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
})

type MenuFormValues = z.infer<typeof menuSchema>

export function MenuFormDialog({
  open,
  onOpenChange,
  menu,
  defaultDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  menu: MenuOut | null
  defaultDate: string
}) {
  const queryClient = useQueryClient()
  const isEdit = !!menu

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof menuSchema>, unknown, MenuFormValues>({
    resolver: zodResolver(menuSchema),
    values: {
      menu_date: menu?.menu_date ?? defaultDate,
      breakfast: menu?.breakfast ?? "",
      lunch: menu?.lunch ?? "",
      dinner: menu?.dinner ?? "",
      notes: menu?.notes ?? "",
    },
  })

  async function onSubmit(values: MenuFormValues) {
    try {
      if (isEdit && menu) {
        await updateMessMenu(menu.id, {
          breakfast: values.breakfast || null,
          lunch: values.lunch || null,
          dinner: values.dinner || null,
          notes: values.notes || null,
        })
        toast.success("Menu updated.")
      } else {
        await createMessMenu({
          menu_date: values.menu_date,
          breakfast: values.breakfast || null,
          lunch: values.lunch || null,
          dinner: values.dinner || null,
          notes: values.notes || null,
        })
        toast.success("Menu created.")
      }
      queryClient.invalidateQueries({ queryKey: ["mess-menus"] })
      queryClient.invalidateQueries({ queryKey: ["mess-menus-week-stats"] })
      onOpenChange(false)
      reset()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "mess_menus.update" : "mess_menus.create")
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
          <DialogTitle>{isEdit ? "Edit menu" : "Add menu"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this day's mess menu." : "Set the mess menu for a day."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <FieldGroup>
              <Field>
                <FieldLabel>Date</FieldLabel>
                {isEdit ? (
                  <p className="rounded-lg border border-input bg-muted/40 px-2.5 py-1.5 text-sm text-on-surface-variant">
                    {format(new Date(`${menu!.menu_date}T00:00:00`), "EEEE, MMM d, yyyy")}
                  </p>
                ) : (
                  <Input type="date" {...register("menu_date")} aria-invalid={!!errors.menu_date} />
                )}
                <FieldError errors={[errors.menu_date]} />
              </Field>

              <Field data-invalid={!!errors.breakfast}>
                <FieldLabel htmlFor="menu-breakfast">Breakfast</FieldLabel>
                <Textarea id="menu-breakfast" rows={2} {...register("breakfast")} />
                <FieldError errors={[errors.breakfast]} />
              </Field>

              <Field data-invalid={!!errors.lunch}>
                <FieldLabel htmlFor="menu-lunch">Lunch</FieldLabel>
                <Textarea id="menu-lunch" rows={2} {...register("lunch")} />
                <FieldError errors={[errors.lunch]} />
              </Field>

              <Field data-invalid={!!errors.dinner}>
                <FieldLabel htmlFor="menu-dinner">Dinner</FieldLabel>
                <Textarea id="menu-dinner" rows={2} {...register("dinner")} />
                <FieldError errors={[errors.dinner]} />
              </Field>

              <Field data-invalid={!!errors.notes}>
                <FieldLabel htmlFor="menu-notes">Notes</FieldLabel>
                <Textarea id="menu-notes" rows={2} {...register("notes")} />
                <FieldError errors={[errors.notes]} />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="mt-6 shrink-0 border-t border-outline-variant pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create menu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
