import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv } from "@/lib/books/export";

export const dynamic = "force-dynamic";

// General-ledger CSV — every money event in a window, straight from the
// canonical ledger, for the accountant at tax time. Owner + bookkeeper only.
async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("email", user.email!)
    .maybeSingle();
  if (!profile?.role || !profile.shop_id) return null;
  return { role: profile.role as string, shopId: profile.shop_id as string };
}

const isISODate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: Request) {
  const me = await gate();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!["owner", "bookkeeper"].includes(me.role)) {
    return NextResponse.json({ error: "Owners & bookkeepers only" }, { status: 403 });
  }
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const url = new URL(req.url);
  const year = new Date().getUTCFullYear();
  const from = isISODate(url.searchParams.get("from")) ? url.searchParams.get("from")! : `${year}-01-01`;
  const to = isISODate(url.searchParams.get("to"))
    ? url.searchParams.get("to")!
    : new Date().toISOString().slice(0, 10);

  const { data: artists } = await db.from("artists").select("id, name").eq("shop_id", me.shopId);
  const nameOf = new Map((artists ?? []).map((a) => [a.id as string, a.name as string]));

  type Row = {
    occurred_at: string;
    source: string;
    kind: string;
    direction: string;
    amount_cents: number;
    artist_id: string | null;
    external_id: string | null;
    reverses: string | null;
    note: string | null;
    created_by: string | null;
  };
  const rows: Row[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db
      .from("ledger")
      .select("occurred_at, source, kind, direction, amount_cents, artist_id, external_id, reverses, note, created_by")
      .eq("shop_id", me.shopId)
      .gte("occurred_at", from)
      .lte("occurred_at", `${to}T23:59:59.999`)
      .order("occurred_at", { ascending: true })
      .range(start, start + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  const csv = toCsv(
    ["Date", "Source", "Kind", "Direction", "Amount", "Artist", "Reference", "Reversal of", "Note", "Entered by"],
    rows.map((r) => [
      r.occurred_at.slice(0, 10),
      r.source,
      r.kind,
      r.direction,
      ((r.direction === "out" ? -1 : 1) * (r.amount_cents / 100)).toFixed(2),
      r.artist_id ? nameOf.get(r.artist_id) ?? r.artist_id : "",
      r.external_id ?? "",
      r.reverses ?? "",
      r.note ?? "",
      r.created_by ?? "",
    ]),
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8",
      "Content-Disposition": `attachment; filename="lumenati-ledger-${from}-to-${to}.csv"`,
    },
  });
}
