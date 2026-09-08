"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import {
  Bell,
  LogOut,
  Menu,
  Search,
  UserRound,
  CheckCheck,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { clearToken, getStoredUser, subscribeUser } from "@/lib/auth"
import { formatRoleName, initials } from "@/components/users/user-badges"
import {
  getNotifications,
  getRoles,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api"

interface TopbarProps {
  onMenuClick: () => void
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = useSyncExternalStore(subscribeUser, getStoredUser, () => null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  function openAccountMenu() {
    if (accountCloseTimeout.current) {
      clearTimeout(accountCloseTimeout.current)
      accountCloseTimeout.current = null
    }
    setAccountOpen(true)
  }

  function scheduleCloseAccountMenu() {
    accountCloseTimeout.current = setTimeout(() => setAccountOpen(false), 150)
  }

  // Closes the account menu on outside click/tap — needed since touch
  // devices have no mouseleave to trigger scheduleCloseAccountMenu.
  useEffect(() => {
    if (!accountOpen) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener("mousedown", handleOutside)
    document.addEventListener("touchstart", handleOutside)
    return () => {
      document.removeEventListener("mousedown", handleOutside)
      document.removeEventListener("touchstart", handleOutside)
    }
  }, [accountOpen])

  const rolesQuery = useQuery({
    queryKey: ["roles", { include_inactive: false }],
    queryFn: () => getRoles({ include_inactive: false }),
    enabled: !!user,
  })

  const { data: countData } = useQuery({
    queryKey: ["notification-count"],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 60_000,
  })

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => getNotifications(5),
  })

  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-count"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
      toast.success("All notifications marked as read.")
    },
  })

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-count"] })
      queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  function handleSignOut() {
    clearToken()
    queryClient.clear()
    router.replace("/login")
  }

  const unreadCount = countData?.unread_count ?? 0
  const fullName = user ? `${user.first_name} ${user.last_name ?? ""}`.trim() : ""
  const roleName = rolesQuery.data?.find((role) => role.id === user?.role_id)?.name

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between border-b border-outline-variant bg-white px-4 md:px-6">
      {/* Left: menu + brand */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Menu aria-hidden className="size-5" />
        </Button>
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="text-xl font-bold text-primary">SHMS Admin</span>
        </Link>
      </div>

      {/* Right: search + actions */}
      <div className="flex items-center gap-2 md:gap-4 ">
        {/* Search */}
        <div className="relative hidden md:-ml-2 md:block">
          <Search
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3.5 my-auto size-4 text-on-surface-variant"
          />
          <Input
            type="search"
            placeholder="Search..."
            aria-label="Search"
            className="h-10 w-64 rounded-full border-outline-variant bg-surface pl-10 pr-4 text-sm placeholder:text-on-surface-variant focus-visible:ring-primary/20"
          />
        </div>

        {/* Notifications */}
        <DropdownMenu
          open={notifOpen}
          onOpenChange={(open) => {
            setNotifOpen(open)
            if (open) queryClient.invalidateQueries({ queryKey: ["notifications"] })
          }}
        >
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
                className={cn(
                  "relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low",
                )}
              >
                <Bell aria-hidden className="size-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-error ring-2 ring-surface" />
                )}
              </button>
            }
          >
            <DropdownMenuContent
              align="end"
              sideOffset={10}
              className="w-[min(22rem,calc(100vw-2rem))] p-0"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllRead.mutate()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:underline"
                  >
                    <CheckCheck aria-hidden className="size-3.5" />
                    Mark all read
                  </button>
                )}
              </div>
              <ScrollArea className="max-h-80">
                {!notifData || notifData.items.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell aria-hidden className="mx-auto mb-2 size-6 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">You&apos;re all caught up.</p>
                  </div>
                ) : (
                  <ul>
                    {notifData.items.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => !n.is_read && markRead.mutate(n.id)}
                          className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              n.is_read ? "bg-outline-variant" : "bg-primary",
                            )}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {n.title}
                            </span>
                            {n.message && (
                              <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                {n.message}
                              </span>
                            )}
                            <span className="mt-1 block text-xs text-outline">
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenuTrigger>
        </DropdownMenu>

        {/* Account */}
        <div
          ref={accountRef}
          className="relative"
          onMouseEnter={openAccountMenu}
          onMouseLeave={scheduleCloseAccountMenu}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAccountOpen(false)
          }}
        >
          <button
            type="button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={openAccountMenu}
            onFocus={openAccountMenu}
            className="flex items-center gap-2 rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 hover:opacity-90"
          >
            <Avatar size="lg" className="size-9">
              <AvatarImage src={user?.profile_picture_url ?? undefined} alt="" />
              <AvatarFallback className="bg-primary-fixed text-sm font-semibold text-on-primary-fixed">
                {user ? initials(user.first_name, user.last_name) : "?"}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium text-on-surface sm:inline">
              {fullName || "…"}
            </span>
          </button>

          {accountOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            >
              <div className="px-1.5 py-1">
                <div className="flex flex-col gap-0.5 px-1 py-1">
                  <p className="truncate text-sm font-semibold text-foreground">{fullName || "…"}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email ?? "Loading…"}
                  </p>
                  {roleName && (
                    <p className="truncate text-xs font-normal text-muted-foreground">
                      {formatRoleName(roleName)}
                    </p>
                  )}
                </div>
              </div>
              <div className="-mx-1 my-1 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false)
                  if (user) router.push(`/users/${user.id}`)
                }}
                className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
              >
                <UserRound aria-hidden />
                Edit Profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountOpen(false)
                  handleSignOut()
                }}
                className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-destructive outline-hidden select-none hover:bg-destructive/10 focus:bg-destructive/10 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:text-destructive"
              >
                <LogOut aria-hidden />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
