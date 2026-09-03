import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { Providers } from "@/components/providers";

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SHMS — Student Hostel Management System",
    template: "%s · SHMS",
  },
  description:
    "Institutional portal for managing students, rooms, allocations, finance, and day-to-day hostel operations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4f46e5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}