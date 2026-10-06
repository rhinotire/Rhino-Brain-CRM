import { NextResponse, type NextRequest } from "next/server";

// Lightweight gate: presence of the session cookie. Role checks and JWT
// verification happen in server components / actions (Node runtime).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" || pathname.startsWith("/_next") || pathname === "/favicon.ico" ||
    // PWA install assets must load without a session
    pathname === "/manifest.webmanifest" || pathname === "/icon-pwa.svg" || pathname === "/rhino-brain-logo.png" ||
    // cron endpoints carry no session cookie; they authenticate themselves
    // with CRON_SECRET and fail closed when it's missing
    pathname.startsWith("/api/cron/") ||
    // Twilio webhooks sign requests (X-Twilio-Signature); token route 401s without a session
    pathname.startsWith("/api/twilio/") ||
    // employee onboarding form: the unguessable token is the authorization
    pathname.startsWith("/onboard/");
  const hasSession = req.cookies.has("tirepro_session");

  if (!isPublic && !hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  // ?e=1 marks "session rejected server-side" (deleted/deactivated user with a
  // leftover cookie) — without it this bounce + the server's redirect("/login")
  // would loop forever. Logging in again overwrites the stale cookie.
  if (pathname === "/login" && hasSession && !req.nextUrl.searchParams.has("e")) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico).*)"] };
