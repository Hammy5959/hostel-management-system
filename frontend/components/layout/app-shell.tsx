"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft } from "lucide-react";

import { Topbar } from "@/components/layout/topbar";
import { Sidebar } from "@/components/layout/sidebar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getToken } from "@/lib/auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    }
  }, [router]);

  function toggleCollapsed() {
    setCollapsed((prev) => !prev);
  }

  return (
    <div className="min-h-dvh bg-background">
      <Topbar onMenuClick={() => setMobileOpen(true)} />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 top-16 z-40 hidden border-r border-outline-variant bg-surface-container-low transition-[width] duration-300 ease-in-out md:block",
          collapsed ? "w-[72px]" : "w-[280px]",
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

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
          <Sidebar onNavigate={() => setMobileOpen(false)} />
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
