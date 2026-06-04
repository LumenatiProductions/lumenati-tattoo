import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Magic-link landing: exchange the code for a session cookie, then continue to
// the dashboard (or wherever the user was headed).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/admin/login?error=link`);
}
