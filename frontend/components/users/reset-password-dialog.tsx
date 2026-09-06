"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Lock } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
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
import { ApiError, resetUserPassword } from "@/lib/api"

const resetPasswordSchema = z
  .object({
    password: z.string().min(1, "Password is required").max(200),
    confirmPassword: z.string().min(1, "Please confirm the password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

type ResetPasswordValues = z.infer<typeof resetPasswordSchema>

const DEFAULT_VALUES: ResetPasswordValues = { password: "", confirmPassword: "" }

export function ResetPasswordDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    values: DEFAULT_VALUES,
  })

  async function onSubmit(values: ResetPasswordValues) {
    try {
      await resetUserPassword(userId, { password: values.password })
      toast.success(`Password reset for ${userName}.`)
      onOpenChange(false)
      reset(DEFAULT_VALUES)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "missing_permission") {
          markPermissionDenied("users.update")
        }
        toast.error(err.message)
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
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {userName}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="reset-password">
                New Password <span className="text-destructive">*</span>
              </FieldLabel>
              <PasswordInput
                id="reset-password"
                autoComplete="new-password"
                leftIcon={<Lock aria-hidden className="size-4 text-on-surface-variant" />}
                {...register("password")}
                aria-invalid={!!errors.password}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="reset-confirm-password">
                Confirm Password <span className="text-destructive">*</span>
              </FieldLabel>
              <PasswordInput
                id="reset-confirm-password"
                autoComplete="new-password"
                leftIcon={<Lock aria-hidden className="size-4 text-on-surface-variant" />}
                {...register("confirmPassword")}
                aria-invalid={!!errors.confirmPassword}
              />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Reset Password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
