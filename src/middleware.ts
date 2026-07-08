import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate: presence of the session cookie. Role checks and JWT
// verification happen in server components / actions (Node runtime).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico";
  const hasSession = req.cookies.has("tirepro_session");

  if (!isPublic && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (pathname === "/login" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"] };
