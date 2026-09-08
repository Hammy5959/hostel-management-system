"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Lock } from "lucide-react"
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createRole, updateRole } from "@/lib/api"
import type { Role, RoleUpdateInput } from "@/lib/types"

const roleSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  is_active: z.boolean(),
})

/** As-you-type transform so the value is always a valid backend role name
 * (^[a-z0-9_]+$): lowercase, whitespace runs -> single underscore, strip
 * anything else, collapse repeated underscores. Deliberately doesn't trim a
 * trailing underscore — that's the placeholder for "still typing the next
 * word" (see trimRoleNameEdges, applied on blur/submit instead). */
function sanitizeRoleNameInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
}

function trimRoleNameEdges(value: string): string {
  return value.replace(/^_+|_+$/g, "")
}

type RoleFormValues = z.infer<typeof roleSchema>

const DEFAULT_VALUES: RoleFormValues = {
  name: "",
  description: "",
  is_active: true,
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role?: Role
}) {
  const queryClient = useQueryClient()
  const isEdit = !!role
  const isSystemRole = !!role?.is_system_role
  const isSuperAdmin = role?.name === "super_admin"

  const values: RoleFormValues = role
    ? { name: role.name, description: role.description ?? "", is_active: role.is_active }
    : DEFAULT_VALUES

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RoleFormValues>({
    resolver: zodResolver(roleSchema),
    values,
  })

  async function onSubmit(formValues: RoleFormValues) {
    const name = trimRoleNameEdges(formValues.name)
    try {
      if (isEdit && role) {
        const patch: RoleUpdateInput = {}
        if (!isSystemRole && name !== role.name) patch.name = name
        const nextDescription = formValues.description || null
        if (nextDescription !== role.description) patch.description = nextDescription
        if (!isSuperAdmin && formValues.is_active !== role.is_active) patch.is_active = formValues.is_active
        await updateRole(role.id, patch)
        toast.success("Role updated.")
      } else {
        await createRole({
          name,
          description: formValues.description || null,
          is_active: formValues.is_active,
        })
        toast.success("Role created.")
      }
      queryClient.invalidateQueries({ queryKey: ["roles"] })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("roles.manage")
        }
        if (err.code === "role_name_exists") {
          setError("name", { type: "manual", message: err.message })
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
        if (!next) reset(DEFAULT_VALUES)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit role" : "Add role"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this role's details." : "Create a new custom role."}
          </DialogDescription>
        </DialogHeader>

        {isSystemRole && (
          <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-xs text-on-surface-variant">
            <Lock aria-hidden className="size-3.5 shrink-0" />
            {isSuperAdmin
              ? "This is the Super Admin role — name and active status can't be changed."
              : "This is a system role — name can't be changed, but you can still activate or deactivate it."}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="role-name">
                Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <Input
                    id="role-name"
                    value={field.value}
                    onChange={(e) => field.onChange(sanitizeRoleNameInput(e.target.value))}
                    onBlur={() => {
                      field.onChange(trimRoleNameEdges(field.value))
                      field.onBlur()
                    }}
                    disabled={isSystemRole}
                    aria-invalid={!!errors.name}
                  />
                )}
              />
              <FieldDescription>
                Lowercase letters, numbers, and underscores only.
                
              </FieldDescription>
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="role-description">Description</FieldLabel>
              <Textarea
                id="role-description"
                rows={3}
                {...register("description")}
                aria-invalid={!!errors.description}
              />
              <FieldError errors={[errors.description]} />
            </Field>

            <Field orientation="horizontal">
              <FieldLabel htmlFor="role-active">Active</FieldLabel>
              <Controller
                control={control}
                name="is_active"
                render={({ field }) => (
                  <Switch
                    id="role-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSuperAdmin}
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
              {isSubmitting ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
