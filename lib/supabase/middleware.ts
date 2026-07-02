import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the auth session cookie on every matched request and gates /admin:
// unauthenticated visitors to /admin/* are bounced to /admin/login.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAdmin = path.startsWith("/admin");
  const isLogin = path.startsWith("/admin/login");

  if (isAdmin && !isLogin) {
    // Must be signed in...
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    // ...AND on the staff allowlist. A valid Supabase session for an email that
    // isn't in `profiles` must not load the admin shell (defense in depth — the
    // data is already RLS-protected, but the door shouldn't open at all).
    // RLS lets an authenticated user read only their own profiles row.
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", user.email ?? "")
      .maybeSingle();
    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", path);
      url.searchParams.set("denied", "1");
      return NextResponse.redirect(url);
    }
  }

  return response;
}
