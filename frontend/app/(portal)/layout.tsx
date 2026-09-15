"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PortalResidentProvider, useMyResident } from "@/components/portal/resident-provider";
import { initials } from "@/components/users/user-badges";
import { residentNavigation } from "@/lib/navigation";

function PortalAppShell({ children }: { children: React.ReactNode }) {
  const { resident } = useMyResident();

  return (
    <AppShell
      navigation={residentNavigation}
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
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalResidentProvider>
      <PortalAppShell>{children}</PortalAppShell>
    </PortalResidentProvider>
  );
}
