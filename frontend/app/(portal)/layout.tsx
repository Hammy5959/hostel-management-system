import { cookies } from "next/headers";

import { PortalAppShell } from "@/components/portal/portal-app-shell";
import { PortalResidentProvider } from "@/components/portal/resident-provider";
import { BRANDING_COOKIE, parseBrandingCookie } from "@/lib/branding-cookie";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialBranding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);

  return (
    <PortalResidentProvider>
      <PortalAppShell initialBranding={initialBranding}>{children}</PortalAppShell>
    </PortalResidentProvider>
  );
}
