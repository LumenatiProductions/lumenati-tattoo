import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sellableItems, taxBps } from "@/lib/pos/merch";

export const dynamic = "force-dynamic";

// The quick-tap product catalog for the register: every inventory item with a
// retail price, plus the shop's tax rate so the POS can show the real total
// before charging. Anyone on staff can ring up merch — artists included —
// so the gate is "has a profiles row", same as Tap to Pay.
export async function GET(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The read runs service-role on purpose: inventory RLS is desk-only, but the
  // shelf price of a shirt isn't a secret from the artist selling it.
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const res = await sellableItems(admin);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 500 });
  return NextResponse.json({ items: res.items, taxBps: await taxBps(admin) });
}
