"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { PasswordInput } from "@/components/ui/password-input"
import { OtpInput } from "@/components/auth/otp-input"
import { setStoredUser, setToken } from "@/lib/auth"
import { ApiError, requestOtp, verifyOtp } from "@/lib/api"

const RESEND_COOLDOWN_SECONDS = 45

interface VerifyOtpFormProps {
  email?: string
}

export function VerifyOtpForm({ email: initialEmail }: VerifyOtpFormProps) {
  const router = useRouter()
  const [email] = useState(
    () =>
      initialEmail ??
      (typeof window !== "undefined"
        ? window.sessionStorage.getItem("shms.otp_email")
        : null) ??
      "",
  )
  const [otp, setOtp] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS)
  const [resendPassword, setResendPassword] = useState("")
  const [showResendPrompt, setShowResendPrompt] = useState(false)

  const complete = otp.length === 6

  useEffect(() => {
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [secondsLeft])

  if (!email) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <p className="text-sm text-on-surface-variant">
          No email address on file. Please start from the sign-in screen.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/login")}
          className="h-11 rounded-lg px-4"
        >
          Back to login
        </Button>
      </div>
    )
  }

  const formattedTimer = `(0:${secondsLeft < 10 ? "0" : ""}${secondsLeft})`

  async function handleVerify(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!complete || submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const res = await verifyOtp(email, otp)
      setToken(res.access_token)
      setStoredUser(res.user)
      toast.success(`Welcome back, ${res.user.first_name} ${res.user.last_name}!`)
      window.sessionStorage.removeItem("shms.otp_email")
      router.replace("/dashboard")
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Unable to verify the code. Please try again.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  function handleResend() {
    if (resending || secondsLeft > 0) return
    // Requesting a new OTP re-runs the password check (factor 1). The password
    // is never stored between screens, so ask for it inline here.
    setShowResendPrompt(true)
  }

  async function sendResend() {
    const password = resendPassword.trim()
    if (!password || resending) return

    setResending(true)
    setError(null)
    try {
      const res = await requestOtp(email, password)
      setOtp("")
      setSecondsLeft(RESEND_COOLDOWN_SECONDS)
      setShowResendPrompt(false)
      setResendPassword("")
      toast.success(res.message ?? "A new verification code has been sent.")
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "invalid_credentials" || err.code === "user_not_found") {
          toast.error("Invalid email or password")
        } else {
          toast.error(err.message)
        }
      } else {
        toast.error("Unable to resend the code. Please try again.")
      }
    } finally {
      setResending(false)
    }
  }

  return (
    <form onSubmit={handleVerify} noValidate className="space-y-6">
      {/* OTP inputs */}
      <div>
        <OtpInput value={otp} onChange={setOtp} error={!!error} disabled={submitting} />
        <div aria-live="polite" className="mt-2 min-h-5">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <p className="text-xs text-on-surface-variant">
              The code expires in 5 minutes.
            </p>
          )}
        </div>
      </div>

      {/* Verify button */}
      <Button
        type="submit"
        size="lg"
        disabled={!complete || submitting}
        className="h-12 w-full rounded-lg bg-primary-container text-[15px] font-semibold text-white hover:bg-primary-container/90"
      >
        {submitting ? (
          <>
            <span
              aria-hidden
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            Verifying…
          </>
        ) : (
          "Verify & Sign In"
        )}
      </Button>

      {/* Resend & back actions */}
      <div className="flex w-full max-w-[24rem] flex-col items-center gap-4 pt-2">
        <p className="text-sm text-on-surface-variant">
          Didn&apos;t receive the code?
          <button
            type="button"
            disabled={secondsLeft > 0 || resending}
            onClick={handleResend}
            className="ml-1 text-sm font-semibold text-primary transition-colors hover:text-primary-container disabled:cursor-not-allowed disabled:text-outline"
          >
            {resending ? "Sending…" : "Resend code"}{" "}
            {secondsLeft > 0 && (
              <span className="text-sm tabular-nums text-on-surface-variant">
                {formattedTimer}
              </span>
            )}
          </button>
        </p>

        {showResendPrompt && (
          <div className="w-full space-y-2">
            <Label
              htmlFor="resend-password"
              className="text-xs font-semibold tracking-wide text-on-surface-variant"
            >
              Password
            </Label>
            <PasswordInput
              id="resend-password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={resendPassword}
              onChange={(e) => setResendPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void sendResend()
                }
              }}
              className="h-10 text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-on-surface-variant">
                Enter your password to request a new code.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => void sendResend()}
                disabled={!resendPassword.trim() || resending}
                className="shrink-0 rounded-lg"
              >
                {resending ? "Sending…" : "Send code"}
              </Button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back to login
        </button>
      </div>
    </form>
  )
}
