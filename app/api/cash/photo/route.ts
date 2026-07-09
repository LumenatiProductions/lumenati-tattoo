import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { signProofPhoto } from "@/lib/storage/proof";

export const dynamic = "force-dynamic";

// View a proof photo (cash-stack snap or expense receipt). Admins only —
// returns a 15-minute signed link into the private proof-photos bucket.
// Pass ?entry=<cash entry id> or ?expense=<expense id>.
export async function GET(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const url = new URL(req.url);
  const entryId = url.searchParams.get("entry");
  const expenseId = url.searchParams.get("expense");

  let path: string | null = null;
  if (entryId) {
    const { data } = await me.db
      .from("cash_entries")
      .select("photo_path")
      .eq("id", entryId)
      .eq("shop_id", me.shopId)
      .maybeSingle();
    path = (data?.photo_path as string | null) ?? null;
  } else if (expenseId) {
    const { data } = await me.db
      .from("expenses")
      .select("receipt_url")
      .eq("id", expenseId)
      .eq("shop_id", me.shopId)
      .maybeSingle();
    const v = (data?.receipt_url as string | null) ?? null;
    // Legacy rows may hold a full external URL; only bucket paths get signed.
    if (v && /^https?:\/\//.test(v)) return NextResponse.redirect(v);
    path = v;
  }
  if (!path) return NextResponse.json({ error: "No photo on that row" }, { status: 404 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  const signed = await signProofPhoto(admin, path);
  if (!signed) return NextResponse.json({ error: "Could not sign the photo" }, { status: 500 });
  return NextResponse.redirect(signed);
}
