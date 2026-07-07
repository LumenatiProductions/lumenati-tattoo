import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Settlements record "we squared up with this artist through DATE" — see
// supabase/settlements-schema.sql. Owner / bookkeeper write; an artist's own
// rows are readable under RLS. If the table hasn't been applied yet the GET
// reports { configured: false } so the Payouts page can hide the buttons
// instead of erroring (same graceful-gate pattern as Stripe/Square).
const BOOKS = ["owner", "bookkeeper"] as const;
const READ = ["owner", "bookkeeper", "artist"] as const;
const METHODS = ["check", "cash", "stripe", "other"] as const;

const can = (role: string | null, roles: readonly string[]) => !!role && roles.includes(role);

// Postgres "relation does not exist" — schema not applied yet.
const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);

// List recent settlements + each artist's latest settled_through. Cookie or
// app Bearer auth; an artist (either path) only sees their own rows.
export async function GET(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(me.role, READ)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  // Shop scoping is redundant under RLS (cookie path) but essential on the
  // Bearer path, where me.db is the service-role client.
  let q = me.db
    .from("settlements")
    .select("*")
    .eq("shop_id", me.shopId)
    .order("created_at", { ascending: false })
    .limit(200);
  // Bearer callers read via the service-role client, so the artist scoping RLS
  // would normally do has to be explicit here.
  if (me.role === "artist") q = q.eq("artist_id", me.artistId ?? "-");
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ configured: false, settlements: [], settledThrough: {} });
    }
    return NextResponse.json({ error: error.message, settlements: [] }, { status: 500 });
  }

  // Latest settled_through per artist (rows are newest-first).
  const settledThrough: Record<string, string> = {};
  for (const s of data ?? []) {
    const a = s.artist_id as string;
    const t = s.settled_through as string;
    if (!settledThrough[a] || t > settledThrough[a]) settledThrough[a] = t;
  }

  return NextResponse.json({ configured: true, settlements: data ?? [], settledThrough });
}

// Record a settlement. Owner / bookkeeper.
// Body: { artistId, amountCents, settledThrough?, method?, note? }
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(me.role, BOOKS)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  const supabase = me.db;

  const b = (await req.json().catch(() => ({}))) as {
    artistId?: string;
    amountCents?: number;
    settledThrough?: string;
    method?: string;
    note?: string;
  };
  if (!b.artistId) return NextResponse.json({ error: "Missing artistId" }, { status: 400 });
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents)) {
    return NextResponse.json({ error: "Amount is required." }, { status: 400 });
  }
  const settledThrough = /^\d{4}-\d{2}-\d{2}$/.test(b.settledThrough ?? "")
    ? b.settledThrough
    : new Date().toISOString().slice(0, 10);
  const method = METHODS.includes(b.method as (typeof METHODS)[number]) ? b.method : "other";

  const { data, error } = await supabase
    .from("settlements")
    .insert({
      shop_id: me.shopId,
      artist_id: b.artistId,
      amount_cents: amountCents,
      settled_through: settledThrough,
      method,
      note: (b.note ?? "").trim(),
      created_by: me.email,
    })
    .select()
    .single();
  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "Settlements aren't set up yet — run settlements-schema.sql in Supabase." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Receipt: email the artist their statement so settling feels like payroll.
  // Best-effort — a missing Resend key / artist email never blocks the books.
  const receipt = await emailReceipt(supabase, {
    shopId: me.shopId,
    artistId: b.artistId,
    amountCents,
    settledThrough: settledThrough!,
    note: (b.note ?? "").trim(),
  });

  return NextResponse.json({ settlement: data, receipt });
}

async function emailReceipt(
  supabase: SupabaseClient,
  s: { shopId: string; artistId: string; amountCents: number; settledThrough: string; note: string },
): Promise<{ sent: boolean; reason?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: "Email not configured" };

  const [{ data: artist }, { data: profile }] = await Promise.all([
    supabase.from("artists").select("name").eq("id", s.artistId).eq("shop_id", s.shopId).maybeSingle(),
    supabase.from("profiles").select("email, full_name").eq("artist_id", s.artistId).eq("shop_id", s.shopId).maybeSingle(),
  ]);
  if (!profile?.email) return { sent: false, reason: "Artist has no login email on file" };

  const usd = (c: number) =>
    (Math.abs(c) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const direction =
    s.amountCents >= 0
      ? `The shop paid you ${usd(s.amountCents)}.`
      : `You settled ${usd(s.amountCents)} to the shop.`;
  const when = new Date(`${s.settledThrough}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">LUMENATI</span><span style="font-size:22px;font-weight:800;color:#FF1493;">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">Settlement receipt</div>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <div style="font-size:17px;font-weight:700;color:#0e0e11;margin-bottom:6px;">You're settled through ${esc(when)}.</div>
        <p style="font-size:14px;line-height:1.55;color:#52525b;margin:0 0 8px;">${esc(direction)}</p>
        ${s.note ? `<p style="font-size:12px;line-height:1.5;color:#71717a;margin:0 0 8px;">${esc(s.note)}</p>` : ""}
        <p style="font-size:12px;color:#a1a1aa;margin:16px 0 0;">Your statement on the Payouts page now starts fresh from this date. Questions? Reply to this email.</p>
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">Lumenati Tattoo &nbsp;//&nbsp; keep this for your records.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Lumenati Tattoo <onboarding@resend.dev>",
      to: [profile.email],
      subject: `Settlement receipt — ${artist?.name ?? "your statement"} settled through ${s.settledThrough}`,
      html,
    }),
  });
  if (!res.ok) return { sent: false, reason: `Send failed (${res.status})` };
  return { sent: true };
}
