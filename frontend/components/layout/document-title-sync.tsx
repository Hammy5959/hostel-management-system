"use client"

import { useEffect, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import { getStoredUser, subscribeUser } from "@/lib/auth"
import { useHostelBranding } from "@/lib/hostel-settings"

/** Syncs the live browser tab title to the hostel name once settings load.
 * This is NOT Next.js metadata — the root layout's `metadata` export is
 * resolved server-side before any client fetch can run, and this endpoint
 * needs the browser-stored JWT a Server Component can't reach. This only
 * updates the tab title after hydration; server-rendered HTML and
 * social-preview tags keep the static "SHMS — Student Hostel Management
 * System" fallback.
 *
 * Re-runs on every route change too (not just when the hostel name loads) —
 * Next re-sets `document.title` per-page on navigation, and this effect
 * commits after that, so it always re-appends the hostel name onto whatever
 * title the new page just set rather than going stale after the first page. */
export function DocumentTitleSync() {
  const pathname = usePathname()
  // This component is mounted app-wide (including /login, before a token
  // exists) — gate the fetch on an authenticated session so unauthenticated
  // pages never attempt (and fail) this call.
  const user = useSyncExternalStore(subscribeUser, getStoredUser, () => null)
  const branding = useHostelBranding({ enabled: !!user })

  useEffect(() => {
    if (!branding?.hostel_name) return
    const base = document.title.split(" · ")[0]
    document.title = `${base} · ${branding.hostel_name}`
    // pathname is a re-sync trigger, not a value read in the effect body.
  }, [branding?.hostel_name, pathname])

  return null
}
