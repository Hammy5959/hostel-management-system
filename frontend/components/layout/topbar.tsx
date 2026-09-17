"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  clearToken,
  getStoredRoleName,
  getStoredUser,
  subscribeUser,
} from "@/lib/auth";
import { useHostelBranding } from "@/lib/hostel-settings";
import type { BrandingCookieValue } from "@/lib/branding-cookie";
import { formatRoleName, initials } from "@/components/users/user-badges";

interface TopbarProps {
  onMenuClick: () => void;
  /** Brand logo/link target. Default reproduces today's staff behavior. */
  homeHref?: string;
  /** Brand text next to the logo. Default (undefined) reads the live hostel
   * name from GET /hostel-settings/current, falling back to "SHMS Admin"
   * while it loads/on error. Portal passes "Resident Portal" to override
   * this entirely — an explicit override also suppresses the hostel logo
   * image, since it's a distinct page-context label, not the institution
   * brand. */
  brandLabel?: string;
  /** "Edit Profile" target. Default reproduces today's staff behavior
   * (computed from the logged-in user's own id at click time). */
  profileHref?: string;
  /** Displayed name. Default (undefined) reproduces today's staff behavior
   * of deriving it from the logged-in user account. Portal passes the
   * resident record's name instead, so the topbar matches /portal/profile. */
  identityName?: string;
  /** Avatar image. Default (undefined) reproduces today's staff behavior
   * of using the user account's photo. Portal passes the resident record's
   * own profile_picture_url instead. */
  identityPhotoUrl?: string | null;
  /** Avatar fallback initials, paired with identityName (initials() needs
   * first/last name separately, so the caller computes this rather than
   * Topbar re-splitting a combined name string). */
  identityInitials?: string;
  /** Server-rendered branding snapshot — seeds the brand name/logo on the
   * very first paint (before hydration/the live client fetch resolves), so
   * there's no flash on refresh. See app/(app)/layout.tsx. */
  initialBranding?: BrandingCookieValue | null;
}

export function Topbar({
  onMenuClick,
  homeHref = "/dashboard",
  brandLabel,
  profileHref,
  identityName,
  identityPhotoUrl,
  identityInitials,
  initialBranding,
}: TopbarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSyncExternalStore(subscribeUser, getStoredUser, () => null);
  const branding = useHostelBranding();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountCloseTimeout = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const accountRef = useRef<HTMLDivElement>(null);

  function openAccountMenu() {
    if (accountCloseTimeout.current) {
      clearTimeout(accountCloseTimeout.current);
      accountCloseTimeout.current = null;
    }
    setAccountOpen(true);
  }

  function scheduleCloseAccountMenu() {
    accountCloseTimeout.current = setTimeout(() => setAccountOpen(false), 150);
  }

  // Closes the account menu on outside click/tap — needed since touch
  // devices have no mouseleave to trigger scheduleCloseAccountMenu.
  useEffect(() => {
    if (!accountOpen) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (
        accountRef.current &&
        !accountRef.current.contains(e.target as Node)
      ) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [accountOpen]);

  const roleName = useSyncExternalStore(
    subscribeUser,
    getStoredRoleName,
    () => null,
  );

  function handleSignOut() {
    clearToken();
    queryClient.clear();
    router.replace("/login");
  }

  const fullName =
    identityName ??
    (user ? `${user.first_name} ${user.last_name ?? ""}`.trim() : "");
  const avatarUrl =
    identityPhotoUrl !== undefined
      ? (identityPhotoUrl ?? undefined)
      : (user?.profile_picture_url ?? undefined);
  const avatarInitials =
    identityInitials ??
    (user ? initials(user.first_name, user.last_name) : "?");
  // Whole-object precedence, not per-field `??` — branding is always either
  // the full object or fully absent (never partially populated), so this
  // can't accidentally fall back to a stale initialBranding.logo_url when
  // the live value has legitimately resolved to "no logo" (null).
  const effectiveBranding = branding ?? initialBranding;
  const effectiveBrand =
    brandLabel ?? effectiveBranding?.hostel_name ?? "SHMS Admin";
  const effectiveLogo = brandLabel
    ? null
    : (effectiveBranding?.logo_url ?? null);

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
        <Link href={homeHref} className="flex items-center gap-3">
          {effectiveLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={effectiveLogo}
              alt=""
              className="size-8 rounded-md object-contain"
            />
          )}
          <span className="text-xl font-bold text-primary">
            {effectiveBrand}
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2 md:gap-4 ">
        {/* Account */}
        <div
          ref={accountRef}
          className="relative"
          onMouseEnter={openAccountMenu}
          onMouseLeave={scheduleCloseAccountMenu}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAccountOpen(false);
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
              <AvatarImage src={avatarUrl} alt="" />
              <AvatarFallback className="bg-primary-fixed text-sm font-semibold text-on-primary-fixed">
                {avatarInitials}
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
                  <p className="truncate text-sm font-semibold text-foreground">
                    {fullName || "…"}
                  </p>
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
                  setAccountOpen(false);
                  if (user) router.push(profileHref ?? `/users/${user.id}`);
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
                  setAccountOpen(false);
                  handleSignOut();
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
  );
}
