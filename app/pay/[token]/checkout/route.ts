import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { startCheckout, type PaymentRow } from "@/lib/stripe/payments";
import { siteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// Public. The portal's "Pay" button hits this. It looks up the pending payment by
// its opaque token (service-role read, never client RLS), mints a fresh Stripe
// Checkout session, and 303-redirects the browser to Stripe's hosted page. No
// auth: the token IS the capability, and it only ever points at one pre-set,
// pre-priced payment. Card data never touches our origin.
//
// ?tip=<cents> — the payer's chosen tip from the portal. Clamped server-side
// (0..200% of the service amount) so the query string can only ever ADD a tip,
// never touch the pre-set price.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const back = `${siteUrl}/pay/${token}`;

  const admin = createAdminClient();
  if (!admin) return NextResponse.redirect(`${back}?status=error`, { status: 303 });

  const { data: row } = await admin
    .from("payments")
    .select("*")
    .eq("pay_token", token)
    .maybeSingle<PaymentRow>();
  if (!row) return NextResponse.redirect(`${back}?status=notfound`, { status: 303 });
  if (row.status === "paid") return NextResponse.redirect(`${back}?status=success`, { status: 303 });
  // Anything past pending (e.g. refunded) is closed: bail BEFORE the tip write /
  // session mint so a stale link can't re-charge or mutate a settled row.
  if (row.status !== "pending") return NextResponse.redirect(`${back}?status=closed`, { status: 303 });

  const tipRaw = Math.round(Number(new URL(req.url).searchParams.get("tip") ?? 0));
  const tip = Number.isFinite(tipRaw) ? Math.min(Math.max(0, tipRaw), row.amount_cents * 2) : 0;
  if ((row.tip_cents ?? 0) !== tip) {
    // Best-effort persist; if the column isn't applied yet the charge still
    // goes through at the service amount (tip silently drops, never blocks pay).
    const { error } = await admin.from("payments").update({ tip_cents: tip }).eq("id", row.id);
    if (!error) row.tip_cents = tip;
  }

  const res = await startCheckout(admin, row);
  if (!res.ok || !res.url) return NextResponse.redirect(`${back}?status=error`, { status: 303 });
  return NextResponse.redirect(res.url, { status: 303 });
}
