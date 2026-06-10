import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateRentInvoices } from "@/lib/rent/job";
import { siteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// In-house rent invoices (rent-invoices-schema.sql).
//   GET   — owner/bookkeeper: recent invoices with their pay-link URLs
//   POST  — { action: "generate" } make this month's invoices exist
//           { action: "email", id } email the artist their pay link

const BOOKS = ["owner", "bookkeeper"] as const;

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}
const ok = (r: string | null) => !!r && BOOKS.includes(r as (typeof BOOKS)[number]);
const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);

export async function GET() {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const { data, error } = await supabase
    .from("rent_invoices")
    .select("*")
    .order("period", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (isMissingTable(error.message)) return NextResponse.json({ configured: false, invoices: [] });
    return NextResponse.json({ error: error.message, invoices: [] }, { status: 500 });
  }

  // Resolve each invoice's pay-link URL via its payments row.
  const paymentIds = (data ?? []).map((r) => r.payment_id).filter(Boolean) as string[];
  const tokens = new Map<string, string>();
  if (paymentIds.length) {
    const { data: pays } = await supabase
      .from("payments")
      .select("id, pay_token, status")
      .in("id", paymentIds);
    for (const p of pays ?? []) tokens.set(p.id as string, p.pay_token as string);
  }

  return NextResponse.json({
    configured: true,
    invoices: (data ?? []).map((r) => ({
      ...r,
      pay_url: r.payment_id && tokens.has(r.payment_id as string)
        ? `${siteUrl}/pay/${tokens.get(r.payment_id as string)}`
        : null,
    })),
  });
}

export async function POST(req: Request) {
  const { supabase, user, role } = await gate();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!ok(role)) return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { action?: string; id?: string };

  if (b.action === "generate") {
    try {
      const res = await generateRentInvoices(supabase);
      if ("note" in res && res.note === "schema not applied") {
        return NextResponse.json(
          { error: "Run rent-invoices-schema.sql in Supabase first." },
          { status: 503 },
        );
      }
      return NextResponse.json(res);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Generate failed" }, { status: 500 });
    }
  }

  if (b.action === "email") {
    if (!b.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ error: "Email isn't configured yet." }, { status: 503 });

    const { data: inv } = await supabase.from("rent_invoices").select("*").eq("id", b.id).maybeSingle();
    if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (!inv.payment_id) return NextResponse.json({ error: "This invoice has no pay link (Stripe was off when it was generated)." }, { status: 409 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });
    const [{ data: pay }, { data: artist }, { data: profile }] = await Promise.all([
      admin.from("payments").select("pay_token").eq("id", inv.payment_id).maybeSingle(),
      admin.from("artists").select("name").eq("id", inv.artist_id).maybeSingle(),
      admin.from("profiles").select("email").eq("artist_id", inv.artist_id).maybeSingle(),
    ]);
    if (!pay?.pay_token) return NextResponse.json({ error: "Pay link missing." }, { status: 409 });
    if (!profile?.email) return NextResponse.json({ error: "That artist has no login email on file." }, { status: 409 });

    const url = `${siteUrl}/pay/${pay.pay_token}`;
    const usd = ((inv.amount_cents as number) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    const monthName = new Date(`${inv.period}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Lumenati Tattoo <onboarding@resend.dev>",
        to: [profile.email],
        subject: `Booth rent — ${monthName}`,
        html: `<p style="font-family:Arial,sans-serif;font-size:14px;color:#3f3f46;">Hi ${artist?.name ?? "there"}, your ${monthName} booth rent is ${usd}${inv.due_date ? `, due ${inv.due_date}` : ""}.</p><p><a href="${url}" style="display:inline-block;background:#FF1493;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Pay rent</a></p><p style="font-family:Arial,sans-serif;font-size:12px;color:#a1a1aa;">${url}</p>`,
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `Send failed (${res.status})` }, { status: 502 });
    return NextResponse.json({ ok: true, sentTo: profile.email });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
