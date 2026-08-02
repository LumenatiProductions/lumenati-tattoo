import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { segmentCounts } from "@/lib/marketing/segments";

export const dynamic = "force-dynamic";

// Segment sizes for the Marketing page: total per segment plus how many can
// actually be reached by text / email (consent + contact on file). Owner only.
// Reads happen with the service role (the marketing tables are server-only),
// scoped to the caller's own shop.
export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ segments: [] });

  const segments = await segmentCounts(admin, ctx.shopId);
  return NextResponse.json({ segments });
}
