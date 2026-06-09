import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentLink, type PaymentKind } from "@/lib/stripe/payments";
import { isStripeConfigured } from "@/lib/stripe/client";

export const dynamic = "force-dynamic";

const STAFF = ["owner", "bookkeeper", "frontdesk"] as const;

// Front-of-house + bookkeeping generate pay links. (The kiosk in POS-STARTER-2
// will call the same create path with a device token instead of a user.)
async function staff() {
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
const isStaff = (r: string | null) => !!r && STAFF.includes(r as (typeof STAFF)[number]);

const KINDS: PaymentKind[] = ["deposit", "ticket", "other"];

// List recent payments. Owner / bookkeeper / front desk (RLS also enforces it).
export async function GET() {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message, payments: [] }, { status: 500 });
  return NextResponse.json({ payments: data ?? [] });
}

// Create a pay link for a booking (or an ad-hoc amount). Returns the hosted
// Stripe URL + the public /pay token. Staff only. Writes via the service-role
// client so the row is consistent with what the webhook (also service-role) sees.
export async function POST(req: Request) {
  const { user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!isStaff(role)) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  if (!isStripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    bookingId?: string;
    clientId?: string;
    artistId?: string;
    kind?: string;
    amountCents?: number;
  };

  const kind = (KINDS.includes(b.kind as PaymentKind) ? b.kind : "deposit") as PaymentKind;
  const amountCents = Math.round(Number(b.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return NextResponse.json({ error: "Amount must be at least $0.50." }, { status: 400 });
  }
  // Fat-finger ceiling — nobody mints a $100k tattoo link by accident.
  if (amountCents > 2_000_000) {
    return NextResponse.json({ error: "Amount is over the $20,000 limit." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured." }, { status: 500 });
  }

  const res = await createPaymentLink(admin, {
    bookingId: b.bookingId ?? null,
    clientId: b.clientId ?? null,
    artistId: b.artistId ?? null,
    kind,
    amountCents,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  // `url` is the shareable, non-expiring /pay/<token> link (QR it for the client).
  return NextResponse.json({ payToken: res.payToken, url: res.url, paymentId: res.paymentId });
}
