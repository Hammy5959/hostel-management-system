"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import {
  Bell,
  CircleHelp,
  LogOut,
  Menu,
  Search,
  Settings,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  clearToken,
  getInitials,
  getStoredUser,
  subscribeUser,
} from "@/lib/auth"
import {
  getNotifications,
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
      <div className="flex items-center gap-2 md:gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
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

        {/* Help */}
        <button
          type="button"
          aria-label="Help center"
          className="hidden rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low sm:block"
        >
          <CircleHelp aria-hidden className="size-5" />
        </button>

        {/* Sign out */}
        <button
          type="button"
          aria-label="Sign out"
          onClick={handleSignOut}
          className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-destructive"
        >
          <LogOut aria-hidden className="size-5" />
        </button>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label="Account menu"
                className="rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/50 hover:opacity-90"
              >
                <Avatar size="sm" className="size-9">
                  <AvatarImage src={user?.profile_picture_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-primary-fixed text-sm font-semibold text-on-primary-fixed">
                    {getInitials(user)}
                  </AvatarFallback>
                </Avatar>
              </button>
            }
          >
            <DropdownMenuContent align="end" sideOffset={10} className="w-60">
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5 px-1 py-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {user ? `${user.first_name} ${user.last_name ?? ""}`.trim() : "…"}
                  </p>
                  <p className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email ?? "Loading…"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <UserRound aria-hidden />
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings aria-hidden />
                Hostel Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuTrigger>
        </DropdownMenu>
      </div>
    </header>
  )
}
