import type { User } from "@/lib/types"

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
  // Drop any leftover OTP-flow session data so nothing stale survives logout.
  window.sessionStorage.removeItem("shms.otp_email")
  _cachedUser = null
  emit()
  clearAuthCookie()
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
