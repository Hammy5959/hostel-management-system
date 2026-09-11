"use client";

import { useState } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Sidebar } from "@/components/layout/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { navigation as staffNavigation, type NavEntry } from "@/lib/navigation";

interface AppShellProps {
  children: React.ReactNode;
  /** Defaults to the staff nav so app/(app)/layout.tsx needs no change —
   * app/(portal)/layout.tsx passes residentNavigation instead. */
  navigation?: NavEntry[];
  /** Forwarded to Topbar; undefined (the default) is a no-op spread, so
   * staff usage renders Topbar's own hardcoded defaults unchanged. */
  topbarProps?: {
    homeHref?: string;
    brandLabel?: string;
    profileHref?: string;
  };
}

// Auth is guarded server-side by proxy.ts before this ever renders — no
// client-side redirect needed here (and none would be flash-free anyway).
export function AppShell({ children, navigation = staffNavigation, topbarProps }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  function toggleCollapsed() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div className="min-h-dvh bg-background">
      <Topbar onMenuClick={() => setMobileOpen(true)} {...topbarProps} />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 top-16 z-40 hidden border-r border-outline-variant bg-surface-container-low transition-[width] duration-300 ease-in-out md:block",
          collapsed ? "w-[72px]" : "w-[280px]",
        )}
      >
        <Sidebar navigation={navigation} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

        {/* Collapse / expand toggle, centered on the sidebar's right edge */}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleCollapsed}
          className="absolute right-0 top-[12%] z-50 hidden size-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container-high hover:text-on-surface md:flex hover:cursor-pointer"
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="size-3.5" />
          ) : (
            <ChevronLeft aria-hidden className="size-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-[280px] bg-surface-container-low p-0 sm:max-w-[280px]"
        >
          <Sidebar navigation={navigation} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Main content */}
      <div
        className={cn(
          "pt-16 transition-[padding] duration-300 ease-in-out",
          collapsed ? "md:pl-[72px]" : "md:pl-[280px]",
        )}
      >
        <main className="mx-auto w-full max-w-[1440px] p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
