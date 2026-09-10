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
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { EntityCombobox, type ComboOption } from "@/components/hostel/entity-combobox"
import { initials } from "@/components/users/user-badges"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createStaff, updateStaff } from "@/lib/api"
import { fetchStaffEligibleUserOptions } from "@/lib/hostel-options"
import type { Staff } from "@/lib/types"

const staffSchema = z.object({
  employee_number: z.string().max(100).optional().or(z.literal("")),
  designation: z.string().max(200).optional().or(z.literal("")),
  department: z.string().max(200).optional().or(z.literal("")),
  joining_date: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  emergency_contact_name: z.string().optional().or(z.literal("")),
  emergency_contact_phone: z.string().optional().or(z.literal("")),
  emergency_contact_relationship: z.string().optional().or(z.literal("")),
  is_active: z.boolean(),
})

type StaffFormValues = z.infer<typeof staffSchema>

const DEFAULT_VALUES: StaffFormValues = {
  employee_number: "",
  designation: "",
  department: "",
  joining_date: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  emergency_contact_relationship: "",
  is_active: true,
}

/** Shared add/edit dialog, following the same isEdit-from-prop shape as
 * RoleFormDialog. In add mode the first field is a User picker (a staff
 * record links to an existing user and can't be created without one); in
 * edit mode user_id is immutable, so the linked user is shown read-only
 * instead — same idiom as the Users page's avatar. */
export function StaffFormDialog({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff?: Staff
}) {
  const queryClient = useQueryClient()
  const isEdit = !!staff

  const values: StaffFormValues = staff
    ? {
        employee_number: staff.employee_number ?? "",
        designation: staff.designation ?? "",
        department: staff.department ?? "",
        joining_date: staff.joining_date ?? "",
        address: staff.address ?? "",
        emergency_contact_name: staff.emergency_contact_name ?? "",
        emergency_contact_phone: staff.emergency_contact_phone ?? "",
        emergency_contact_relationship: staff.emergency_contact_relationship ?? "",
        is_active: staff.is_active,
      }
    : DEFAULT_VALUES

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffFormValues>({
    resolver: zodResolver(staffSchema),
    values,
  })

  const [user, setUser] = useState<ComboOption | null>(null)
  const [userError, setUserError] = useState<string | null>(null)

  const userName = staff?.user ? [staff.user.first_name, staff.user.last_name].filter(Boolean).join(" ") : ""

  async function onSubmit(formValues: StaffFormValues) {
    if (!isEdit && !user) {
      setUserError("User is required")
      return
    }
    setUserError(null)

    const fields = {
      employee_number: formValues.employee_number || null,
      designation: formValues.designation || null,
      department: formValues.department || null,
      joining_date: formValues.joining_date || null,
      address: formValues.address || null,
      emergency_contact_name: formValues.emergency_contact_name || null,
      emergency_contact_phone: formValues.emergency_contact_phone || null,
      emergency_contact_relationship: formValues.emergency_contact_relationship || null,
      is_active: formValues.is_active,
    }

    try {
      if (isEdit && staff) {
        await updateStaff(staff.id, fields)
        toast.success("Staff record updated.")
      } else if (user) {
        await createStaff({ user_id: user.value, ...fields })
        toast.success("Staff record created.")
      }
      queryClient.invalidateQueries({ queryKey: ["staff"] })
      queryClient.invalidateQueries({ queryKey: ["staff-stat"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied(isEdit ? "staff.update" : "staff.create")
          toast.error(err.message)
        } else if (err.code === "user_not_found" || err.code === "staff_exists") {
          setUserError(err.message)
        } else {
          toast.error(err.message)
        }
      } else {
        toast.error("Something went wrong. Please try again.")
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset(DEFAULT_VALUES)
          setUser(null)
          setUserError(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? "Edit staff" : "Add staff"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this staff record's details." : "Link a user account to a new staff record."}
          </DialogDescription>
        </DialogHeader>

        {isEdit && staff?.user && (
          <div className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5">
            <Avatar className="size-9 border border-outline-variant">
              <AvatarImage src={staff.user.profile_picture_url ?? undefined} alt={userName} />
              <AvatarFallback className="bg-secondary-container text-xs font-bold text-on-secondary-container">
                {initials(staff.user.first_name, staff.user.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-on-surface">{userName}</p>
              <p className="truncate text-xs text-on-surface-variant">{staff.user.email}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <FieldGroup>
              {!isEdit && (
                <Field data-invalid={!!userError}>
                  <FieldLabel htmlFor="staff-form-user">
                    User <span className="text-destructive">*</span>
                  </FieldLabel>
                  <EntityCombobox
                    id="staff-form-user"
                    value={user}
                    onChange={(next) => {
                      setUser(next)
                      if (next) setUserError(null)
                    }}
                    fetchOptions={fetchStaffEligibleUserOptions}
                    placeholder="Search by name or email…"
                  />
                  <FieldError errors={[userError ? { message: userError } : undefined]} />
                </Field>
              )}

              <Field data-invalid={!!errors.employee_number}>
                <FieldLabel htmlFor="staff-form-employee-number">Employee Number</FieldLabel>
                <Input
                  id="staff-form-employee-number"
                  {...register("employee_number")}
                  aria-invalid={!!errors.employee_number}
                />
                <FieldError errors={[errors.employee_number]} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field data-invalid={!!errors.designation}>
                  <FieldLabel htmlFor="staff-form-designation">Designation</FieldLabel>
                  <Input id="staff-form-designation" {...register("designation")} aria-invalid={!!errors.designation} />
                  <FieldError errors={[errors.designation]} />
                </Field>

                <Field data-invalid={!!errors.department}>
                  <FieldLabel htmlFor="staff-form-department">Department</FieldLabel>
                  <Input id="staff-form-department" {...register("department")} aria-invalid={!!errors.department} />
                  <FieldError errors={[errors.department]} />
                </Field>
              </div>

              <Field data-invalid={!!errors.joining_date}>
                <FieldLabel htmlFor="staff-form-joining-date">Joining Date</FieldLabel>
                <Input
                  id="staff-form-joining-date"
                  type="date"
                  {...register("joining_date")}
                  aria-invalid={!!errors.joining_date}
                />
                <FieldError errors={[errors.joining_date]} />
              </Field>

              <Field data-invalid={!!errors.address}>
                <FieldLabel htmlFor="staff-form-address">Address</FieldLabel>
                <Textarea id="staff-form-address" rows={2} {...register("address")} aria-invalid={!!errors.address} />
                <FieldError errors={[errors.address]} />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field data-invalid={!!errors.emergency_contact_name}>
                  <FieldLabel htmlFor="staff-form-ec-name">Emergency Contact Name</FieldLabel>
                  <Input
                    id="staff-form-ec-name"
                    {...register("emergency_contact_name")}
                    aria-invalid={!!errors.emergency_contact_name}
                  />
                  <FieldError errors={[errors.emergency_contact_name]} />
                </Field>

                <Field data-invalid={!!errors.emergency_contact_phone}>
                  <FieldLabel htmlFor="staff-form-ec-phone">Emergency Contact Phone</FieldLabel>
                  <Input
                    id="staff-form-ec-phone"
                    {...register("emergency_contact_phone")}
                    aria-invalid={!!errors.emergency_contact_phone}
                  />
                  <FieldError errors={[errors.emergency_contact_phone]} />
                </Field>
              </div>

              <Field data-invalid={!!errors.emergency_contact_relationship}>
                <FieldLabel htmlFor="staff-form-ec-relationship">Emergency Contact Relationship</FieldLabel>
                <Input
                  id="staff-form-ec-relationship"
                  {...register("emergency_contact_relationship")}
                  aria-invalid={!!errors.emergency_contact_relationship}
                />
                <FieldError errors={[errors.emergency_contact_relationship]} />
              </Field>

              <Field orientation="horizontal">
                <FieldLabel htmlFor="staff-form-active">Active</FieldLabel>
                <Controller
                  control={control}
                  name="is_active"
                  render={({ field }) => (
                    <Switch id="staff-form-active" checked={field.value} onCheckedChange={field.onChange} />
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
              {isSubmitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create staff record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
