import "../admin.css";
import "../phone.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminShell, { type BillingShellState } from "@/components/admin/AdminShell";
import NoAccess from "@/components/admin/NoAccess";
import { normalizeRole } from "@/lib/admin/types";
import { SHOP_BILLING_COLS, type ShopBilling, shopIsOpen, trialDaysLeft } from "@/lib/stripe/billing";

// Auth gate for the whole dashboard. Middleware already bounces anonymous
// visitors to /admin/login; here we load the profile (role) and block anyone
// authenticated who isn't on the allowlist.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role, artist_id, full_name, shop_id")
    .eq("email", user.email!)
    .maybeSingle();

  if (!profile) return <NoAccess email={user.email!} />;

  // Membership check (server-side; the billing columns have no client grants).
  // Fails OPEN — a hiccup here must never lock a paying shop out of its books.
  let billing: BillingShellState | null = null;
  // Which public shape this shop's pages take: y2k = Lumenati's own site,
  // anything else = artist pages + a roster page under /s/<slug>.
  let shopSlug: string | null = null;
  let shopTemplate: string | null = null;
  if (profile.shop_id) {
    const admin = createAdminClient();
    if (admin) {
      const { data: pub } = await admin.from("shops").select("slug, template").eq("id", profile.shop_id).maybeSingle();
      shopSlug = (pub?.slug as string | null) ?? null;
      shopTemplate = (pub?.template as string | null) ?? null;
      const { data: shop } = await admin
        .from("shops")
        .select(SHOP_BILLING_COLS)
        .eq("id", profile.shop_id)
        .maybeSingle();
      if (shop) {
        const s = shop as unknown as ShopBilling;
        billing = { locked: !shopIsOpen(s), trialDaysLeft: trialDaysLeft(s) };
      }
    }
  }

  return (
    <AdminShell
      billing={billing}
      realRole={normalizeRole(profile.role)}
      realArtistId={profile.artist_id}
      shopId={profile.shop_id ?? null}
      shopSlug={shopSlug}
      shopTemplate={shopTemplate}
      email={profile.email}
      fullName={profile.full_name}
    >
      {children}
    </AdminShell>
  );
}
