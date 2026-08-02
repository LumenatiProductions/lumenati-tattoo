"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle } from "@/components/admin/ui";

// The hosted artist pages' shop-wide branding — logo + page style. Writes go
// straight to shops (grants are per column: logo_url + template). One saved
// setting; every artist page wears it. Lumenati's Y2K site is hardcoded, so its
// card never shows. Lives on Shop → Settings (moved off the Team page 2026-08-02).

const TEMPLATES = [
  { key: "standard", name: "Minimal", blurb: "Clean and simple. The work leads." },
  { key: "dark", name: "Dark ink", blurb: "Heavier atmosphere. Blackwork energy, smoke instead of white." },
  { key: "flash", name: "Flash sheet", blurb: "The flash wall is the page. Prices on, tap to claim." },
];

export default function ShopBranding() {
  const supabase = createClient();
  const { email: myEmail } = useRole();
  const [shop, setShop] = useState<{ id: string; slug: string; logo_url: string | null; template: string } | null>(null);
  const [artistSlug, setArtistSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!myEmail) return;
    (async () => {
      const { data: me } = await supabase.from("profiles").select("shop_id").eq("email", myEmail).maybeSingle();
      if (!me?.shop_id) {
        setLoading(false);
        return;
      }
      const { data: s } = await supabase
        .from("shops")
        .select("id, slug, logo_url, template")
        .eq("id", me.shop_id)
        .maybeSingle();
      if (s) setShop(s as typeof shop);
      setLoading(false);
      // Any active artist works for the style preview links.
      const { data: a } = await supabase
        .from("artists")
        .select("slug")
        .eq("shop_id", me.shop_id)
        .eq("active", true)
        .order("sort")
        .limit(1)
        .maybeSingle();
      setArtistSlug((a?.slug as string | undefined) ?? null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail]);

  if (loading) return null;
  if (!shop) {
    return (
      <Card>
        <p className="p-4 text-sm text-white/65">Couldn&apos;t load the shop. Refresh and try again.</p>
      </Card>
    );
  }
  // Lumenati runs the hardcoded Y2K site, so its logo/style aren't editable — but
  // show the real controls greyed out so it's clear what other shops set up.
  const readOnly = shop.template === "y2k";
  const publicSlug = artistSlug?.startsWith(`${shop.slug}--`) ? artistSlug.slice(shop.slug.length + 2) : artistSlug;

  const pickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (readOnly || !file || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `shop-logo/${shop.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("room-photos").upload(path, file, { upsert: false });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("room-photos").getPublicUrl(path);
      const { error: upErr } = await supabase.from("shops").update({ logo_url: data.publicUrl }).eq("id", shop.id);
      if (upErr) throw new Error(upErr.message);
      setShop({ ...shop, logo_url: data.publicUrl });
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Logo upload failed, try again.");
    } finally {
      setBusy(false);
    }
  };

  const pickTemplate = async (next: string) => {
    if (readOnly || next === shop.template || busy) return;
    const prev = shop.template;
    setShop({ ...shop, template: next });
    setMsg(null);
    const { error } = await supabase.from("shops").update({ template: next }).eq("id", shop.id);
    if (error) {
      setShop({ ...shop, template: prev });
      setMsg(error.message);
    }
  };

  return (
    <div className="max-w-xl">
      {readOnly && (
        <div className="mb-4 rounded-lg border border-white/12 bg-white/5 px-4 py-3 text-sm text-white/70">
          Preview only. This is the setup every other shop gets. Your Lumenati site is the custom Y2K build, so
          these controls are off for you.
        </div>
      )}
      <div className={readOnly ? "pointer-events-none select-none opacity-55" : ""} aria-hidden={readOnly}>
      <SectionTitle>Shop logo</SectionTitle>
      <Card>
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            {shop.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shop.logo_url} alt="Shop logo" className="h-11 w-[72px] rounded-lg border border-white/10 object-contain" />
            ) : (
              <div className="flex h-11 w-[72px] items-center justify-center rounded-lg border border-white/12 text-[10px] text-white/45">
                none
              </div>
            )}
            <div className="min-w-0 flex-1">
              <label className="cursor-pointer text-sm font-semibold hover:text-white/85">
                {busy ? "Uploading…" : shop.logo_url ? "Change logo" : "Add your logo"}
                <input type="file" accept="image/*" className="hidden" onChange={pickLogo} disabled={busy} />
              </label>
              <p className="mt-0.5 text-xs text-white/55">
                Shows at the top of every artist page. A wide, transparent PNG looks best.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <SectionTitle>Page style</SectionTitle>
        <Card>
          <div className="space-y-2 p-4">
            {TEMPLATES.map((t) => {
              // Y2K has no template of its own, so show Minimal as the sample default.
              const active = readOnly ? t.key === "standard" : shop.template === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTemplate(t.key)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    active ? "border-brand bg-brand/10" : "border-white/12 hover:bg-white/6"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t.name}</span>
                    {publicSlug && (
                      <a
                        href={`/s/${shop.slug}/${publicSlug}?skin=${t.key}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
                      >
                        Preview
                      </a>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-white/55">{t.blurb}</div>
                </button>
              );
            })}
            <p className="pt-1 text-xs text-white/55">Every artist page wears this look the moment you pick it.</p>
            {msg && <p className="text-xs text-white/70">{msg}</p>}
          </div>
        </Card>
      </div>
      </div>
    </div>
  );
}
