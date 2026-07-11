import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userFromBearer } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Self-serve account deletion (App Store 5.1.1(v)): the signed-in user deletes
// their OWN login. The profiles row is the allowlist, so removing it revokes
// all app + admin access; the auth user goes too (cascading device tokens and
// personal goals/deductions with it). The artist business record (bookings,
// sales, ledger) stays — money history is the shop's, and those FKs already
// SET NULL/persist by design.
//
// Guardrail: the only owner of a shop can't delete themselves — that would
// strand the tenant with no admin. They hand the keys over first.
export async function DELETE(req: Request) {
  const me = await userFromBearer(req);
  if (!me?.email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  if (me.role === "owner") {
    const { count } = await admin
      .from("profiles")
      .select("email", { count: "exact", head: true })
      .eq("shop_id", me.shopId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "You're the shop's only admin — make someone else an admin first, then delete your account." },
        { status: 409 },
      );
    }
  }

  const { error: profErr } = await admin
    .from("profiles")
    .delete()
    .eq("email", me.email)
    .eq("shop_id", me.shopId);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const { error: authErr } = await admin.auth.admin.deleteUser(me.userId);
  if (authErr && !/not.?found/i.test(authErr.message)) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
