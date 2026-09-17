import { BRANDING_COOKIE } from "@/lib/branding-cookie"
import type { HostelBranding, User } from "@/lib/types"

const TOKEN_KEY = "shms.access_token"
const USER_KEY = "shms.user"

/** Presence-only cookie mirroring whether a token is stored — the real
 * token stays in localStorage only. proxy.ts (server-side) can't read
 * localStorage, so this cookie is a UX/routing signal for it to redirect
 * without a flash. It is NOT a security boundary: every actual request is
 * still authorized by the backend's own 401/403 checks. Keep this name in
 * sync with AUTH_COOKIE in proxy.ts if it ever changes. */
const AUTH_COOKIE = "shms.auth"

function setAuthCookie(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${AUTH_COOKIE}=1; path=/; SameSite=Lax${secure}`
}

function clearAuthCookie(): void {
  document.cookie = `${AUTH_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

/** Presence-only, mirrors AUTH_COOKIE above — set only for the `resident`
 * role (see setStoredRoleName below). Read server-side by proxy.ts to
 * route residents into the Resident Portal and keep them out of staff
 * routes. A UX/routing signal only, not a security boundary — same as
 * AUTH_COOKIE. Keep this name in sync with proxy.ts by hand. */
const PORTAL_COOKIE = "shms.portal"

function setPortalCookie(): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${PORTAL_COOKIE}=1; path=/; SameSite=Lax${secure}`
}

function clearPortalCookie(): void {
  document.cookie = `${PORTAL_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

const PERMISSIONS_KEY = "shms.permissions"
const ROLE_NAME_KEY = "shms.role_name"
const BRANDING_KEY = "shms.branding"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token)
  setAuthCookie()
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.localStorage.removeItem(PERMISSIONS_KEY)
  window.localStorage.removeItem(ROLE_NAME_KEY)
  window.localStorage.removeItem(BRANDING_KEY)
  // Drop any leftover OTP-flow session data so nothing stale survives logout.
  window.sessionStorage.removeItem("shms.otp_email")
  _cachedUser = null
  _cachedPermissions = null
  _permissionsLoaded = false
  _cachedRoleName = null
  _roleNameLoaded = false
  _cachedBranding = null
  _brandingLoaded = false
  emit()
  clearAuthCookie()
  clearPortalCookie()
  document.cookie = `${BRANDING_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

/* ── User store (for useSyncExternalStore) ────────────────────── */

let _cachedUser: User | null = null
let _userLoaded = false
const _listeners = new Set<() => void>()

function emit() {
  for (const listener of _listeners) listener()
}

export function subscribeUser(listener: () => void): () => void {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

function loadCachedUser(): User | null {
  if (_userLoaded) return _cachedUser
  _userLoaded = true
  if (typeof window === "undefined") {
    _cachedUser = null
  } else {
    const raw = window.localStorage.getItem(USER_KEY)
    if (raw) {
      try {
        _cachedUser = JSON.parse(raw) as User
      } catch {
        _cachedUser = null
      }
    }
  }
  return _cachedUser
}

export function getStoredUser(): User | null {
  return loadCachedUser()
}

export function setStoredUser(user: User): void {
  _cachedUser = user
  window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  emit()
}

/* ── Permissions store (synchronous, set once at login alongside `user`) ─ */

let _cachedPermissions: string[] | null = null
let _permissionsLoaded = false

function loadCachedPermissions(): string[] | null {
  if (_permissionsLoaded) return _cachedPermissions
  _permissionsLoaded = true
  if (typeof window === "undefined") {
    _cachedPermissions = null
  } else {
    const raw = window.localStorage.getItem(PERMISSIONS_KEY)
    if (raw) {
      try {
        _cachedPermissions = JSON.parse(raw) as string[]
      } catch {
        _cachedPermissions = null
      }
    }
  }
  return _cachedPermissions
}

export function getStoredPermissions(): string[] | null {
  return loadCachedPermissions()
}

export function setStoredPermissions(permissions: string[]): void {
  _cachedPermissions = permissions
  window.localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions))
  emit()
}

/* ── Role name store (synchronous, set once at login alongside `user`) ─── */

let _cachedRoleName: string | null = null
let _roleNameLoaded = false

function loadCachedRoleName(): string | null {
  if (_roleNameLoaded) return _cachedRoleName
  _roleNameLoaded = true
  if (typeof window === "undefined") {
    _cachedRoleName = null
  } else {
    _cachedRoleName = window.localStorage.getItem(ROLE_NAME_KEY)
  }
  return _cachedRoleName
}

export function getStoredRoleName(): string | null {
  return loadCachedRoleName()
}

export function setStoredRoleName(roleName: string | null): void {
  _cachedRoleName = roleName
  if (roleName) {
    window.localStorage.setItem(ROLE_NAME_KEY, roleName)
  } else {
    window.localStorage.removeItem(ROLE_NAME_KEY)
  }
  // Drives proxy.ts's flash-free Resident Portal routing — see PORTAL_COOKIE above.
  if (roleName === "resident") {
    setPortalCookie()
  } else {
    clearPortalCookie()
  }
  emit()
}

/* ── Hostel branding store (synchronous, set at login + on save) ──────── */

let _cachedBranding: HostelBranding | null = null
let _brandingLoaded = false

function loadCachedBranding(): HostelBranding | null {
  if (_brandingLoaded) return _cachedBranding
  _brandingLoaded = true
  if (typeof window === "undefined") {
    _cachedBranding = null
  } else {
    const raw = window.localStorage.getItem(BRANDING_KEY)
    if (raw) {
      try {
        _cachedBranding = JSON.parse(raw) as HostelBranding
      } catch {
        _cachedBranding = null
      }
    }
  }
  return _cachedBranding
}

export function getStoredBranding(): HostelBranding | null {
  return loadCachedBranding()
}

export function setStoredBranding(branding: HostelBranding): void {
  _cachedBranding = branding
  window.localStorage.setItem(BRANDING_KEY, JSON.stringify(branding))
  // Also mirrored into a cookie (same mechanism as AUTH_COOKIE/PORTAL_COOKIE)
  // so the server can render the correct name/logo on the very first paint —
  // see lib/branding-cookie.ts and app/(app)/layout.tsx.
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  const cookieValue = encodeURIComponent(
    JSON.stringify({ hostel_name: branding.hostel_name, logo_url: branding.logo_url }),
  )
  document.cookie = `${BRANDING_COOKIE}=${cookieValue}; path=/; SameSite=Lax${secure}`
  emit()
}
