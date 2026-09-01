"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowRight, Lock, Mail } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { getToken } from "@/lib/auth"
import { ApiError, requestOtp } from "@/lib/api"

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address"),

  password: z.string().min(1, "Password is required"),
})

type LoginValues = z.infer<typeof loginSchema>

const OTP_EMAIL_KEY = "shms.otp_email"

export function LoginForm() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    // Re-validate only on submit so field-specific errors cleared on typing
    // (via the register onChange handlers) stay cleared instead of being
    // immediately re-added by async zod re-validation.
    reValidateMode: "onSubmit",
    defaultValues: {
      email: "",
      password: "",
    },
  })

  // Already authenticated? Skip straight to the dashboard.
  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard")
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(values: LoginValues) {
    setSubmitting(true)
    setFormError(null)

    const email = values.email.trim().toLowerCase()

    try {
      const res = await requestOtp(email, values.password)

      window.sessionStorage.setItem(OTP_EMAIL_KEY, email)

      toast.success(
        res.message ?? "Verification code sent. Check your inbox.",
      )

      router.push(
        `/verify-otp?email=${encodeURIComponent(email)}`,
      )
    } catch (err) {
      if (err instanceof ApiError) {
        if (
          err.code === "invalid_credentials" ||
          err.code === "user_not_found"
        ) {
          // Keep the backend response generic.
          setFormError("Invalid email or password")
        } else {
          toast.error(err.message)
        }
      } else {
        toast.error("Something went wrong. Please try again.")
      }

      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-6"
    >
      {/* Email */}
      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-xs font-semibold tracking-wide text-on-surface-variant"
        >
          Institutional Email
        </Label>

        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 my-auto ml-3.5 size-5 text-on-surface-variant"
          />

          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="admin@university.edu"
            aria-invalid={!!errors.email || !!formError}
            aria-describedby={
              errors.email ? "email-error" : undefined
            }
            className="h-12 pl-10 pr-3.5 text-base text-on-surface placeholder:text-on-surface-variant/70 focus-visible:ring-primary/20"
            {...register("email", {
              onChange: () => {
                // Remove only the email validation error.
                clearErrors("email")

                // Remove backend authentication error.
                setFormError(null)
              },
            })}
          />
        </div>

        {errors.email && (
          <p
            id="email-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-2">
        <Label
          htmlFor="password"
          className="text-xs font-semibold tracking-wide text-on-surface-variant"
        >
          Password
        </Label>

        <PasswordInput
          id="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          aria-invalid={!!errors.password || !!formError}
          aria-describedby={
            errors.password ? "password-error" : undefined
          }
          leftIcon={
            <Lock
              aria-hidden
              className="size-5 text-on-surface-variant"
            />
          }
          className="h-12 text-base text-on-surface placeholder:text-on-surface-variant/70 focus-visible:ring-primary/20"
          {...register("password", {
            onChange: () => {
              // Remove only the password validation error.
              clearErrors("password")

              // Remove backend authentication error.
              setFormError(null)
            },
          })}
        />

        {errors.password && (
          <p
            id="password-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Backend authentication error */}
      {formError && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        disabled={submitting}
        className="h-12 w-full rounded-lg bg-primary-container text-[15px] font-semibold text-white hover:bg-primary-container/90"
      >
        {submitting ? (
          <>
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            Sending code…
          </>
        ) : (
          <>
            Continue with OTP
            <ArrowRight
              aria-hidden
              className="size-5"
            />
          </>
        )}
      </Button>
    </form>
  )
}