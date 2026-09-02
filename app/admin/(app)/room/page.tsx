"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import SelfServeSettings from "@/components/admin/room/SelfServeSettings";
import { useRole } from "@/lib/admin/role-context";
import {
  useRoomContent,
  COLOR_PRESETS,
} from "@/lib/admin/room-content";
import { MUSIC_VIDEOS, MUSIC_VIDEO_MIN, SHOP_TV_CHANNELS, roomTvId } from "@/lib/kiosk/tv-channels";
import { useArtists } from "@/lib/admin/artists-context";
import { createClient } from "@/lib/supabase/browser";
import { uploadPhoto } from "@/lib/admin/room-data";
import type { RoomContent } from "@/lib/admin/types";
import { Card, SectionTitle } from "@/components/admin/ui";

// The other networks live in room.socials; Instagram stays on its own igHandle
// field (the public page reads socials.instagram ?? igHandle). Same set the
// phone app edits, so the two surfaces finally match.
const SOCIAL_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "tiktok", label: "TikTok", placeholder: "@handle" },
  { key: "x", label: "X", placeholder: "@handle" },
  { key: "youtube", label: "YouTube", placeholder: "@channel or URL" },
  { key: "facebook", label: "Facebook", placeholder: "page or URL" },
  { key: "website", label: "Website", placeholder: "yoursite.com" },
];

// Stable-ish id without Math.random/Date in render paths that could surprise us.
let uid = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${uid++}`;

export default function RoomEditorPage() {
  const { role, asArtistId, isY2k } = useRole();
  const { get, update, saveState, ready } = useRoomContent();
  const { artists } = useArtists();

  // Artists edit their own room; owners can pick whose room to edit. An
  // owner's default pick must come from THEIR roster (a hardcoded Lumenati
  // id blanked the page for every other shop).
  const [ownerPick, setOwnerPick] = useState<string>(asArtistId);

  // The live preview is an iframe of the REAL public page, so it always matches
  // the shop's actual skin. Bump a tick whenever a save lands to reload it.
  // NOTE: every hook must run before the loading guard below. A cold load where
  // the roster arrives after the first render would otherwise change the hook
  // count mid-mount and React throws "Rendered more hooks than during the
  // previous render", white-screening the whole app (~2 of 3 hard loads).
  const [previewTick, setPreviewTick] = useState(0);
  useEffect(() => {
    if (saveState === "saved") setPreviewTick((t) => t + 1);
  }, [saveState]);

  const pick = role === "artist" ? asArtistId : ownerPick;
  const artistId = artists.some((a) => a.id === pick) ? pick : artists[0]?.id ?? "";
  const artist = artists.find((a) => a.id === artistId);
  const room = get(artistId);

  // Wait for the roster AND the room content to resolve before rendering the
  // editor. Rendering with an unresolved room (roster loaded first, DB rooms
  // still in flight) read undefined fields and crashed the page. Never
  // white-screen: show a lightweight loading state until both are ready.
  if (!ready || !artist || !room) {
    return <div className="py-16 text-center text-sm text-white/55">Loading…</div>;
  }

  const set = <K extends keyof RoomContent>(key: K, val: RoomContent[K]) =>
    update(artistId, { [key]: val } as Partial<RoomContent>);

  // Write one social handle into room.socials, pruning blanks so the record
  // stays clean (null when nothing is set).
  const socials = room.socials ?? {};
  const setSocial = (key: string, val: string) => {
    const next = { ...socials, [key]: val };
    if (!val.trim()) delete next[key];
    set("socials", Object.keys(next).length ? next : null);
  };

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {role === "owner" ? "Artist Pages" : "My Page"}
          </h1>
          <p className="text-sm text-white/65">
            {role === "owner"
              ? "Edit any artist's public page. Pick a page on the right; changes go live right away."
              : "Edit what shows on your page. Changes go live right away."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveState !== "idle" && (
            <span
              className={`text-xs font-medium ${
                saveState === "error"
                  ? "text-rose-400"
                  : saveState === "saved"
                    ? "text-emerald-400"
                    : "text-white/55"
              }`}
            >
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Couldn't save, retry your last edit"}
            </span>
          )}
          {role === "owner" && (
            <select
              value={ownerPick}
              onChange={(e) => setOwnerPick(e.target.value)}
              className="rounded-lg border border-white/12 bg-white/6 px-3 py-1.5 text-sm"
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}&apos;s page
                </option>
              ))}
            </select>
          )}
          <a
            href={`/${artist.slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-white/14 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            View live page ↗
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_minmax(360px,440px)]">
        {/* ── Editor ── */}
        <div className="space-y-5">
          <section>
            <SectionTitle>Identity</SectionTitle>
            <Card>
              <div className="space-y-4 p-4">
                <Field label="Tagline">
                  <input
                    className="inp"
                    value={room.tagline}
                    onChange={(e) => set("tagline", e.target.value)}
                    placeholder="skater // gamer // bold color tattoos"
                  />
                </Field>
                <Field label="Instagram handle">
                  <div className="flex items-center rounded-lg border border-white/12 bg-white/6">
                    <span className="pl-3 text-white/55">@</span>
                    <input
                      className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                      value={room.igHandle}
                      onChange={(e) => set("igHandle", e.target.value.replace(/^@/, ""))}
                    />
                  </div>
                </Field>
                <Field label="Bio">
                  <textarea
                    className="inp min-h-24 resize-y"
                    value={room.bio}
                    onChange={(e) => set("bio", e.target.value)}
                  />
                </Field>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>Bookings</SectionTitle>
            <Card>
              <BooksToggle artistId={artistId} />
              <SelfServeSettings artistId={artistId} />
            </Card>
          </section>

          <section>
            <SectionTitle>Socials</SectionTitle>
            <Card>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                {SOCIAL_FIELDS.map((s) => (
                  <Field key={s.key} label={s.label}>
                    <input
                      className="inp"
                      value={socials[s.key] ?? ""}
                      onChange={(e) => setSocial(s.key, e.target.value)}
                      placeholder={s.placeholder}
                    />
                  </Field>
                ))}
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>Vibe</SectionTitle>
            <Card>
              <div className="space-y-4 p-4">
                {/* Winamp only exists on Lumenati's own site; other shops' themes have no player. */}
                {isY2k && (
                <Field label="Their song (Winamp plays it; the video is the MTV icon on their desktop)">
                  <select
                    className="inp"
                    value={roomTvId(room.songId, room.tvVideoId) ?? ""}
                    onChange={(e) => set("tvVideoId", e.target.value || null)}
                  >
                    <optgroup label="Music videos">
                      {MUSIC_VIDEOS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Anything else on the shop TV">
                      {SHOP_TV_CHANNELS.filter((c) => c.num < MUSIC_VIDEO_MIN).map((c) => (
                        <option key={c.id} value={c.id}>
                          CH {c.num}: {c.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
                )}
                <Field label="Accent color">
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() => set("accentColor", c)}
                        className={`h-7 w-7 rounded-full ring-offset-2 ${
                          room.accentColor.toLowerCase() === c.toLowerCase()
                            ? "ring-2 ring-white/30"
                            : "ring-1 ring-white/15"
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <label className="ml-1 flex items-center gap-1.5 text-xs text-white/65">
                      custom
                      <input
                        type="color"
                        value={room.accentColor}
                        onChange={(e) => set("accentColor", e.target.value)}
                        className="h-7 w-9 cursor-pointer rounded border border-white/12 bg-white/6 p-0.5"
                      />
                    </label>
                  </div>
                </Field>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle>Profile photo</SectionTitle>
            <Card>
              <div className="flex items-center gap-4 p-4">
                <img
                  src={room.profilePhoto}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-white/15"
                />
                <UploadButton artistId={artistId} onPick={(src) => set("profilePhoto", src)}>
                  Replace photo
                </UploadButton>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle
              action={
                <UploadButton
                  small
                  artistId={artistId}
                  onPick={(src) =>
                    set("polaroids", [
                      ...room.polaroids,
                      { id: newId("pol"), src, caption: "new pic" },
                    ])
                  }
                >
                  + Add polaroid
                </UploadButton>
              }
            >
              Polaroids
            </SectionTitle>
            <Card>
              <div className="p-4">
                {room.polaroids.length === 0 && <Empty>No polaroids yet.</Empty>}
                <div className="space-y-3">
                  {room.polaroids.map((p) => (
                    <Row
                      key={p.id}
                      src={p.src}
                      onRemove={() =>
                        set("polaroids", room.polaroids.filter((x) => x.id !== p.id))
                      }
                    >
                      <input
                        className="inp"
                        value={p.caption}
                        onChange={(e) =>
                          set(
                            "polaroids",
                            room.polaroids.map((x) =>
                              x.id === p.id ? { ...x, caption: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="caption"
                      />
                    </Row>
                  ))}
                </div>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle
              action={
                <UploadButton
                  small
                  artistId={artistId}
                  onPick={(src) =>
                    set("portfolio", [
                      ...room.portfolio,
                      { id: newId("pf"), src, alt: "" },
                    ])
                  }
                >
                  + Add photo
                </UploadButton>
              }
            >
              Portfolio
            </SectionTitle>
            <Card>
              <div className="p-4">
                {room.portfolio.length === 0 && <Empty>No portfolio photos yet.</Empty>}
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {room.portfolio.map((p) => (
                    <div key={p.id} className="group relative">
                      <img
                        src={p.src}
                        alt={p.alt}
                        className="aspect-square w-full rounded-lg object-cover ring-1 ring-white/15"
                      />
                      <button
                        onClick={() =>
                          set("portfolio", room.portfolio.filter((x) => x.id !== p.id))
                        }
                        className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white group-hover:flex"
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </section>

          {/* ── Lumenati-only room dressing (the Y2K theme has a media player window,
              wall stickers and taped posters; other themes have none). ── */}
          {isY2k && (
            <>
              <section>
                <SectionTitle>Page video</SectionTitle>
                <Card>
                  <div className="space-y-3 p-4">
                    <p className="text-xs text-white/55">
                      {room.videoUrl
                        ? "Your clip plays in your page's media player window."
                        : "Drop a clip into your page's media player window (mp4 or mov, under 60MB)."}
                    </p>
                    {room.videoUrl && (
                      <>
                        <video src={room.videoUrl} controls preload="metadata" className="max-h-56 w-full rounded-lg bg-black" />
                        <Field label="Video title">
                          <input className="inp" value={room.videoTitle ?? ""} onChange={(e) => set("videoTitle", e.target.value)} placeholder="my shop tour" />
                        </Field>
                      </>
                    )}
                    <div className="flex items-center gap-2">
                      <UploadButton
                        artistId={artistId}
                        accept="video/mp4,video/quicktime,.mp4,.mov"
                        maxBytes={60 * 1024 * 1024}
                        onPick={(src) => set("videoUrl", src)}
                      >
                        {room.videoUrl ? "Replace video" : "Add a video"}
                      </UploadButton>
                      {room.videoUrl && (
                        <button
                          onClick={() => {
                            set("videoUrl", null);
                            set("videoTitle", null);
                          }}
                          className="rounded-lg border border-rose-400/30 px-3 py-1.5 text-sm font-medium text-rose-400 hover:bg-rose-400/10"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </section>

              <section>
                <SectionTitle>Stickers</SectionTitle>
                <Card>
                  <div className="p-4">
                    <p className="text-xs text-white/55">
                      Slap up to seven on your walls, click to toggle.{room.stickers === null ? " Using the classic set until you pick." : ""}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STICKERS.map((st) => {
                        const on = (room.stickers ?? []).includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              const cur = room.stickers ?? [];
                              set("stickers", on ? cur.filter((x) => x !== st.id) : [...cur, st.id].slice(0, 7));
                            }}
                            className={`rounded-xl border-2 p-2 ${on ? "border-white/60 bg-white/10" : "border-white/12 hover:border-white/30"}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={st.src} alt={st.id} className="h-12 w-12 object-contain" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </section>

              <section>
                <SectionTitle
                  action={
                    <UploadButton
                      small
                      artistId={artistId}
                      disabled={(room.posters ?? []).length >= 4}
                      onPick={(src) => set("posters", [...(room.posters ?? []), { id: newId("wp"), src }].slice(0, 4))}
                    >
                      + Add poster
                    </UploadButton>
                  }
                >
                  Wall posters
                </SectionTitle>
                <Card>
                  <div className="p-4">
                    <p className="mb-3 text-xs text-white/55">
                      Up to four, taped to your walls in the designed spots.{room.posters === null ? " Using the classic set until you add your own." : ""}
                    </p>
                    {(room.posters ?? []).length === 0 && <Empty>No posters yet.</Empty>}
                    <div className="space-y-3">
                      {(room.posters ?? []).map((pp) => (
                        <Row key={pp.id} src={pp.src} onRemove={() => set("posters", (room.posters ?? []).filter((x) => x.id !== pp.id))}>
                          <span className="text-xs text-white/45">Poster</span>
                        </Row>
                      ))}
                    </div>
                  </div>
                </Card>
              </section>
            </>
          )}

          <section>
            <SectionTitle>Flash wall</SectionTitle>
            <FlashWallEditor artistId={artistId} />
          </section>

        </div>

        {/* ── Live preview: the REAL public page, per the shop's actual skin ── */}
        <div className="lg:sticky lg:top-7 lg:self-start">
          <SectionTitle>Live preview</SectionTitle>
          <Card className="overflow-hidden p-0">
            <iframe
              key={`${artistId}-${previewTick}`}
              src={`/${artist.slug}`}
              title="Live page preview"
              className="h-[760px] w-full border-0 bg-black"
              onLoad={(e) => {
                // Preview is look-only: the framed page is the real site, so
                // swallow link clicks and form submits or the frame becomes a
                // browser for the whole site. Scroll and animations stay live.
                const doc = e.currentTarget.contentDocument;
                if (!doc) return;
                doc.addEventListener(
                  "click",
                  (ev) => {
                    const a = (ev.target as Element | null)?.closest?.("a");
                    if (a) {
                      ev.preventDefault();
                      ev.stopPropagation();
                    }
                  },
                  true,
                );
                doc.addEventListener(
                  "submit",
                  (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                  },
                  true,
                );
              }}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

// Open/close an artist's books. Closed books flip their public page's Book CTA
// to the waitlist. Reads the current state on mount and writes through the
// shared /api/artist/books endpoint (owner may toggle any chair in their shop).
function BooksToggle({ artistId }: { artistId: string }) {
  const [closed, setClosed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setClosed(null);
    createClient()
      .from("artists")
      .select("books_closed")
      .eq("id", artistId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setClosed(!!(data as { books_closed?: boolean } | null)?.books_closed);
      });
    return () => {
      alive = false;
    };
  }, [artistId]);

  const toggle = async () => {
    if (closed === null || busy) return;
    const next = !closed;
    setBusy(true);
    try {
      const r = await fetch("/api/artist/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closed: next, artistId }),
      });
      if (r.ok) setClosed(next);
    } finally {
      setBusy(false);
    }
  };

  const open = closed === false;
  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <div className="text-sm font-medium">
          {closed === null ? "Books" : open ? "Books are open" : "Books are closed"}
        </div>
        <div className="text-xs text-white/60">
          {open
            ? "New requests book straight in."
            : "New requests go to the waitlist instead of booking."}
        </div>
      </div>
      <button
        onClick={toggle}
        disabled={closed === null || busy}
        className={`relative h-7 w-12 rounded-full transition-colors ${
          open ? "bg-brand" : "bg-white/15"
        } ${closed === null || busy ? "opacity-50" : ""}`}
        aria-label="Toggle books open or closed"
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${
            open ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-white/65">{label}</span>
      {children}
    </label>
  );
}

function Row({
  src,
  children,
  onRemove,
}: {
  src: string;
  children: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <img src={src} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-white/15" />
      <div className="flex-1">{children}</div>
      <button
        onClick={onRemove}
        className="rounded-lg border border-white/12 px-2 py-1 text-xs text-white/65 hover:bg-white/6"
      >
        Remove
      </button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-3 text-center text-sm text-white/55">{children}</div>;
}

function UploadButton({
  artistId,
  onPick,
  children,
  small,
  accept = "image/*",
  maxBytes,
  disabled,
}: {
  artistId: string;
  onPick: (src: string) => void;
  children: React.ReactNode;
  small?: boolean;
  /** Same bucket for everything; the room video just needs a different picker. */
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (maxBytes && file.size > maxBytes) {
      alert(`That file is over ${Math.round(maxBytes / 1024 / 1024)}MB. Trim it down and try again.`);
      return;
    }
    setBusy(true);
    try {
      // Supabase Storage when configured, else a local data-URL preview.
      const src = await uploadPhoto(artistId, file);
      onPick(src);
    } catch {
      alert("Upload failed. Try again, or a smaller image.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <label
      className={`inline-flex cursor-pointer items-center rounded-lg font-medium ${
        busy || disabled ? "pointer-events-none opacity-50" : ""
      } ${
        small
          ? "bg-brand px-2.5 py-1 text-xs text-white hover:opacity-90"
          : "border border-white/12 px-3 py-1.5 text-sm text-white/85 hover:bg-white/6"
      }`}
    >
      {busy ? "Uploading…" : children}
      <input type="file" accept={accept} onChange={onChange} className="hidden" disabled={busy || disabled} />
    </label>
  );
}

// Mirrors STICKER_CATALOG in lib/admin/render-room.ts and the app — keep ids in sync.
const STICKERS: { id: string; src: string }[] = [
  { id: "bolt", src: "/legacy-assets/sqsp-013.png" },
  { id: "8ball", src: "/legacy-assets/sqsp-002.png" },
  { id: "skateboard", src: "/legacy-assets/sqsp-015.png" },
  { id: "rainbow", src: "/legacy-assets/sqsp-022.png" },
  { id: "smilie", src: "/legacy-assets/sqsp-014.png" },
  { id: "tongue", src: "/legacy-assets/sqsp-020.png" },
  { id: "stars", src: "/legacy-assets/sqsp-030.png" },
];

// Flash wall pieces live in their own table and go live the moment they're
// pinned (same as the app). Price + claimed toggle write straight through.
type Flash = { id: string; src: string; title: string | null; price_cents: number; status: string };
function FlashWallEditor({ artistId }: { artistId: string }) {
  const [flash, setFlash] = useState<Flash[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const sb = createClient();
  const load = async () => {
    const { data } = await sb
      .from("flash_pieces")
      .select("id, src, title, price_cents, status")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false });
    setFlash((data ?? []) as Flash[]);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);
  const add = async (src: string) => {
    const { error } = await sb.from("flash_pieces").insert({ artist_id: artistId, src });
    setMsg(error ? `Could not pin it: ${error.message}` : "Pinned. Set a price below.");
    load();
  };
  const patch = async (id: string, p: Partial<Flash>) => {
    setFlash((cur) => cur.map((f) => (f.id === id ? { ...f, ...p } : f)));
    await sb.from("flash_pieces").update(p).eq("id", id);
  };
  const remove = async (id: string) => {
    setFlash((cur) => cur.filter((f) => f.id !== id));
    await sb.from("flash_pieces").delete().eq("id", id);
  };
  return (
    <Card className="ring-1 ring-brand/30">
      <div className="p-4">
        <p className="text-sm font-semibold">Live the second you pin it, no save needed.</p>
        <p className="mt-1 text-xs text-white/55">Your flash on your page and the shop&apos;s wall. Mark a piece claimed the moment someone grabs it.</p>
        <div className="mt-3 space-y-3">
          {flash.length === 0 && <Empty>Nothing pinned yet.</Empty>}
          {flash.map((f) => (
            <div key={f.id} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.src} alt="" className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/15" />
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-sm text-white/65">
                  $
                  <input
                    className="inp w-24"
                    inputMode="decimal"
                    value={f.price_cents > 0 ? String(f.price_cents / 100) : ""}
                    onChange={(e) => patch(f.id, { price_cents: Math.max(0, Math.round((Number(e.target.value) || 0) * 100)) })}
                    placeholder="price"
                  />
                </label>
                <button
                  onClick={() => patch(f.id, { status: f.status === "claimed" ? "available" : "claimed" })}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${f.status === "claimed" ? "border-amber-400/40 text-amber-300" : "border-white/12 text-white/75 hover:bg-white/6"}`}
                >
                  {f.status === "claimed" ? "Claimed · tap to relist" : "Available · tap when claimed"}
                </button>
                <button onClick={() => remove(f.id)} className="rounded-lg border border-rose-400/30 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-400/10">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <UploadButton artistId={artistId} onPick={add}>
            Pin new flash
          </UploadButton>
          {msg && <span className="ml-3 text-xs text-white/60">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

