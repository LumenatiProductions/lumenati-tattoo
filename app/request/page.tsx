import { createAdminClient } from "@/lib/supabase/admin";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import RequestForm from "./RequestForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Book a tattoo",
  description: "Tell us what you want and we'll get you in the chair.",
};

// Public booking-request page. Lives OUTSIDE the (site) route group on purpose
// — same clean parent-brand shell as /intake and /pay, no Y2K bundle. The Y2K
// site links here when Scott wants it to; nothing on the public site changed.
// ?shop=<slug> (sent by the /s/<shop> template) scopes the artist roster and
// stamps the request on that shop; without it this stays Lumenati's page.
export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const { shop: shopSlug } = await searchParams;
  const admin = createAdminClient();
  let artists: { id: string; name: string }[] = [];
  let shopName = "Lumenati Tattoo";
  let resolvedSlug: string | undefined;
  if (admin) {
    let shopId = LUMENATI_SHOP_ID;
    if (shopSlug) {
      const { data: shop } = await admin
        .from("shops")
        .select("id, slug, name")
        .eq("slug", shopSlug)
        .maybeSingle();
      if (shop) {
        shopId = shop.id as string;
        shopName = (shop.name as string) || shopName;
        // Lumenati linked with its own slug still gets its logo header.
        if (shopId !== LUMENATI_SHOP_ID) resolvedSlug = shop.slug as string;
      }
    }
    const { data } = await admin
      .from("artists")
      .select("id, name")
      .eq("shop_id", shopId)
      .eq("active", true)
      .order("sort");
    artists = (data ?? []).map((a) => ({ id: a.id as string, name: a.name as string }));
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="bg-[#0e0e11] px-5 py-5">
        <div className="mx-auto max-w-xl">
          {resolvedSlug ? (
            <div className="text-xl font-semibold tracking-tight text-white">{shopName}</div>
          ) : (
            <LumenatiLogo bg="dark" className="w-28" />
          )}
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.3em] text-zinc-400">Book a tattoo</div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 py-6">
        <RequestForm artists={artists} shopSlug={resolvedSlug} />
      </main>
    </div>
  );
}
