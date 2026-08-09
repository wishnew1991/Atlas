import { NextRequest, NextResponse } from "next/server";

const isAdminRoute = (request: NextRequest) => request.nextUrl.pathname.startsWith("/admin");
const isAdminLoginRoute = (request: NextRequest) => request.nextUrl.pathname === "/admin/login";

function redirectToAdminLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/admin/login";
  return NextResponse.redirect(url);
}

const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

export default function middleware(request: NextRequest) {
  if (isAdminRoute(request)) {
    const hasSession = SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
    if (!hasSession) {
      return isAdminLoginRoute(request) ? NextResponse.next() : redirectToAdminLogin(request);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
