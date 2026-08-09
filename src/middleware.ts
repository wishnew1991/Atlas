import { NextRequest, NextResponse } from "next/server";

const isApiRoute = (request: NextRequest) => request.nextUrl.pathname.startsWith("/api");
const isAdminRoute = (request: NextRequest) => request.nextUrl.pathname.startsWith("/admin");
const isAdminLoginRoute = (request: NextRequest) => request.nextUrl.pathname === "/admin/login";

function redirectToAdminLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  return NextResponse.redirect(url);
}

const GUEST_ID_COOKIE = "atlas-user-id";
// better-auth names its session cookie "better-auth.session_token" in dev and
// "__Secure-better-auth.session_token" on HTTPS deployments — check both.
const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

// Issue a unique per-visitor identity cookie for unauthenticated requests so
// guests never share a single backend identity (data isolation).
function ensureGuestIdentity(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  const hasSession = SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
  const hasGuestId = Boolean(request.cookies.get(GUEST_ID_COOKIE)?.value);
  if (!hasSession && !hasGuestId) {
    response.cookies.set(GUEST_ID_COOKIE, crypto.randomUUID(), {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });
  }
  return response;
}

export default function middleware(request: NextRequest) {
  if (isApiRoute(request)) {
    return ensureGuestIdentity(request);
  }

  // The session token is an opaque string, not a JWT, so the admin allowlist
  // cannot be evaluated here (Edge middleware has no DB access). This only
  // gates on "is signed in"; the real admin check runs server-side in the
  // admin page and admin API routes (requireAtlasAdmin).
  if (isAdminRoute(request)) {
    const hasSession = SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
    if (!hasSession) {
      // /admin/login is itself the admin sign-in page — let it render.
      return isAdminLoginRoute(request) ? ensureGuestIdentity(request) : redirectToAdminLogin(request);
    }
    return ensureGuestIdentity(request);
  }

  return ensureGuestIdentity(request);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
