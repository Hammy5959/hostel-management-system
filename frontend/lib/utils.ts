import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Shared money formatter for every amount shown in the UI (fee structures,
 * resident charges, dashboard stats, etc.) — display-only, never touches how
 * amounts are stored/sent (those stay Decimal strings end-to-end). Whole
 * numbers render with no decimals ("$15,000"); a genuine fractional amount
 * still renders to the cent ("$15,000.50"), never a lone stray decimal. */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  const num = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(num)) return "—"
  const isWhole = Number.isInteger(Math.round(num * 100) / 100)
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Normalizes a Decimal-as-string amount (e.g. "3000.0", "1500.00" — Postgres
 * numeric/Python Decimal both preserve trailing zeros exactly as stored) into
 * a clean numeric string for a `type="number"` input's value, e.g. "3000",
 * "1500.5". Never use this for display — use formatCurrency for that. */
export function normalizeAmountInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  const num = typeof value === "string" ? Number(value) : value
  return Number.isNaN(num) ? "" : String(num)
}

/** Today's date as YYYY-MM-DD in the viewer's LOCAL timezone — the correct
 * default for any date picker/filter representing a calendar day the user
 * sees or selects. Never use `new Date().toISOString().slice(0, 10)` for
 * this: toISOString() returns the UTC date, which lags a day behind for
 * viewers in timezones ahead of UTC during the early hours of their local
 * day. */
export function todayLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
