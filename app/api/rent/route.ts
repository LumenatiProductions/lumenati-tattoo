import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRentInvoices, isSquareConfigured } from "@/lib/square/client";

export const dynamic = "force-dynamic";

// Live booth-rent status from Square. Admins only.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (!profile || profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isSquareConfigured) return NextResponse.json({ invoices: [], configured: false });

  try {
    const invoices = await fetchRentInvoices();
    return NextResponse.json({ invoices, configured: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), invoices: [] },
      { status: 500 },
    );
  }
}
