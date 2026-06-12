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
  matcher: ["/dashboard/:path*", "/character/:path*", "/voice/:path*", "/studio/:path*", "/admin/:path*"],
}
