import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { Providers } from "@/components/providers";
import { brandCssVars, resolveAppName, resolveBrandColor, resolveLogoUrl } from "@/lib/branding";
import { getPublicBranding } from "@/lib/public-branding";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  // env → Settings (public branding endpoint) → default; see lib/branding.ts.
  const publicBranding = await getPublicBranding();
  const appName = resolveAppName(publicBranding?.hostel_name);
  const logoUrl = resolveLogoUrl(publicBranding?.logo_url);
  return {
    title: {
      default: `${appName} — Student Hostel Management System`,
      template: `%s · ${appName}`,
    },
    // Favicon: env logo → Settings logo → Next.js default icon (public/, not
    // app/ — a file-based app/favicon.ico would override this every time).
    icons: { icon: logoUrl ?? "/favicon.ico" },
    description:
      "Institutional portal for managing students, rooms, allocations, finance, and day-to-day hostel operations.",
  };
}

export async function generateViewport(): Promise<Viewport> {
  const publicBranding = await getPublicBranding();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: resolveBrandColor(publicBranding?.primary_color),
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // env → Settings → default (lib/branding.ts); memoized with the metadata fetch.
  const publicBranding = await getPublicBranding();
  const brandColor = resolveBrandColor(publicBranding?.primary_color);

  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      // Server-rendered so the brand color is right on first paint; every
      // primary token in globals.css derives from --brand.
      style={brandCssVars(brandColor) as React.CSSProperties}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}