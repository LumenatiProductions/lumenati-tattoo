import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// The homepage's "You are visitor #" counter, for real. One row in
// site_counters (service-role only). GET reads it; POST bumps it once per
// browser session (the page dedupes with sessionStorage before calling).
export const dynamic = "force-dynamic";
const KEY = "homepage_visitors";

async function read() {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("site_counters").select("value").eq("key", KEY).maybeSingle();
  return data ? Number(data.value) : null;
}

export async function GET() {
  const count = await read();
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ count: null }, { status: 500 });
  const { data, error } = await admin.rpc("bump_counter", { counter_key: KEY });
  if (error) {
    // No RPC yet: fall back to read-then-write (fine at shop-website traffic).
    const cur = (await read()) ?? 0;
    await admin.from("site_counters").upsert({ key: KEY, value: cur + 1, updated_at: new Date().toISOString() });
    return NextResponse.json({ count: cur + 1 }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ count: Number(data) }, { headers: { "Cache-Control": "no-store" } });
}
