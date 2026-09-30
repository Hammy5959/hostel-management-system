import { API_BASE_URL } from "@/lib/api"
import { ENV_APP_NAME, ENV_BRAND_COLOR, ENV_LOGO_URL } from "@/lib/branding"

export interface PublicBranding {
  hostel_name: string
  logo_url: string | null
  primary_color: string | null
}

/** Cache tag for the public branding fetch — expired on Settings save by
 * refreshBrandingCache (lib/branding-actions.ts). */
export const BRANDING_CACHE_TAG = "hostel-branding"

/** Server-only: Settings name, logo and brand color for server-rendered
 * branding (root layout, login/OTP), from the unauthenticated
 * GET /hostel-settings/branding. Skipped entirely when env already supplies
 * all three (env wins anyway — see lib/branding.ts). Cached for 60s and
 * expired immediately on a Settings save; fetch is memoized per request, so
 * layout + page share one call. Never throws — a down/unreachable backend
 * just means the defaults render. */
export async function getPublicBranding(): Promise<PublicBranding | null> {
  if (ENV_APP_NAME && ENV_LOGO_URL && ENV_BRAND_COLOR) return null
  try {
    const res = await fetch(`${API_BASE_URL}/hostel-settings/branding`, {
      next: { revalidate: 60, tags: [BRANDING_CACHE_TAG] },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    return (await res.json()) as PublicBranding
  } catch {
    return null
  }
}
