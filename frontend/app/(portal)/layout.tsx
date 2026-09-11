"use client";

import { AppShell } from "@/components/layout/app-shell";
import { PortalResidentProvider } from "@/components/portal/resident-provider";
import { residentNavigation } from "@/lib/navigation";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalResidentProvider>
      <AppShell
        navigation={residentNavigation}
        topbarProps={{
          homeHref: "/portal",
          brandLabel: "Resident Portal",
          profileHref: "/portal/profile",
        }}
      >
        {children}
      </AppShell>
    </PortalResidentProvider>
  );
}
