import type { HostelBranding } from "@/lib/types"

/** Mirrors the hostel name/logo into a plain (non-httpOnly) cookie so the
 * server can read it — same mechanism as AUTH_COOKIE/PORTAL_COOKIE in
 * lib/auth.ts, applied to branding so Topbar/Sidebar's very first
 * server-rendered paint already has the correct value (no hydration flash).
 * Pure — no window/document references — safe to import from client code,
 * Server Components, and lib/auth.ts alike. */
export const BRANDING_COOKIE = "shms.branding"

export type BrandingCookieValue = Pick<HostelBranding, "hostel_name" | "logo_url">

export function parseBrandingCookie(raw: string | undefined): BrandingCookieValue | null {
  if (!raw) return null
  try {
    return JSON.parse(decodeURIComponent(raw)) as BrandingCookieValue
  } catch {
    return null
  }
}
