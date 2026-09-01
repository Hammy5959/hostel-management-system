"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { Building2, ChevronRight, LogOut } from "lucide-react"

import { cn } from "@/lib/utils"
import { navigation } from "@/lib/navigation"
import { clearToken } from "@/lib/auth"

interface SidebarProps {
  onNavigate?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function Sidebar({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const pathname = usePathname()
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  function toggleGroup(id: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })
  }

  function handleGroupClick(id: string) {
    if (collapsed) {
      // Reveal the sidebar with this group open so its items stay reachable
      setOpenGroups((prev) => new Set(prev).add(id))
      onToggleCollapsed?.()
    } else {
      toggleGroup(id)
    }
  }

  function handleLinkClick() {
    onNavigate?.()
  }

  function handleSignOut() {
    clearToken()
    queryClient.clear()
    router.replace("/login")
    onNavigate?.()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Brand / institution */}
      <div className={cn("shrink-0 pb-10 pt-5", collapsed ? "px-3" : "px-5")}>
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "gap-3",
          )}
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded bg-surface-container-lowest p-1.5 shadow-sm ring-1 ring-outline-variant">
            <Building2
              aria-hidden
              className="size-6 text-primary"
              strokeWidth={2}
            />
          </div>

          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-6 text-on-surface">
                Main Campus
              </p>

              <p className="truncate text-xs font-semibold tracking-wide text-on-surface-variant">
                Hostel Operations
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {navigation.map((entry) => {
          if (entry.type === "link") {
            const { label, href, icon: Icon } = entry.data
            const active = pathname === href

            return (
              <Link
                key={href}
                href={href}
                onClick={handleLinkClick}
                title={collapsed ? label : undefined}
                className={cn(
                  "flex items-center rounded-r-full py-3 font-medium transition-all duration-150 active:scale-[0.98] ",
                  collapsed ? "justify-center" : "gap-3 pl-4 pr-4",
                  active
                    ? "border-l-4 border-primary bg-secondary-container text-on-secondary-container"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface ",
                )}
              >
                <Icon
                  aria-hidden
                  className="size-5 shrink-0"
                  strokeWidth={1.75}
                />

                {!collapsed && (
                  <span className="truncate text-sm">{label}</span>
                )}
              </Link>
            )
          }

          const group = entry.data
          const open = openGroups.has(group.id)
          const hasActiveChild = group.items.some(
            (item) => pathname === item.href,
          )

          return (
            <div key={group.id}>
              <button
                type="button"
                aria-expanded={open}
                title={collapsed ? group.label : undefined}
                onClick={() => handleGroupClick(group.id)}
                className={cn(
                  "flex w-full items-center rounded-r-full py-3 font-medium transition-all duration-150 active:scale-[0.98]",
                  collapsed ? "justify-center" : "gap-3 pl-4 pr-3",
                  hasActiveChild
                    ? "bg-secondary-container/60 text-on-secondary-container"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface hover:cursor-pointer",
                )}
              >
                <group.icon
                  aria-hidden
                  className="size-5 shrink-0"
                  strokeWidth={1.75}
                />

                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left text-sm">
                      {group.label}
                    </span>

                    <ChevronRight
                      aria-hidden
                      className={cn(
                        "size-4 shrink-0 text-on-surface-variant transition-transform duration-200",
                        open && "rotate-90",
                      )}
                    />
                  </>
                )}
              </button>

              {!collapsed && (
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <ul className="mt-1 space-y-0.5 pb-1">
                        {group.items.map((item) => {
                          const active = pathname === item.href

                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                onClick={handleLinkClick}
                                className={cn(
                                  "relative flex items-center gap-3 rounded-r-full py-2.5 pl-11 pr-3 text-sm transition-all duration-150 active:scale-[0.98]",
                                  active
                                    ? "border-l-4 border-primary bg-secondary-container font-semibold text-on-secondary-container"
                                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
                                )}
                              >
                                <item.icon
                                  aria-hidden
                                  className="size-4 shrink-0 text-on-surface-variant"
                                  strokeWidth={1.75}
                                />

                                <span className="truncate">{item.label}</span>
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          )
        })}
      </nav>

      {/* Logout */}
      <div className="shrink-0 border-t border-outline-variant px-3 py-4">
        <button
          type="button"
          aria-label="Sign out"
          title={collapsed ? "Sign out" : undefined}
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center rounded-r-full py-3 font-medium text-on-surface-variant transition-all duration-150 hover:bg-surface-container-high hover:text-destructive active:scale-[0.98]",
            collapsed ? "justify-center" : "gap-3 pl-4 pr-4",
          )}
        >
          <LogOut
            aria-hidden
            className="size-5 shrink-0"
            strokeWidth={1.75}
          />

          {!collapsed && <span className="truncate text-sm">Logout</span>}
        </button>
      </div>
    </div>
  )
}
