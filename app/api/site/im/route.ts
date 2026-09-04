import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashIp } from "@/lib/arcade/scores";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// An IM from the site's buddy list to an artist. Lands in site_ims
// (service-role only) for the shop to read. Nothing is sent anywhere else.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

const hits = new Map<string, number[]>();
const RATE_LIMIT = 5; // IMs per IP per minute
const WINDOW_MS = 60_000;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > RATE_LIMIT;
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503, headers: NO_STORE });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: NO_STORE });

  const b = (await req.json().catch(() => ({}))) as { artist?: string; name?: string; contact?: string; message?: string; hp?: string };
  if (b.hp) return NextResponse.json({ ok: true }, { headers: NO_STORE }); // honeypot: bots fill it, people never see it
  const name = String(b.name ?? "").trim().slice(0, 60);
  const contact = String(b.contact ?? "").trim().slice(0, 120);
  const message = String(b.message ?? "").trim().slice(0, 1_000);
  if (name.length < 1) return NextResponse.json({ error: "Tell them who you are." }, { status: 400, headers: NO_STORE });
  if (message.length < 2) return NextResponse.json({ error: "Type a message first." }, { status: 400, headers: NO_STORE });

  // The artist arrives as a slug from the buddy list; resolve it inside the shop.
  let artistId: string | null = null;
  const slug = String(b.artist ?? "").trim();
  if (slug) {
    const { data } = await admin.from("artists").select("id").eq("shop_id", LUMENATI_SHOP_ID).eq("slug", slug).maybeSingle();
    artistId = (data?.id as string | undefined) ?? null;
    if (!artistId) return NextResponse.json({ error: "That artist isn't on the list." }, { status: 404, headers: NO_STORE });
  }

  const { error } = await admin.from("site_ims").insert({ shop_id: LUMENATI_SHOP_ID, artist_id: artistId, from_name: name, contact, message, ip_hash: hashIp(ip) });
  if (error) return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
