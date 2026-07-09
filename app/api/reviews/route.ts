import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlacesConfigured } from "@/lib/reviews/job";

export const dynamic = "force-dynamic";

// Review velocity for Reports.
//   GET  — snapshots (last 120 days), weekly asks-sent counts (review_request
//          followups, last 8 weeks), and wiring status flags.
//   POST — { rating?, count } log today's Google standing by hand (until the
//          Places key exists). RLS also guards; we gate for clean errors.

const STAFF = ["owner"] as const;

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, ok: false as const, status: 401, error: "Not signed in" };
  const { data: profile } = await supabase.from("profiles").select("role").eq("email", user.email!).maybeSingle();
  if (!profile?.role || !STAFF.includes(profile.role as (typeof STAFF)[number])) {
    return { supabase, ok: false as const, status: 403, error: "Staff only" };
  }
  return { supabase, ok: true as const };
}

export async function GET() {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const asksSince = new Date(Date.now() - 8 * 7 * 86_400_000).toISOString();
  const [{ data: snaps }, { data: asks }] = await Promise.all([
    g.supabase
      .from("review_snapshots")
      .select("captured_on, rating, review_count, source")
      .gte("captured_on", since)
      .order("captured_on", { ascending: true }),
    g.supabase
      .from("followups")
      .select("sent_at")
      .eq("kind", "review_request")
      .eq("status", "sent")
      .gte("sent_at", asksSince),
  ]);

  return NextResponse.json({
    snapshots: snaps ?? [],
    askDates: ((asks ?? []) as { sent_at: string | null }[]).map((a) => a.sent_at).filter(Boolean),
    placesConfigured: isPlacesConfigured,
    reviewLinkConfigured: !!process.env.GOOGLE_REVIEW_URL,
  });
}

export async function POST(req: Request) {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const b = (await req.json().catch(() => ({}))) as { rating?: number; count?: number };
  const count = Math.round(Number(b.count));
  if (!Number.isFinite(count) || count < 0) {
    return NextResponse.json({ error: "The review count has to be a number." }, { status: 400 });
  }
  const rating = b.rating === undefined || b.rating === null ? null : Number(b.rating);
  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
    return NextResponse.json({ error: "Rating is 1 to 5." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await g.supabase
    .from("review_snapshots")
    .upsert({ captured_on: today, rating, review_count: count, source: "manual" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, captured_on: today });
}
