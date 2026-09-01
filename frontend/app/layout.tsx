import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
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