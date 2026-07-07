import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Aftercare timeline context (item 5 — the pretty surface).
//   GET ?token=<aftercare-followup-id> — public: validate the link, return the
//   client/artist/visit context the /care/<token> page renders.
//
// Same capability pattern as /api/healed: the aftercare followup row's uuid IS
// the token — random, unguessable, minted per visit by the follow-up engine.
// The page stays useful the whole healing arc, so the window is generous.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WINDOW_DAYS = 60;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (!UUID_RE.test(token)) return NextResponse.json({ status: "invalid" }, { status: 404 });

  const { data: followup } = await admin
    .from("followups")
    .select("id, kind, client_id, booking_id, created_at")
    .eq("id", token)
    .eq("kind", "aftercare")
    .maybeSingle();
  if (!followup) return NextResponse.json({ status: "invalid" }, { status: 404 });
  const ageDays = (Date.now() - new Date(followup.created_at as string).getTime()) / 86_400_000;
  if (ageDays > WINDOW_DAYS) return NextResponse.json({ status: "invalid" }, { status: 404 });

  let clientFirstName: string | null = null;
  if (followup.client_id) {
    const { data: c } = await admin.from("clients").select("first_name").eq("id", followup.client_id).maybeSingle();
    clientFirstName = (c?.first_name as string) || null;
  }

  let visitDate: string | null = null;
  let service = "";
  let artistName: string | null = null;
  let artistSlug: string | null = null;
  let artistColor: string | null = null;
  let healedToken: string | null = null;
  if (followup.booking_id) {
    const { data: bk } = await admin
      .from("bookings")
      .select("starts_at, service_desc, artist_id")
      .eq("id", followup.booking_id)
      .maybeSingle();
    if (bk) {
      visitDate = bk.starts_at as string;
      service = (bk.service_desc as string) || "";
      if (bk.artist_id) {
        const { data: a } = await admin
          .from("artists")
          .select("name, slug, color")
          .eq("id", bk.artist_id)
          .maybeSingle();
        artistName = (a?.name as string) ?? null;
        artistSlug = (a?.slug as string) ?? null;
        artistColor = (a?.color as string) ?? null;
      }
    }
    // The sibling day-14 ask for this visit — its uuid is the upload link.
    const { data: h } = await admin
      .from("followups")
      .select("id")
      .eq("booking_id", followup.booking_id)
      .eq("kind", "healed_photo")
      .maybeSingle();
    healedToken = (h?.id as string) ?? null;
  }
  // The engine always books aftercare off a real visit; a row without one is
  // stale desk data — treat as dead rather than render a dateless timeline.
  if (!visitDate) return NextResponse.json({ status: "invalid" }, { status: 404 });

  return NextResponse.json({
    status: "ok",
    clientFirstName,
    artistName,
    artistSlug,
    artistColor,
    service,
    visitDate,
    healedToken,
  });
}
