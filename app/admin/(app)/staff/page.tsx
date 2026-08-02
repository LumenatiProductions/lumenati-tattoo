"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useArtists } from "@/lib/admin/artists-context";
import { ROLE_LABELS, useRole } from "@/lib/admin/role-context";
import { normalizeRole } from "@/lib/admin/types";
import { Card, PageHeader, SectionTitle, Badge } from "@/components/admin/ui";
import type { Role } from "@/lib/admin/types";

// The new process: two roles. Admins run the shop; artists get their own
// room, money, and day. Everyone signs in with a text code to their phone
// (email works too — it anchors the account).

type Profile = {
  email: string;
  phone: string | null;
  role: Role;
  artist_id: string | null;
  full_name: string | null;
};

const prettyPhone = (p: string | null) =>
  p && /^\+1\d{10}$/.test(p) ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : p ?? "";

// The hosted artist pages' shop-wide settings — logo + page style. Same two
// controls as the app's Staff screen, same direct writes (grants are per
// column: logo_url + template). One saved setting; every artist page wears
// it. Lumenati's Y2K site is hardcoded, so its card never shows.
const TEMPLATES = [
  { key: "standard", name: "Minimal", blurb: "Clean and simple. The work leads." },
  { key: "dark", name: "Dark ink", blurb: "Heavier atmosphere. Blackwork energy, smoke instead of white." },
  { key: "flash", name: "Flash sheet", blurb: "The flash wall is the page. Prices on, tap to claim." },
];

function ShopPageCard({ myEmail }: { myEmail: string | null }) {
  const supabase = createClient();
  const [shop, setShop] = useState<{ id: string; slug: string; logo_url: string | null; template: string } | null>(null);
  const [artistSlug, setArtistSlug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!myEmail) return;
    (async () => {
      const { data: me } = await supabase.from("profiles").select("shop_id").eq("email", myEmail).maybeSingle();
      if (!me?.shop_id) return;
      const { data: s } = await supabase
        .from("shops")
        .select("id, slug, logo_url, template")
        .eq("id", me.shop_id)
        .maybeSingle();
      if (s) setShop(s as typeof shop);
      // Any active artist works for the style preview links.
      const { data: a } = await supabase
        .from("artists")
        .select("slug")
        .eq("shop_id", me.shop_id)
        .eq("active", true)
        .order("sort")
        .limit(1)
        .maybeSingle();
      const slug = (a?.slug as string | undefined) ?? null;
      setArtistSlug(slug);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail]);

  if (!shop || shop.template === "y2k") return null;
  const publicSlug = artistSlug?.startsWith(`${shop.slug}--`) ? artistSlug.slice(shop.slug.length + 2) : artistSlug;

  const pickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || busy) return;
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
    if (next === shop.template || busy) return;
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
    <div className="mt-5">
      <SectionTitle>Shop page</SectionTitle>
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

          <div>
            <div className="mb-2 text-xs uppercase tracking-wide text-white/55">Page style</div>
            <div className="space-y-2">
              {TEMPLATES.map((t) => {
                const active = shop.template === t.key;
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
            </div>
            <p className="mt-2 text-xs text-white/55">Every artist page wears this look the moment you pick it.</p>
          </div>
          {msg && <p className="text-xs text-white/70">{msg}</p>}
        </div>
      </Card>
    </div>
  );
}

export default function StaffPage() {
  const { realRole, email: myEmail } = useRole();
  const { artists } = useArtists();
  const supabase = createClient();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "artist">("artist");
  const [artistId, setArtistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("role");
    setRows((data as Profile[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        name,
        role,
        artistId: role === "artist" ? artistId || artists[0]?.id || null : null,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(d.error || "Could not add them.");
      return;
    }
    setEmail("");
    setPhone("");
    setName("");
    setMsg(phone ? "Added. They can sign in right now with a text code." : "Added. They can sign in with an email code.");
    load();
  };

  const remove = async (em: string) => {
    if (em === myEmail) {
      setMsg("You can't remove yourself. Have another admin do it.");
      return;
    }
    if (!window.confirm(`Remove ${em}? They lose access immediately.`)) return;
    const r = await fetch(`/api/staff?email=${encodeURIComponent(em)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${em} removed.` : d.error || "Could not remove them.");
    load();
  };

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Two roles: admins run the shop, artists run their chair. Add someone with their phone number and they sign in with a text code. No passwords, nothing to set up."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionTitle>Team</SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/55">
                  <th className="px-4 py-2.5 font-medium">Who</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Artist</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-white/55">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-white/55">No one yet.</td></tr>
                )}
                {rows.map((p) => (
                  <tr key={p.email} className="border-b border-white/8 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{p.full_name || p.email}</div>
                      {p.full_name && <div className="text-xs text-white/60">{p.email}</div>}
                    </td>
                    <td className="tnum px-4 py-2.5 text-white/70">
                      {p.phone ? prettyPhone(p.phone) : <span className="text-white/45">·</span>}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone="brand">{ROLE_LABELS[normalizeRole(p.role)]}</Badge></td>
                    <td className="px-4 py-2.5 text-white/70">
                      {p.artist_id ? artists.find((a) => a.id === p.artist_id)?.name ?? p.artist_id : "·"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => remove(p.email)}
                        className="rounded-lg border border-white/12 px-2 py-1 text-xs text-white/65 hover:bg-white/6"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <SectionTitle>Add someone</SectionTitle>
          <Card>
            <form onSubmit={add} className="space-y-3 p-4">
              <input className="inp" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
              <input
                className="inp"
                type="tel"
                placeholder="phone (they'll get text codes)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input className="inp" type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className="inp" value={role} onChange={(e) => setRole(e.target.value as "admin" | "artist")}>
                <option value="artist">Artist</option>
                <option value="admin">Admin</option>
              </select>
              {role === "artist" && (
                <select
                  className="inp"
                  value={artistId || artists[0]?.id || ""}
                  onChange={(e) => setArtistId(e.target.value)}
                >
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add to team"}
              </button>
              {msg && <p className="text-xs text-white/70">{msg}</p>}
            </form>
          </Card>

          <ShopPageCard myEmail={myEmail} />
        </div>
      </div>
    </div>
  );
}
