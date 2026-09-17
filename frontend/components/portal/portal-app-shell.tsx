"use client"

import { AppShell } from "@/components/layout/app-shell"
import { useMyResident } from "@/components/portal/resident-provider"
import { initials } from "@/components/users/user-badges"
import { residentNavigation } from "@/lib/navigation"
import type { BrandingCookieValue } from "@/lib/branding-cookie"

/** Extracted out of app/(portal)/layout.tsx so that file can be a plain
 * Server Component (able to call cookies()) — this part needs the
 * resident-context hook, so it stays "use client". */
export function PortalAppShell({
  children,
  initialBranding,
}: {
  children: React.ReactNode
  initialBranding: BrandingCookieValue | null
}) {
  const { resident } = useMyResident()

  return (
    <AppShell
      navigation={residentNavigation}
      initialBranding={initialBranding}
      topbarProps={{
        homeHref: "/portal",
        brandLabel: "Resident Portal",
        profileHref: "/portal/profile",
        // Resident-record identity (not the login user account), so the
        // topbar matches /portal/profile. Undefined while still loading —
        // Topbar falls back to the user-account identity until it resolves.
        identityName: resident ? `${resident.first_name} ${resident.last_name ?? ""}`.trim() : undefined,
        identityPhotoUrl: resident?.profile_picture_url,
        identityInitials: resident ? initials(resident.first_name, resident.last_name) : undefined,
      }}
    >
      {children}
    </AppShell>
  )
}
