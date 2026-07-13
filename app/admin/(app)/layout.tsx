import "../admin.css";
import "../phone.css";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "@/components/admin/AdminShell";
import NoAccess from "@/components/admin/NoAccess";
import { normalizeRole } from "@/lib/admin/types";

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

  return (
    <AdminShell
      realRole={normalizeRole(profile.role)}
      realArtistId={profile.artist_id}
      shopId={profile.shop_id ?? null}
      email={profile.email}
      fullName={profile.full_name}
    >
      {children}
    </AdminShell>
  );
}
