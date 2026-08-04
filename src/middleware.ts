import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/welcome(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);
const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

const USER_ID_COOKIE = "atlas-user-id";

function isConfiguredAdmin(userId: string | null | undefined) {
  if (!userId) return false;
  const adminIds = (process.env.ATLAS_ADMIN_USER_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return adminIds.includes(userId);
}

function redirectToSignIn(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectToWelcome(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/welcome";
  url.search = "";
  return NextResponse.redirect(url);
}

function redirectToApp(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/chat";
  url.search = "";
  return NextResponse.redirect(url);
}

const clerk = clerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      if (isApiRoute(request)) {
        return NextResponse.next();
      }

      const { userId } = await auth();

      if (isPublicRoute(request)) {
        if (userId) {
          return redirectToApp(request);
        }
        return NextResponse.next();
      }

      if (!userId) {
        return redirectToSignIn(request);
      }

      if (isAdminRoute(request) && !isConfiguredAdmin(userId)) {
        return redirectToApp(request);
      }

      return NextResponse.next();
    })
  : null;

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (clerk) {
    return clerk(request, event);
  }

  if (isApiRoute(request)) {
    return NextResponse.next();
  }

  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  if (isAdminRoute(request)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const hasSession = Boolean(request.cookies.get(USER_ID_COOKIE)?.value);

  if (!hasSession) {
    return redirectToWelcome(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
