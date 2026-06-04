import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSquare } from "@/lib/square/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // honored on paid plans; Square paging can take a moment

// Owner-triggered "Sync now". Reads from Square, writes the sales mirror.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (profile?.role !== "owner") {
    return NextResponse.json({ error: "Owners only" }, { status: 403 });
  }

  try {
    const result = await syncSquare(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
