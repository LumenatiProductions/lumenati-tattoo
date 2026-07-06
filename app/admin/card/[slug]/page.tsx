import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import PrintButton from "./PrintButton";

// Print-ready booking card for one artist (/admin/card/<slug>). Lives outside
// the (app) group on purpose: no sidebar, no shell — what you see is what the
// printer gets. Middleware already bounces anonymous visitors; the profile
// check below keeps it to people on the team.
//
// The card is a fixed 4x6in portrait (standard postcard stock). @page pins the
// paper size so File > Print with margins off gives a full-bleed card; the
// on-screen view is the same card with a print button beside it.

export const dynamic = "force-dynamic";

const CARD_W = "4in";
const CARD_H = "6in";

export default async function ArtistCardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  if (!profile?.role) redirect("/admin");

  const { slug } = await params;
  const { data: artist } = await supabase
    .from("artists")
    .select("slug, name, handle, color")
    .eq("slug", slug)
    .maybeSingle();
  if (!artist) notFound();

  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://lumenati-tattoo.vercel.app").replace(/\/$/, "");
  const url = `${base}/${artist.slug}`;
  const prettyUrl = url.replace(/^https?:\/\//, "");
  // Dark modules on the white tile — the high-contrast direction every phone
  // camera reads first try. M correction leaves headroom for print wear.
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
    color: { dark: "#0b0b12", light: "#ffffff" },
  });

  return (
    <div className="card-stage">
      <style>{`
        .card-stage {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 22px;
          background: #060609;
          padding: 32px 16px;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .booking-card {
          width: ${CARD_W};
          height: ${CARD_H};
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 0.42in 0.34in 0.3in;
          background:
            radial-gradient(120% 55% at 50% -8%, ${artist.color}2e 0%, rgba(11,11,18,0) 60%),
            linear-gradient(180deg, #101018 0%, #0b0b12 45%, #08080d 100%);
          color: #f4f4f8;
          border-radius: 14px;
          overflow: hidden;
        }
        .bc-logo { width: 0.62in; opacity: 0.95; }
        .bc-eyebrow {
          margin-top: 0.26in;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.32em;
          color: rgba(244,244,248,0.55);
        }
        .bc-name {
          margin-top: 0.07in;
          font-size: 30px;
          line-height: 1.08;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .bc-handle { margin-top: 4px; font-size: 12.5px; color: ${artist.color}; font-weight: 600; }
        .bc-qr {
          margin-top: 0.26in;
          width: 2.1in;
          height: 2.1in;
          padding: 0.16in;
          box-sizing: border-box;
          background: #ffffff;
          border-radius: 12px;
        }
        .bc-qr svg { width: 100%; height: 100%; display: block; }
        .bc-scan { margin-top: 0.18in; font-size: 12.5px; font-weight: 600; color: rgba(244,244,248,0.85); }
        .bc-url { margin-top: 3px; font-size: 10.5px; letter-spacing: 0.02em; color: rgba(244,244,248,0.5); }
        .bc-foot {
          margin-top: auto;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.3em;
          color: rgba(244,244,248,0.4);
        }
        .card-controls { display: flex; align-items: center; gap: 14px; }
        .card-hint { color: rgba(244,244,248,0.45); font-size: 12.5px; max-width: 4.4in; text-align: center; line-height: 1.5; }
        @media print {
          .card-stage { min-height: 0; padding: 0; background: #fff; display: block; }
          .booking-card { border-radius: 0; }
          .card-controls, .card-hint { display: none; }
        }
        @page { size: ${CARD_W} ${CARD_H}; margin: 0; }
      `}</style>

      <div className="booking-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lumenati-on-dark.svg" alt="Lumenati" className="bc-logo" />
        <div className="bc-eyebrow">BOOK WITH</div>
        <div className="bc-name">{artist.name}</div>
        {artist.handle ? <div className="bc-handle">@{artist.handle}</div> : null}
        <div className="bc-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <div className="bc-scan">Scan to see my work and grab a spot</div>
        <div className="bc-url">{prettyUrl}</div>
        <div className="bc-foot">LUMENATI TATTOO</div>
      </div>

      <div className="card-controls">
        <PrintButton />
      </div>
      <p className="card-hint">
        Prints as a 4 x 6 card — pick 4x6 paper (or borderless) in the print
        dialog and turn margins off. Ships straight to the front desk, mirror
        frames, or a stack next to the register.
      </p>
    </div>
  );
}
