"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { useRole } from "@/lib/admin/role-context";
import { useArtists } from "@/lib/admin/artists-context";
import { Card, SectionTitle } from "@/components/admin/ui";
import { PageHead } from "@/components/admin/home/shared";

// The artist's booking QR card, on desktop. A QR straight to their public room
// (/<slug>) for the counter or a quick share. The print-ready 4x6 lives at
// /admin/card/<slug>; this is the at-a-glance version with a link over to it.
// QR is rendered the same way the print card does it: the `qrcode` lib as an
// inline SVG (dark modules on a white tile), so both cards read identically.

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");

export default function QrCardPage() {
  const { asArtistId } = useRole();
  const { artists, loading } = useArtists();
  // Owners have no artist id of their own, so asArtistId falls back to a shared
  // default ("jd") that is NOT on most shops' rosters. Show a real member of
  // THIS shop: the previewed artist when they're on the scoped roster, else the
  // first artist. (The roster query is shop-scoped; the leak was picking an id
  // that only exists in the Lumenati mock fallback.)
  const artist = artists.find((a) => a.id === asArtistId) ?? artists[0];

  const url = artist ? `${SITE}/${artist.slug}` : "";
  const prettyUrl = url.replace(/^https?:\/\//, "");

  const [qrSvg, setQrSvg] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!url) {
      setQrSvg("");
      return;
    }
    let alive = true;
    QRCode.toString(url, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
      color: { dark: "#0b0b12", light: "#ffffff" },
    })
      .then((svg) => {
        if (alive) setQrSvg(svg);
      })
      .catch(() => {
        if (alive) setQrSvg("");
      });
    return () => {
      alive = false;
    };
  }, [url]);

  const glow = useMemo(
    () => (artist ? `radial-gradient(120% 55% at 50% -8%, ${artist.color}2e 0%, rgba(11,11,18,0) 60%)` : ""),
    [artist]
  );

  // Wait for the shop-scoped roster before rendering, so the Lumenati mock
  // fallback (which contains J.D.) never flashes into another shop's tenant.
  if (loading || !artist) return null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div>
      <PageHead title="QR card" sub="Your booking QR, ready for the counter or a share" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <Card>
          <div
            className="flex flex-col items-center rounded-xl px-6 py-7 text-center"
            style={{ background: glow }}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.32em] text-white/55">Book with</div>
            <div className="mt-1 text-2xl font-extrabold tracking-tight text-white">{artist.name}</div>
            {artist.handle ? (
              <div className="mt-0.5 text-sm font-semibold" style={{ color: artist.color }}>
                @{artist.handle}
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl bg-white p-4">
              {qrSvg ? (
                <div className="h-44 w-44 [&>svg]:block [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
              ) : (
                <div className="h-44 w-44" />
              )}
            </div>

            <div className="mt-4 text-[13px] font-semibold text-white/85">Scan to see my work and grab a spot</div>
            <div className="tnum mt-1 text-[11px] text-white/50">{prettyUrl}</div>
          </div>
        </Card>

        <div>
          <SectionTitle>Share it</SectionTitle>
          <Card>
            <div className="p-4">
              <p className="text-sm text-white/65">
                Point a camera at the QR and it opens your public page. Save it for flash sheets,
                stories, and the mirror by your station, or print the full card for the counter.
              </p>

              <label className="mt-4 block text-xs font-medium text-white/65">Public link</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  readOnly
                  value={prettyUrl}
                  className="tnum w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm text-white/85 outline-none"
                />
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>

              <a
                href={`/admin/card/${artist.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                Open printable card
              </a>
              <p className="mt-2 text-xs text-white/45">
                Opens the 4 x 6 print-ready card in a new tab.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
