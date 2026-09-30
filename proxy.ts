import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("token")?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    if (token) {
      return NextResponse.redirect(new URL("/rooms", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // /api is excluded so upload bodies stream straight to the rewrite instead
  // of being buffered by the proxy (which caps request bodies at 10 MB)
  matcher: ["/((?!api/|emojibase/|_next/static|_next/image|favicon.ico).*)"],
};
