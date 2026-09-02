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

// Two front doors on one app (2026-09-02):
//   lumenatitattoo.com  = the shop: Y2K site, artist rooms, booking.
//   lumenatiapp.com     = the platform: marketing (/shops), Command Center,
//                         shop onboarding, other shops' pages.
// Every route works on both hosts; these rules only decide the entry points.
const APP_HOSTS = new Set(["lumenatiapp.com", "www.lumenatiapp.com"]);
const SHOP_HOST = "lumenatitattoo.com";
const APP_HOST = "lumenatiapp.com";
const PLATFORM_ENTRY = ["/shops", "/start", "/admin"];

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
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const onAppHost = APP_HOSTS.has(host);

  // Platform host: the front page IS the marketing page, and the shop's Y2K
  // pages have no business here (send them home to the shop domain).
  if (onAppHost) {
    if (host.startsWith("www.")) {
      const url = request.nextUrl.clone();
      url.host = APP_HOST;
      return NextResponse.redirect(url, 308);
    }
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/shops";
      return NextResponse.rewrite(url);
    }
    if (isPublicSitePath(pathname)) {
      const url = request.nextUrl.clone();
      url.host = SHOP_HOST;
      return NextResponse.redirect(url, 307);
    }
  }

  // Shop host: platform entry points live on the app domain now. Keep the
  // shop's own staff working from localhost/127.0.0.1 untouched. Gated on
  // PLATFORM_HOST_LIVE so /admin keeps working here until lumenatiapp.com
  // actually resolves.
  if (process.env.PLATFORM_HOST_LIVE === "true" && (host === SHOP_HOST || host === `www.${SHOP_HOST}`)) {
    if (PLATFORM_ENTRY.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      const url = request.nextUrl.clone();
      url.host = APP_HOST;
      if (pathname === "/shops") url.pathname = "/";
      return NextResponse.redirect(url, 307);
    }
  }

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
    // ?preview=0 drops the bypass again, so the cover can be seen as a visitor sees it.
    const dropPreview = searchParams.get("preview") === "0";
    if (!dropPreview && request.cookies.get(PREVIEW_COOKIE)?.value === "1") return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = "/coming-soon";
    url.search = "";
    const res = NextResponse.rewrite(url);
    if (dropPreview) res.cookies.set(PREVIEW_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next internals and static assets under /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|legacy-assets|audio|brand|marketing).*)"],
};
