"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilterChips, PageHeader } from "@/components/admin/ui";
import { useRole } from "@/lib/admin/role-context";
import ShopBranding from "@/components/admin/settings/ShopBranding";
import BillingTab from "@/components/admin/settings/BillingTab";
import HealthTab from "@/components/admin/settings/HealthTab";
import IntegrationsClient from "@/components/admin/IntegrationsClient";
import ImportTab from "@/components/admin/settings/ImportTab";

// Settings. The shop's own knobs behind tabs: how the pages look, the
// Lumenati membership, the health log, and (for the one shop that has it)
// the Square history link. Owner-only; the server page gates it.
export type SquareProps = {
  configured: boolean;
  members: { square_id: string; name: string; artist_id: string | null }[];
  lastSyncedAt: string | null;
  lastResult: string | null;
  salesCount: number;
  artists: { id: string; name: string }[];
};

type TabKey = "shop" | "import" | "billing" | "health" | "square";

export default function SettingsTabs({ square }: { square: SquareProps | null }) {
  return (
    <Suspense fallback={null}>
      <SettingsInner square={square} />
    </Suspense>
  );
}

function SettingsInner({ square }: { square: SquareProps | null }) {
  const router = useRouter();
  const { shopSlug, isY2k } = useRole();
  const pagesUrl = typeof window === "undefined" ? `/s/${shopSlug ?? ""}` : `${window.location.origin}/s/${shopSlug ?? ""}`;
  const params = useSearchParams();
  const tabs: { key: TabKey; label: string }[] = [
    { key: "shop", label: "Shop" },
    { key: "import", label: "Bring your people over" },
    { key: "billing", label: "Billing" },
    { key: "health", label: "Health" },
    ...(square ? [{ key: "square" as const, label: "Square history" }] : []),
  ];
  const wanted = params.get("tab") as TabKey | null;
  const tab: TabKey = tabs.some((t) => t.key === wanted) ? (wanted as TabKey) : "shop";
  return (
    <div>
      <PageHeader title="Settings" subtitle="Your shop's look, your Lumenati membership, and what quietly went wrong." />
      <FilterChips
        filters={tabs}
        value={tab}
        onChange={(k) => router.replace(`/admin/settings?tab=${k}`, { scroll: false })}
      />
      <div className="mt-2">
        {tab === "shop" && (
          <>
            <p className="mb-2 text-sm text-white/65">Your shop&apos;s logo and the look every artist page wears.</p>
            {!isY2k && shopSlug && (
              <p className="mb-5 text-sm text-white/65">
                Your artists&apos; pages live at{" "}
                <a href={pagesUrl} target="_blank" rel="noreferrer" className="font-medium text-white underline underline-offset-2">
                  {pagesUrl.replace(/^https?:\/\//, "")}
                </a>
                . That is a booking page, not a website. Keep your site and link to it.
              </p>
            )}
            <ShopBranding />
          </>
        )}
        {tab === "import" && <ImportTab />}
        {tab === "billing" && <BillingTab />}
        {tab === "health" && <HealthTab />}
        {tab === "square" && square && <IntegrationsClient {...square} />}
      </div>
    </div>
  );
}
