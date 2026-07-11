import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

// The renter's own pay link (bug f7ca0567: pay booth rent right from the app).
// Artists can't read payments rows under RLS, so this resolves the invoice's
// pay-link token server-side — strictly for an invoice that is theirs (owners
// can fetch any). The app opens the returned /pay/<token> page in the browser,
// the same hosted checkout the emailed link uses.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { invoiceId?: string };
  if (!b.invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

  const { data: inv } = await me.db
    .from("rent_invoices")
    .select("id, artist_id, status, payment_id")
    .eq("id", b.invoiceId)
    .eq("shop_id", me.shopId)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (me.role !== "owner" && inv.artist_id !== me.artistId) {
    return NextResponse.json({ error: "Not your invoice" }, { status: 403 });
  }
  if (inv.status !== "pending") return NextResponse.json({ error: "This invoice isn't open." }, { status: 409 });
  if (!inv.payment_id) {
    return NextResponse.json(
      { error: "No card link for this invoice — pay cash at the desk or ask the shop to re-issue it." },
      { status: 409 },
    );
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });
  const { data: pay } = await admin
    .from("payments")
    .select("pay_token, status")
    .eq("id", inv.payment_id)
    .maybeSingle();
  if (!pay?.pay_token) {
    return NextResponse.json({ error: "No card link for this invoice — pay cash at the desk." }, { status: 409 });
  }

  return NextResponse.json({ url: `${siteUrl}/pay/${pay.pay_token}` });
}
