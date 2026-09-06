"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Controller, useForm } from "react-hook-form"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { markPermissionDenied } from "@/lib/permissions"
import { ApiError, createUser, getRoles } from "@/lib/api"

const userSchema = z.object({
  email: z.email("Please enter a valid email address"),
  first_name: z.string().min(1, "First name is required").max(200),
  last_name: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  role_id: z.string().min(1, "Role is required"),
  password: z.string().min(1, "Password is required").max(200),
})

type UserFormValues = z.infer<typeof userSchema>

const DEFAULT_VALUES: UserFormValues = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  role_id: "",
  password: "",
}

export function UserFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const rolesQuery = useQuery({
    queryKey: ["roles", { include_inactive: false }],
    queryFn: () => getRoles({ include_inactive: false }),
    enabled: open,
  })

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    values: DEFAULT_VALUES,
  })

  async function onSubmit(values: UserFormValues) {
    const payload = {
      email: values.email,
      first_name: values.first_name,
      last_name: values.last_name || null,
      phone: values.phone || null,
      role_id: values.role_id,
      password: values.password,
    }
    try {
      await createUser(payload)
      toast.success("User created.")
      queryClient.invalidateQueries({ queryKey: ["users"] })
      queryClient.invalidateQueries({ queryKey: ["users-stat"] })
      onOpenChange(false)
      reset(DEFAULT_VALUES)
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
        if (!next) reset(DEFAULT_VALUES)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>Create a new user account and assign it a role.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="user-email">
                Email <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="user-email"
                type="email"
                autoComplete="off"
                {...register("email")}
                aria-invalid={!!errors.email}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.first_name}>
              <FieldLabel htmlFor="user-first-name">
                First Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="user-first-name" {...register("first_name")} aria-invalid={!!errors.first_name} />
              <FieldError errors={[errors.first_name]} />
            </Field>

            <Field data-invalid={!!errors.last_name}>
              <FieldLabel htmlFor="user-last-name">Last Name</FieldLabel>
              <Input id="user-last-name" {...register("last_name")} aria-invalid={!!errors.last_name} />
              <FieldError errors={[errors.last_name]} />
            </Field>

            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="user-phone">Phone</FieldLabel>
              <Input id="user-phone" {...register("phone")} aria-invalid={!!errors.phone} />
              <FieldError errors={[errors.phone]} />
            </Field>

            <Field data-invalid={!!errors.role_id}>
              <FieldLabel htmlFor="user-role">
                Role <span className="text-destructive">*</span>
              </FieldLabel>
              <Controller
                control={control}
                name="role_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={(value) => value && field.onChange(value)}>
                    <SelectTrigger id="user-role" className="w-full" aria-invalid={!!errors.role_id}>
                      <SelectValue placeholder="Select a role">
                        {(value: string) => rolesQuery.data?.find((role) => role.id === value)?.name ?? "Select a role"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {rolesQuery.data?.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.role_id]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="user-password">
                Password <span className="text-destructive">*</span>
              </FieldLabel>
              <PasswordInput
                id="user-password"
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
              {isSubmitting ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
