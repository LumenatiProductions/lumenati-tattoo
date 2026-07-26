"use client";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { createClient } from "@/lib/supabase/browser";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { PageHead, Empty } from "@/components/admin/home/shared";

// Healed shots on desktop — the phone app's content engine, in the Command
// Center. Clients send healed photos through the 14-day follow-up; approved
// ones are already in the artist's portfolio. This gallery puts them one click
// from Instagram: copy the ready-to-paste caption, or download the image to
// drop into a post. There's no native share sheet on desktop, so "share" is
// caption-to-clipboard plus image download.

type Shot = {
  id: string;
  url: string;
  status: string;
  created_at: string;
  artist_id: string | null;
};

// The caption the phone app pre-copies — same wording, keyed to the artist's IG
// handle when we have one.
const captionFor = (handle: string) =>
  [
    "Healed and settled.",
    handle ? `Tattoo by @${handle} at Lumenati Tattoo.` : "Done at Lumenati Tattoo.",
    "Book through the link in bio.",
    "#healedtattoo #tattoo #tattooartist",
  ].join(" ");

// The bucket is private (2026-07-26): rows store paths, so images render
// through the signing endpoint (cookie auth rides along). Legacy rows that
// still hold a full URL render directly.
const photoSrc = (shot: Shot) =>
  /^https?:\/\//i.test(shot.url) ? shot.url : `/api/healed/photo?id=${shot.id}&redirect=1`;

export default function HealedPage() {
  const { asArtistId } = useRole();
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [handle, setHandle] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = createClient();
    // Approved healed photos only — the ones already in the portfolio, ready to
    // post. Scoped to the current artist (owner preview passes the id through).
    const { data } = await sb
      .from("healed_photos")
      .select("id, url, status, created_at, artist_id")
      .eq("artist_id", asArtistId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(60);
    setShots((data ?? []) as Shot[]);

    // The artist's IG handle feeds the caption.
    const { data: a } = await sb
      .from("artists")
      .select("handle")
      .eq("id", asArtistId)
      .maybeSingle();
    setHandle((a?.handle as string) ?? "");
  }, [asArtistId]);

  useEffect(() => {
    setShots(null);
    load();
  }, [load]);

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(captionFor(handle));
      setNote("Caption copied. Paste it into your post.");
    } catch {
      setNote("Could not copy the caption. Copy it by hand from the box above.");
    }
  };

  // "Share" on desktop: caption to clipboard, then download the image so it's in
  // the Downloads folder to attach to a post or Story.
  const share = async (shot: Shot) => {
    setBusyId(shot.id);
    setNote(null);
    try {
      try {
        await navigator.clipboard.writeText(captionFor(handle));
      } catch {
        /* clipboard can fail without a user gesture — still let the download run */
      }
      const res = await fetch(photoSrc(shot));
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `healed-${shot.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setNote("Image downloaded and caption copied. Paste the caption into your post.");
    } catch {
      setNote("Could not download that photo. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHead title="Healed shots" sub="Approved healed photos, ready to post" />

      <Card className="mb-4">
        <div className="p-4">
          <p className="text-sm text-white/65">
            Clients send these through the healed-photo follow-up. Approved shots are already in your
            portfolio. Copy the caption, then download a photo to post it to Instagram or Stories.
          </p>
          <div className="mt-3 rounded-lg border border-white/12 bg-white/6 p-3 text-sm text-white/80">
            {captionFor(handle)}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={copyCaption}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              Copy caption
            </button>
            {note && <span className="text-sm font-medium text-emerald-400">{note}</span>}
          </div>
        </div>
      </Card>

      {shots === null ? (
        <Card>
          <Empty>Loading your healed shots...</Empty>
        </Card>
      ) : shots.length === 0 ? (
        <Card>
          <div className="px-4 py-8 text-center">
            <div className="text-base font-semibold">No healed shots yet</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/60">
              Two weeks after an appointment, your client gets a text asking for a healed photo. When
              they send one and you approve it, it shows up here and in your portfolio.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <SectionTitle>
            {shots.length} shot{shots.length === 1 ? "" : "s"}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {shots.map((s) => (
              <Card key={s.id} className="overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(s)}
                  alt="Healed tattoo"
                  className="aspect-square w-full rounded-t-xl object-cover"
                />
                <div className="flex items-center justify-between gap-2 p-3">
                  <Badge tone="good">in portfolio</Badge>
                  <button
                    onClick={() => share(s)}
                    disabled={busyId === s.id}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {busyId === s.id ? "Sharing..." : "Share"}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
