import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/** Mirrors AUTH_COOKIE in lib/auth.ts — presence-only flag, not the real
 * token. Duplicated here rather than imported: proxy.ts should not pull in
 * app modules (lib/auth.ts touches `window`/`document` at call time and
 * carries browser-only pub/sub state). Keep this name in sync by hand.
 * This cookie is a UX/routing signal only — the backend's own 401/403
 * checks remain the real authorization boundary. */
const AUTH_COOKIE = "shms.auth"

const AUTH_ROUTES = ["/login", "/verify-otp"]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isAuthed = request.cookies.has(AUTH_COOKIE)

  // Bare "/" — send straight to the right place instead of always bouncing
  // through /login.
  if (pathname === "/") {
    return NextResponse.redirect(new URL(isAuthed ? "/dashboard" : "/login", request.url))
  }

  if (AUTH_ROUTES.includes(pathname)) {
    if (isAuthed) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
    return NextResponse.next()
  }

  // Everything else reaching proxy (per the matcher below) is a protected
  // (app) route — the (app) route group doesn't appear in the URL, so every
  // remaining pathname (/dashboard, /staff, /users/[id], ...) falls here.
  if (!isAuthed) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
