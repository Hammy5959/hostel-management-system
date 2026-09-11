import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Mirrors AUTH_COOKIE in lib/auth.ts — presence-only flag, not the real
 * token. Duplicated here rather than imported: proxy.ts should not pull in
 * app modules (lib/auth.ts touches `window`/`document` at call time and
 * carries browser-only pub/sub state). Keep this name in sync by hand.
 * This cookie is a UX/routing signal only — the backend's own 401/403
 * checks remain the real authorization boundary. */
const AUTH_COOKIE = "shms.auth"
/** Presence-only; set only for the `resident` role — see
 * lib/auth.ts setStoredRoleName(). A UX/routing signal only, not a
 * security boundary — same as AUTH_COOKIE. Keep this name in sync with
 * PORTAL_COOKIE in lib/auth.ts by hand. */
const PORTAL_COOKIE = "shms.portal"

const AUTH_ROUTES = ["/login", "/verify-otp"]
const PORTAL_PREFIX = "/portal"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthed = request.cookies.has(AUTH_COOKIE)
  const isResident = request.cookies.has(PORTAL_COOKIE)

  // Bare "/" — send straight to the right place instead of always bouncing
  // through /login.
  if (pathname === "/") {
    if (!isAuthed) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    return NextResponse.redirect(new URL(isResident ? "/portal" : "/dashboard", request.url))
  }

  if (AUTH_ROUTES.includes(pathname)) {
    if (isAuthed) {
      return NextResponse.redirect(new URL(isResident ? "/portal" : "/dashboard", request.url))
    }
    return NextResponse.next()
  }

  // Everything else reaching proxy (per the matcher below) is a protected
  // (app)/(portal) route — route groups don't appear in the URL, so every
  // remaining pathname (/dashboard, /staff, /users/[id], /portal, ...) falls
  // here.
  if (!isAuthed) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Confine residents to the Resident Portal, and keep everyone else out of
  // it — a resident never sees the staff shell/dashboard, and a staff
  // account manually visiting /portal (never happens via normal staff nav)
  // bounces back to /dashboard instead of the unfinished resident shell.
  const isPortalRoute = pathname === PORTAL_PREFIX || pathname.startsWith(`${PORTAL_PREFIX}/`)
  if (isResident && !isPortalRoute) {
    return NextResponse.redirect(new URL("/portal", request.url))
  }
  if (!isResident && isPortalRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
