import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth-cookie";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/tripletex/sync")) {
    return NextResponse.next();
  }

  const loggedIn = Boolean(request.cookies.get(SESSION_COOKIE)?.value);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (pathname === "/logg-inn") {
    if (loggedIn) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (!loggedIn) {
    const url = new URL("/logg-inn", request.url);
    if (pathname !== "/") url.searchParams.set("neste", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
