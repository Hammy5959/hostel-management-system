import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { getStoredBranding } from "@/lib/auth"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Mirrors the hostel_settings.currency DB default. */
const DEFAULT_CURRENCY = "PKR"

/** Locale per Settings currency option, so each renders with its familiar
 * symbol/grouping (PKR → "Rs 15,000", INR → "₹1,50,000"). Unlisted codes
 * fall back to en-US ("AED 15,000"-style). */
const CURRENCY_LOCALE: Record<string, string> = {
  PKR: "en-PK",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "en-IE",
  AED: "en-AE",
  SAR: "en-SA",
  INR: "en-IN",
  CNY: "en-CN",
  CAD: "en-CA",
  AUD: "en-AU",
}

/** Shared money formatter for every amount shown in the UI (fee structures,
 * resident charges, dashboard stats, etc.) — display-only, never touches how
 * amounts are stored/sent (those stay Decimal strings end-to-end), and a
 * currency change never converts amounts, only relabels them. Whole numbers
 * render with no decimals ("Rs 15,000"); a genuine fractional amount still
 * renders to the cent ("Rs 15,000.50"), never a lone stray decimal.
 *
 * The currency comes from Settings via the synchronous branding cache
 * (lib/auth.ts — seeded at login, kept fresh by useHostelBranding), so the
 * ~40 call sites stay plain function calls. Note: it's read at render time,
 * not subscribed — an already-rendered page picks up a currency change on
 * its next re-render/navigation. A reactive useCurrency() hook threaded
 * through every call site would be the fully-live alternative. */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—"
  const num = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(num)) return "—"
  const isWhole = Number.isInteger(Math.round(num * 100) / 100)
  const currency = getStoredBranding()?.currency || DEFAULT_CURRENCY
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US", { ...options, currency }).format(num)
  } catch {
    // Invalid/unknown ISO code stored in settings — don't crash the page.
    return new Intl.NumberFormat(CURRENCY_LOCALE[DEFAULT_CURRENCY], { ...options, currency: DEFAULT_CURRENCY }).format(num)
  }
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
