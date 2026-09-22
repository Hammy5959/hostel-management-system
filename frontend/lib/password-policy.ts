import { z } from "zod"

/** Mirrors backend/app/core/passwords.py's validate_password exactly — keep
 * both in sync. Applies only where a password is created or changed (user
 * creation, password reset, enabling resident portal access); never on
 * login, where any wrong password must fail the same way regardless of
 * format. */
export const PASSWORD_MIN_LENGTH = 8

const SPECIAL_CHARS = new Set("!@#$%^&*()-_=+[]{};:'\",.<>/?\\|~`")

export function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number"
  }
  if (![...password].some((char) => SPECIAL_CHARS.has(char))) {
    return "Password must contain at least one special character"
  }
  return null
}

/** Drop-in replacement for `z.string().min(1, ...).max(200)` on any password
 * field that creates or changes a password. */
export const passwordPolicySchema = z
  .string()
  .min(1, "Password is required")
  .max(200)
  .superRefine((value, ctx) => {
    const error = getPasswordPolicyError(value)
    if (error) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: error })
    }
  })
