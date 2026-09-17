import { cookies } from "next/headers";

import { AppShell } from "@/components/layout/app-shell";
import { BRANDING_COOKIE, parseBrandingCookie } from "@/lib/branding-cookie";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialBranding = parseBrandingCookie(cookieStore.get(BRANDING_COOKIE)?.value);

  return <AppShell initialBranding={initialBranding}>{children}</AppShell>;
}
