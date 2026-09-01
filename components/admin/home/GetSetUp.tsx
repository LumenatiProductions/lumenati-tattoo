"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useRole } from "@/lib/admin/role-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useClients } from "@/lib/admin/clients-context";
import { useRoomContent } from "@/lib/admin/room-content";
import { Card, SectionTitle } from "@/components/admin/ui";

// The first-run "get set up" card: what a brand-new owner does after the
// wizard, read live from their own data (no manual check-offs). It retires
// itself when the shop is dressed, and a Hide link retires it early. Y2K
// (Lumenati's custom skin) never sees it — this is for hosted-page shops.

type Shop = { id: string; slug: string; logo_url: string | null; template: string };

export default function GetSetUp() {
  const supabase = createClient();
  const { role } = useRole();
  const { artists } = useArtists();
  const { total: clientCount } = useClients();
  const { get, ready } = useRoomContent();
  const [shop, setShop] = useState<Shop | null>(null);
  const [hidden, setHidden] = useState(true);
  const [copied, setCopied] = useState(false);
  // Payments status comes from /api/connect (the onboarded flag is a server-only
  // column with no client grant), so the "connect your bank" step retires itself
  // once Stripe onboarding is done. `pay` null = not loaded / Stripe not set up.
  const [pay, setPay] = useState<{ onboarded: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { data: me } = await supabase.from("profiles").select("shop_id").eq("email", user.email).maybeSingle();
      if (!me?.shop_id) return;
      const { data } = await supabase
        .from("shops")
        .select("id, slug, logo_url, template")
        .eq("id", me.shop_id)
        .maybeSingle();
      if (data) {
        setShop(data as Shop);
        try {
          setHidden(localStorage.getItem(`lum-setup-hidden-${(data as Shop).id}`) === "1");
        } catch {
          setHidden(false);
        }
      }
      // Only surface the payments step when Stripe is actually configured, so a
      // pre-keys environment doesn't nag about a bank link that can't happen yet.
      const cr = await fetch("/api/connect")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      if (cr?.configured && cr.shop) setPay({ onboarded: !!cr.shop.onboarded });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (role !== "owner" || !shop || !ready || hidden || shop.template === "y2k") return null;

  const crew = artists.filter((a) => a.active);
  const faced = crew.filter((a) => get(a.id).profilePhoto).length;
  const showing = crew.filter((a) => {
    const r = get(a.id);
    return r.portfolio.length + r.polaroids.length > 0;
  }).length;
  // A one-person shop IS the artist — speak in "you/your" (your page, your work),
  // not the shop-with-a-crew wording ("your artists", "X of Y portfolios").
  const solo = crew.length <= 1;

  const steps = [
    // The money step leads: right after signup, connecting your bank so you can
    // take cards is the most important thing. Only shown once Stripe is set up.
    ...(pay
      ? [
          {
            done: pay.onboarded,
            title: "Connect your bank to get paid",
            sub: "Take cards with the money going straight to you. Clients cover the card fee, you keep 100%.",
            href: "/admin/money?tab=pay",
            cta: "Set up payments",
            money: true,
          },
        ]
      : []),
    {
      // Leaving another tool? Their people come with them. Retires once the
      // book has real names in it, however they got there.
      done: clientCount >= 10,
      title: "Bring your clients over",
      sub: "Export a spreadsheet from Square, Booksy, Vagaro, Podium or Mailchimp and drop it in. Contact, last visit and consent come with it.",
      href: "/admin/settings?tab=import",
      cta: "Import",
      money: false,
    },
    {
      done: !!shop.logo_url,
      title: solo ? "Add your logo" : "Add your shop logo",
      sub: solo ? "It tops your page." : "It tops every artist page.",
      href: "/admin/settings",
      cta: "Add logo",
      money: false,
    },
    {
      done: crew.length > 0 && faced === crew.length,
      title: solo ? "Add your photo" : "Put a face on every page",
      sub: solo
        ? "A profile photo tops your page so clients know who they're booking."
        : crew.length
          ? `${faced} of ${crew.length} artists have a profile photo.`
          : "Add your crew first.",
      href: "/admin/room",
      cta: solo ? "Page editor" : "My Page editor",
      money: false,
    },
    {
      done: crew.length > 0 && showing === crew.length,
      title: solo ? "Show your work" : "Show the work",
      sub: solo
        ? "Fill your page with your best pieces."
        : crew.length
          ? `${showing} of ${crew.length} portfolios have photos in them.`
          : "Add your crew first.",
      href: "/admin/room",
      cta: solo ? "Page editor" : "My Page editor",
      money: false,
    },
  ];
  if (steps.every((s) => s.done)) return null;

  const pageUrl = `${typeof window === "undefined" ? "" : window.location.origin}/s/${shop.slug}`;
  const hide = () => {
    try {
      localStorage.setItem(`lum-setup-hidden-${shop.id}`, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between">
        <SectionTitle>
          Get set up{" "}
          <span className="font-normal text-white/50">
            · your page{solo ? "" : "s"} get{solo ? "s" : ""} better with every step
          </span>
        </SectionTitle>
        <button onClick={hide} className="text-xs text-white/40 hover:text-white/70">
          Hide
        </button>
      </div>
      <Card>
        <ul className="divide-y divide-white/8">
          {steps.map((s) => (
            <li key={s.title} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] font-bold ${
                  s.done ? "border-emerald-400/60 text-emerald-400" : "border-white/20 text-transparent"
                }`}
              >
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${s.done ? "text-white/45 line-through" : ""}`}>{s.title}</div>
                {!s.done && <div className="mt-0.5 text-xs text-white/55">{s.sub}</div>}
              </div>
              {!s.done &&
                (s.money ? (
                  <Link
                    href={s.href}
                    className="flex-none rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    {s.cta}
                  </Link>
                ) : (
                  <Link
                    href={s.href}
                    className="flex-none rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/5"
                  >
                    {s.cta}
                  </Link>
                ))}
            </li>
          ))}
          <li className="flex items-center gap-3 px-4 py-3">
            <span className="h-5 w-5 flex-none" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Share your page{solo ? "" : "s"}</div>
              <div className="truncate text-xs text-white/55">{pageUrl}</div>
            </div>
            <button
              onClick={copy}
              className="flex-none rounded-lg border border-white/12 px-3 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/5"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </li>
        </ul>
      </Card>
    </div>
  );
}
