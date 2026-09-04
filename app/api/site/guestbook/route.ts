import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { clean, clientIp, hasBadWords, hashOf, throttled } from "@/lib/site/guestbook";

// The Y2K guestbook. GET: the last 12 entries the shop approved. POST: sign
// it; the entry waits unapproved until someone reads it in /admin/guestbook.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ entries: [] }, { headers: NO_STORE });
  const { data } = await admin
    .from("guestbook_entries")
    .select("id, name, from_where, message, created_at")
    .eq("shop_id", LUMENATI_SHOP_ID)
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(12);
  return NextResponse.json({ entries: data ?? [] }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503, headers: NO_STORE });
  const ip = clientIp(req);
  if (throttled("gb:" + ip, 3, 10 * 60_000)) return NextResponse.json({ error: "Easy. Three signatures every ten minutes." }, { status: 429, headers: NO_STORE });
  const b = (await req.json().catch(() => ({}))) as { name?: string; from?: string; message?: string; website?: string };
  // Honeypot: real people never see the website field.
  if (b.website) return NextResponse.json({ ok: true }, { headers: NO_STORE });
  const name = clean(b.name, 40);
  const from = clean(b.from, 40);
  const message = clean(b.message, 280);
  if (name.length < 2) return NextResponse.json({ error: "Sign it with a name." }, { status: 400, headers: NO_STORE });
  if (message.length < 2) return NextResponse.json({ error: "Say something." }, { status: 400, headers: NO_STORE });
  if (/https?:\/\/|www\./i.test(message + " " + name + " " + from)) return NextResponse.json({ error: "No links in the guestbook." }, { status: 400, headers: NO_STORE });
  if (hasBadWords(name + " " + from + " " + message)) return NextResponse.json({ error: "Keep it shop-friendly." }, { status: 400, headers: NO_STORE });
  const { error } = await admin.from("guestbook_entries").insert({
    shop_id: LUMENATI_SHOP_ID, name, from_where: from || null, message, ip_hash: hashOf(ip),
  });
  if (error) return NextResponse.json({ error: "Couldn't save that." }, { status: 500, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
