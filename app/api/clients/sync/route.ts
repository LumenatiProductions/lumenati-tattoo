import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncClients } from "@/lib/clients/job";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Square customer + payment paging can take a moment

// CRON_SECRET-gated automatic sync (the daily ops route also calls the same job;
// this stays so the customer mirror can be triggered on its own). No user
// session, so it writes with the service-role client.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 500 });
  }
  try {
    const result = await syncClients(admin);
    return NextResponse.json({ ok: true, via: "cron", ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// Owner-triggered "Sync now". Pulls Square customers + spend, writes the mirror.
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
    const result = await syncClients(supabase);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
