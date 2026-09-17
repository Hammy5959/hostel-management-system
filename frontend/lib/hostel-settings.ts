import { useSyncExternalStore } from "react"
import { useQuery } from "@tanstack/react-query"

import { getHostelSettings } from "@/lib/api"
import { getStoredBranding, subscribeUser } from "@/lib/auth"
import type { HostelBranding } from "@/lib/types"

/** Shared "fetch once, use everywhere" hostel branding/locale data —
 * consumed by the Settings page and the Topbar/Sidebar brand block.
 * React Query dedupes/caches by query key app-wide, so this is called
 * directly wherever needed rather than threaded through props or a
 * Context provider (this app has no such provider outside the Resident
 * Portal's own scoped one). */
export function useHostelSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["hostel-settings"],
    queryFn: getHostelSettings,
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
  })
}

/** Flash-free branding for the Topbar/Sidebar/tab title. The synchronously
 * cached login-time snapshot (localStorage, via lib/auth.ts — zero flash on
 * refresh) seeds the value until the live query resolves; the live
 * GET /hostel-settings/current query (shares the exact same query key/cache
 * as useHostelSettings, so this never fires an extra request) supersedes it
 * the instant it's available, including right after a save's
 * queryClient.setQueryData — so instant-update-on-save keeps working.
 * Use useHostelSettings() directly instead when the FULL settings object is
 * needed (e.g. the Settings page's edit form) — seeding a full-shaped
 * result from this branding-only subset would silently hide the rest of
 * the fields until the real fetch lands. */
export function useHostelBranding(options: { enabled?: boolean } = {}): HostelBranding | null {
  const cached = useSyncExternalStore(subscribeUser, getStoredBranding, () => null)
  const { data } = useHostelSettings(options)
  if (data) {
    return { hostel_name: data.hostel_name, logo_url: data.logo_url, timezone: data.timezone, currency: data.currency }
  }
  return cached
}
