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
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
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

  const res = await startCheckout(admin, row);
  if (!res.ok || !res.url) return NextResponse.redirect(`${back}?status=error`, { status: 303 });
  return NextResponse.redirect(res.url, { status: 303 });
}
