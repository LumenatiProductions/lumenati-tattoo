"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { useRole } from "@/lib/admin/role-context";
import { useArtists } from "@/lib/admin/artists-context";
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

  const steps = [
    // The money step leads: right after signup, connecting your bank so you can
    // take cards is the most important thing. Only shown once Stripe is set up.
    ...(pay
      ? [
          {
            done: pay.onboarded,
            title: "Connect your bank to get paid",
            sub: "Take cards with the money going straight to you. Clients cover the card fee, you keep 100%.",
            href: "/admin/payouts",
            cta: "Set up payments",
            money: true,
          },
        ]
      : []),
    {
      done: !!shop.logo_url,
      title: "Add your shop logo",
      sub: "It tops every artist page.",
      href: "/admin/staff",
      cta: "Team page",
      money: false,
    },
    {
      done: crew.length > 0 && faced === crew.length,
      title: "Put a face on every page",
      sub: crew.length ? `${faced} of ${crew.length} artists have a profile photo.` : "Add your crew first.",
      href: "/admin/room",
      cta: "My Page editor",
      money: false,
    },
    {
      done: crew.length > 0 && showing === crew.length,
      title: "Show the work",
      sub: crew.length ? `${showing} of ${crew.length} portfolios have photos in them.` : "Add your crew first.",
      href: "/admin/room",
      cta: "My Page editor",
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
          Get set up <span className="font-normal text-white/50">· your pages get better with every step</span>
        </SectionTitle>
        <button onClick={hide} className="text-xs text-white/40 hover:text-white/70">
          Hide
        </button>
      </div>
      <Card>
        <ul className="divide-y divide-white/8">
          {steps.map((s) => (
            <li key={s.title} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span
                className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] font-bold ${
                  s.done ? "border-emerald-400/60 text-emerald-400" : "border-white/20 text-transparent"
                }`}
              >
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${s.done ? "text-white/45 line-through" : ""}`}>{s.title}</div>
                {!s.done && <div className="text-xs text-white/55">{s.sub}</div>}
              </div>
              {!s.done &&
                (s.money ? (
                  <Link
                    href={s.href}
                    className="flex-none rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {s.cta}
                  </Link>
                ) : (
                  <Link href={s.href} className="flex-none text-sm font-semibold text-sky-300 hover:text-sky-200">
                    {s.cta}
                  </Link>
                ))}
            </li>
          ))}
          <li className="flex items-center gap-3 py-2.5 last:pb-0">
            <span className="h-5 w-5 flex-none" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Share your pages</div>
              <div className="truncate text-xs text-white/55">{pageUrl}</div>
            </div>
            <button onClick={copy} className="flex-none text-sm font-semibold text-sky-300 hover:text-sky-200">
              {copied ? "Copied" : "Copy link"}
            </button>
          </li>
        </ul>
      </Card>
    </div>
  );
}
