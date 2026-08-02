import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const role = (req.nextauth.token as { role?: string } | null)?.role

    if (pathname.startsWith("/admin") && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  },
  { pages: { signIn: "/auth/login" } }
)

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/character/:path*",
    "/voice/:path*",
    "/studio/:path*",
    "/scrapbook/:path*",
    // `:path+` (not `:path*`) so middleware protects /business/[id] and
    // /business/new but leaves the bare /business route free to run its own
    // page-level auth check — that page is auth-aware, showing the public
    // marketing pitch to anonymous visitors and the workspace to signed-in
    // users. Marketing URL kept short (/business, not /for-business).
    "/business/:path+",
    "/admin/:path*",
  ],
}
