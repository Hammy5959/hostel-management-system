/** Deployment-level branding, set via env (see .env.example).
 *
 * Name + logo priority, everywhere (sidebar, topbar, login/OTP, tab title,
 * favicon): 1) env  2) Settings → hostel name / logo (DB)  3) default.
 * Use resolveAppName / resolveLogoUrl rather than reading these directly.
 * Brand color follows the same priority (resolveBrandColor).
 *
 * NEXT_PUBLIC_* values are inlined at build time — changing them needs a
 * dev-server restart / rebuild. */
export const ENV_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || null
export const ENV_LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL?.trim() || null

export const DEFAULT_APP_NAME = "SHMS"

/** env → Settings hostel name → "SHMS". */
export function resolveAppName(settingsName?: string | null): string {
  return ENV_APP_NAME ?? (settingsName?.trim() || DEFAULT_APP_NAME)
}

/** env → Settings logo → null (callers render the default Building2 icon). */
export function resolveLogoUrl(settingsLogoUrl?: string | null): string | null {
  return ENV_LOGO_URL ?? (settingsLogoUrl || null)
}

export const DEFAULT_BRAND_COLOR = "#4f46e5"

/** Accepts "#rgb" / "#rrggbb" (case-insensitive); returns "#rrggbb" or null. */
export function normalizeHex(value: string | null | undefined): string | null {
  const match = value?.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const hex = match[1].length === 3 ? match[1].replace(/./g, "$&$&") : match[1]
  return `#${hex.toLowerCase()}`
}

/** WCAG relative luminance of a "#rrggbb" color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two "#rrggbb" colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Env brand color (invalid values are ignored). */
export const ENV_BRAND_COLOR = normalizeHex(process.env.NEXT_PUBLIC_BRAND_COLOR)

/** Primary brand color: env → Settings primary color → default indigo.
 * Every primary token in globals.css (buttons, links, rings, sidebar,
 * charts, and their light/dark shades) derives from it via the `--brand`
 * variable set on <html> in app/layout.tsx. */
export function resolveBrandColor(settingsColor?: string | null): string {
  return ENV_BRAND_COLOR ?? normalizeHex(settingsColor) ?? DEFAULT_BRAND_COLOR
}

const DARK_TEXT = "#111c2d" // matches --on-surface

/** Text color on top of a brand color — whichever of white / dark text has
 * the higher contrast, so a light brand color (e.g. yellow) stays readable. */
export function brandForeground(color: string): string {
  return contrastRatio(color, "#ffffff") >= contrastRatio(color, DARK_TEXT) ? "#ffffff" : DARK_TEXT
}

/** CSS variables for a brand color — set on <html> (app/layout.tsx), or on
 * a `data-brand-scope` element for a local preview (see globals.css). */
export function brandCssVars(color: string): Record<"--brand" | "--brand-foreground", string> {
  return { "--brand": color, "--brand-foreground": brandForeground(color) }
}
