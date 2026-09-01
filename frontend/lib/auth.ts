import type { User } from "@/lib/types"

const TOKEN_KEY = "shms.access_token"
const USER_KEY = "shms.user"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(USER_KEY)
  // Drop any leftover OTP-flow session data so nothing stale survives logout.
  window.sessionStorage.removeItem("shms.otp_email")
  _cachedUser = null
  emit()
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

export function getInitials(user: User | null): string {
  if (!user) return "?"
  const first = user.first_name?.[0] ?? ""
  const last = user.last_name?.[0] ?? ""
  return (first + last).toUpperCase() || user.email[0].toUpperCase()
}
