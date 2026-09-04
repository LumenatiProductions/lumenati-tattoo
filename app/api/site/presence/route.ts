import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// "N online now" for the Y2K site. Every open tab POSTs a heartbeat with its
// own id every 30 seconds; a tab counts as online for 90 seconds after its
// last beat. Rows live in site_presence (service-role only) because Vercel
// functions share no memory. The POST answers with the count so a heartbeat
// is one round trip.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const ONLINE_WINDOW_MS = 90_000;
const PRUNE_AFTER_MS = 10 * 60_000;

const hits = new Map<string, number[]>();
const RATE_LIMIT = 40; // beats per IP per minute: a shop full of tabs still fits
const WINDOW_MS = 60_000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > RATE_LIMIT;
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

async function countOnline(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<number | null> {
  const since = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString();
  const { count, error } = await admin
    .from("site_presence")
    .select("session_id", { count: "exact", head: true })
    .gte("last_seen", since);
  if (error) return null;
  return count ?? 0;
}

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ online: null }, { status: 503, headers: NO_STORE });
  const online = await countOnline(admin);
  return NextResponse.json({ online }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ online: null }, { status: 503, headers: NO_STORE });
  const ip = clientIp(req);
  if (rateLimited(ip)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: NO_STORE });

  const b = (await req.json().catch(() => ({}))) as { sid?: string; path?: string };
  const sid = String(b.sid ?? "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sid)) return NextResponse.json({ error: "Bad session id." }, { status: 400, headers: NO_STORE });
  const path = typeof b.path === "string" ? b.path.slice(0, 200) : null;
  const ipHash = createHash("sha256").update("lumenati-presence:" + ip).digest("hex").slice(0, 24);

  const { error } = await admin
    .from("site_presence")
    .upsert({ session_id: sid, path, last_seen: new Date().toISOString(), ip_hash: ipHash }, { onConflict: "session_id" });
  if (error) return NextResponse.json({ online: null }, { status: 500, headers: NO_STORE });

  // Roughly one beat in twenty sweeps out tabs that closed a while ago.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - PRUNE_AFTER_MS).toISOString();
    await admin.from("site_presence").delete().lt("last_seen", cutoff);
  }

  const online = await countOnline(admin);
  return NextResponse.json({ online }, { headers: NO_STORE });
}
