import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Top-level routes that are NOT the public Y2K site. Everything else at the
// root (/, artist rooms, /arcade, /book, /contact, /flash-wall) is the site.
const APP_ROUTES = new Set([
  "admin",
  "api",
  "arcade-embed",
  "auth",
  "bank-linked",
  "care",
  "claim",
  "coming-soon",
  "healed",
  "intake",
  "kiosk",
  "pay",
  "privacy",
  "request",
  "s",
  "shops",
  "start",
  "terms",
]);

const PREVIEW_COOKIE = "lmn-preview";

function isPublicSitePath(pathname: string): boolean {
  if (pathname === "/") return true;
  const first = pathname.split("/")[1] ?? "";
  if (!first || APP_ROUTES.has(first)) return false;
  // Static files (.js, .png, .svg, ...) are never pages.
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/admin") || pathname.startsWith("/auth")) {
    return await updateSession(request);
  }

  // Site-wide "coming soon" cover (Scott, 2026-09-02). Flip with the
  // SITE_COMING_SOON env var. ?preview=1 on any page sets a cookie that lets
  // you through to the real site.
  if (process.env.SITE_COMING_SOON === "true" && isPublicSitePath(pathname)) {
    if (searchParams.get("preview") === "1") {
      const res = NextResponse.next();
      res.cookies.set(PREVIEW_COOKIE, "1", { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
      return res;
    }
    if (request.cookies.get(PREVIEW_COOKIE)?.value === "1") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/coming-soon";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static assets under /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|legacy-assets|audio|brand|marketing).*)"],
};
