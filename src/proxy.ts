import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge gate: bounces visitors without a session cookie to the login page early.
 * This is only a UX optimisation — every page, server action and API route performs
 * its own full server-side session + permission check (see lib/auth/actor.ts).
 */
const PUBLIC_PREFIXES = ["/login", "/forgot-password", "/reset-password", "/invite", "/offline", "/api/health", "/api/cron"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const hasSession = Boolean(req.cookies.get("scholaris_session")?.value);
  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt).*)"],
};
