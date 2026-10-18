import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname === "/login") {
    if (request.method === "OPTIONS" && pathname.startsWith("/api")) {
      const origin = request.headers.get("origin") ?? "*";
      return new NextResponse(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": origin,
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
        },
      });
    }
    return NextResponse.next();
  }
  const token = request.cookies.get("straume_session")?.value;
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-only-not-a-secret-change-in-prod-32b");
  if (!token) return NextResponse.redirect(new URL("/login", request.url));
  try {
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
