"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Lock } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
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
import { ApiError, createResidentPortalUser } from "@/lib/api"
import type { Resident } from "@/lib/types"

const portalUserSchema = z.object({
  email: z.email("Please enter a valid email address"),
  first_name: z.string().min(1, "First name is required").max(200),
  last_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  password: z.string().min(1, "Password is required").max(200),
})

type PortalUserFormValues = z.infer<typeof portalUserSchema>

/** "Enable Portal Access" — adapted from components/users/user-form-dialog.tsx:
 * same fields/validation, but no Role select (fixed to `resident` on the
 * backend, never shown here), and prefilled from the resident rather than
 * blank. Submits to the atomic create-and-link endpoint instead of
 * createUser(). */
export function EnablePortalAccessDialog({
  open,
  onOpenChange,
  resident,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  resident: Resident
}) {
  const queryClient = useQueryClient()

  const defaultValues: PortalUserFormValues = {
    email: resident.email ?? "",
    first_name: resident.first_name,
    last_name: resident.last_name ?? "",
    phone: resident.phone ?? "",
    password: "",
  }

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PortalUserFormValues>({
    resolver: zodResolver(portalUserSchema),
    values: defaultValues,
  })

  async function onSubmit(values: PortalUserFormValues) {
    try {
      await createResidentPortalUser(resident.id, {
        email: values.email,
        first_name: values.first_name,
        last_name: values.last_name || null,
        phone: values.phone || null,
        password: values.password,
      })
      toast.success("Portal access enabled.")
      queryClient.invalidateQueries({ queryKey: ["resident", resident.id] })
      onOpenChange(false)
      reset(defaultValues)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("users.create")
        }
        if (err.code === "email_exists") {
          setError("email", { type: "manual", message: err.message })
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
        if (!next) reset(defaultValues)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable Portal Access</DialogTitle>
          <DialogDescription>
            Create a resident portal login for {resident.first_name}. They&apos;ll sign in with the
            email and password set here.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="portal-user-email">
                Email <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="portal-user-email"
                type="email"
                autoComplete="off"
                {...register("email")}
                aria-invalid={!!errors.email}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.first_name}>
              <FieldLabel htmlFor="portal-user-first-name">
                First Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="portal-user-first-name" {...register("first_name")} aria-invalid={!!errors.first_name} />
              <FieldError errors={[errors.first_name]} />
            </Field>

            <Field data-invalid={!!errors.last_name}>
              <FieldLabel htmlFor="portal-user-last-name">Last Name</FieldLabel>
              <Input id="portal-user-last-name" {...register("last_name")} aria-invalid={!!errors.last_name} />
              <FieldError errors={[errors.last_name]} />
            </Field>

            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="portal-user-phone">Phone</FieldLabel>
              <Input id="portal-user-phone" {...register("phone")} aria-invalid={!!errors.phone} />
              <FieldError errors={[errors.phone]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="portal-user-password">
                Password <span className="text-destructive">*</span>
              </FieldLabel>
              <PasswordInput
                id="portal-user-password"
                autoComplete="new-password"
                leftIcon={<Lock aria-hidden className="size-4 text-on-surface-variant" />}
                {...register("password")}
                aria-invalid={!!errors.password}
              />
              <FieldError errors={[errors.password]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enabling…" : "Enable Portal Access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
