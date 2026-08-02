"use client";

import { useRole } from "@/lib/admin/role-context";
import { PageHeader } from "@/components/admin/ui";
import ShopBranding from "@/components/admin/settings/ShopBranding";

// Shop settings — the shop's own branding (logo + page style), moved here off
// the Team page so it's where you'd actually look for it. Owner-only.
export default function SettingsPage() {
  const { realRole } = useRole();
  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }
  return (
    <div>
      <PageHeader
        title="Shop settings"
        subtitle="Your shop's logo and the look every artist page wears."
      />
      <ShopBranding />
    </div>
  );
}
