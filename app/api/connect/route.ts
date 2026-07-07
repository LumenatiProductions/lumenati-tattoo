import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe/client";
import { ensureAccount, onboardingLink, refreshOnboardStatus } from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";

// Connect onboarding is owner-only (it sets up how artists get paid + their tax
// reporting). Reads/writes the artists' Connect columns via the service-role
// client; Stripe calls go through the server SDK.
async function owner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null as string | null, shopId: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("email", user.email!)
    .maybeSingle();
  return {
    user,
    role: profile?.role ?? null,
    shopId: (profile?.shop_id as string | null) ?? null,
  };
}

// List the roster with each artist's Connect status. Owner only.
export async function GET() {
  const { user, role, shopId } = await owner();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner" || !shopId) return NextResponse.json({ error: "Owners only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const { data, error } = await admin
    .from("artists")
    .select("id, name, stripe_account_id, stripe_onboarded")
    .eq("shop_id", shopId)
    .eq("active", true)
    .order("sort");
  if (error) return NextResponse.json({ error: error.message, artists: [] }, { status: 500 });

  return NextResponse.json({
    configured: isStripeConfigured,
    artists: (data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      hasAccount: !!a.stripe_account_id,
      onboarded: !!a.stripe_onboarded,
    })),
  });
}

// POST { artistId, action: "onboard" | "refresh" }. Owner only.
//  - onboard: create the Express account if needed, return a hosted onboarding URL
//  - refresh: re-read the account and persist whether it can receive transfers
export async function POST(req: Request) {
  const { user, role, shopId } = await owner();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (role !== "owner" || !shopId) return NextResponse.json({ error: "Owners only" }, { status: 403 });
  if (!isStripeConfigured) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as { artistId?: string; action?: string };
  if (!b.artistId) return NextResponse.json({ error: "Missing artistId" }, { status: 400 });

  // The artist must belong to the owner's shop before any Stripe call or update.
  const { data: artist } = await admin
    .from("artists")
    .select("id, name, stripe_account_id")
    .eq("id", b.artistId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: "Artist not found" }, { status: 404 });

  if (b.action === "refresh") {
    const status = await refreshOnboardStatus(admin, b.artistId);
    return NextResponse.json(status);
  }

  // default: onboard

  try {
    const accountId = await ensureAccount(admin, artist);
    if (!accountId) return NextResponse.json({ error: "Could not create account." }, { status: 502 });
    const url = await onboardingLink(accountId, artist.id);
    if (!url) return NextResponse.json({ error: "Could not create link." }, { status: 502 });
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Stripe error." },
      { status: 502 },
    );
  }
}
