import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Open/close an artist's books. Closed books flip their public page's Book
// CTA to the waitlist and route new asks onto it. An artist toggles only
// their own chair; an admin can toggle anyone in their shop. Service-role
// write because artists have no RLS write on the roster table — the explicit
// shop_id pin below is the wall.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { closed?: boolean; artistId?: string };
  if (typeof b.closed !== "boolean") {
    return NextResponse.json({ error: "Say whether the books are open or closed." }, { status: 400 });
  }
  const target = me.role === "owner" ? (b.artistId ?? me.artistId) : me.artistId;
  if (!target) return NextResponse.json({ error: "No chair linked to this login." }, { status: 400 });
  if (me.role !== "owner" && target !== me.artistId) {
    return NextResponse.json({ error: "You can only close your own books." }, { status: 403 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const { data, error } = await admin
    .from("artists")
    .update({ books_closed: b.closed })
    .eq("id", target)
    .eq("shop_id", me.shopId)
    .select("id, books_closed")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "That artist isn't in your shop." }, { status: 404 });

  // How many are already waiting — the app uses this for the reopen nudge.
  const { count } = await admin
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", target)
    .eq("shop_id", me.shopId)
    .eq("active", true);

  return NextResponse.json({ ok: true, booksClosed: !!data.books_closed, waiting: count ?? 0 });
}
