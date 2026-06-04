"use client";

import { useState, type ChangeEvent } from "react";
import { useRole } from "@/lib/admin/role-context";
import {
  useRoomContent,
  SONGS,
  COLOR_PRESETS,
  songLabel,
} from "@/lib/admin/room-content";
import { ARTISTS } from "@/lib/admin/mock-data";
import type { RoomContent, Polaroid, PortfolioItem } from "@/lib/admin/types";
import { Card, SectionTitle } from "@/components/admin/ui";

// Stable-ish id without Math.random/Date in render paths that could surprise us.
let uid = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${uid++}`;

export default function RoomEditorPage() {
  const { role, asArtistId } = useRole();
  const { get, update } = useRoomContent();

  // Artists edit their own room; owners can pick whose room to edit.
  const [ownerPick, setOwnerPick] = useState<string>(asArtistId || "jd");
  const artistId = role === "artist" ? asArtistId : ownerPick;
  const artist = ARTISTS.find((a) => a.id === artistId)!;
  const room = get(artistId);

  const set = <K extends keyof RoomContent>(key: K, val: RoomContent[K]) =>
    update(artistId, { [key]: val } as Partial<RoomContent>);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Room</h1>
          <p className="text-sm text-black/50">
            Edit what shows in your room. Changes go live right away.
          </p>
        </div>
        {role === "owner" && (
          <select
            value={ownerPick}
            onChange={(e) => setOwnerPick(e.target.value)}
            className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm"
          >
            {ARTISTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}&apos;s room
              </option>
            ))}
          </select>
        )}
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
                  <div className="flex items-center rounded-lg border border-black/10 bg-white">
                    <span className="pl-3 text-black/40">@</span>
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
            <SectionTitle>Vibe</SectionTitle>
            <Card>
              <div className="space-y-4 p-4">
                <Field label="Now-playing song">
                  <select
                    className="inp"
                    value={room.songId}
                    onChange={(e) => set("songId", e.target.value)}
                  >
                    {SONGS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Accent color">
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() => set("accentColor", c)}
                        className={`h-7 w-7 rounded-full ring-offset-2 ${
                          room.accentColor.toLowerCase() === c.toLowerCase()
                            ? "ring-2 ring-black/40"
                            : "ring-1 ring-black/10"
                        }`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <label className="ml-1 flex items-center gap-1.5 text-xs text-black/50">
                      custom
                      <input
                        type="color"
                        value={room.accentColor}
                        onChange={(e) => set("accentColor", e.target.value)}
                        className="h-7 w-9 cursor-pointer rounded border border-black/10 bg-white p-0.5"
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
                  className="h-20 w-20 rounded-lg object-cover ring-1 ring-black/10"
                />
                <UploadButton onPick={(src) => set("profilePhoto", src)}>
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
                        className="aspect-square w-full rounded-lg object-cover ring-1 ring-black/10"
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

          <p className="text-xs text-black/40">
            Photo uploads preview locally for now; real hosting + saving to your
            account lands with Supabase Storage.
          </p>
        </div>

        {/* ── Live preview ── */}
        <div className="lg:sticky lg:top-7 lg:self-start">
          <SectionTitle>Live preview</SectionTitle>
          <RoomPreview room={room} name={artist.name} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-black/50">{label}</span>
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
      <img src={src} alt="" className="h-12 w-12 rounded object-cover ring-1 ring-black/10" />
      <div className="flex-1">{children}</div>
      <button
        onClick={onRemove}
        className="rounded-lg border border-black/10 px-2 py-1 text-xs text-black/50 hover:bg-black/4"
      >
        Remove
      </button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-3 text-center text-sm text-black/40">{children}</div>;
}

function UploadButton({
  onPick,
  children,
  small,
}: {
  onPick: (src: string) => void;
  children: React.ReactNode;
  small?: boolean;
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onPick(String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };
  return (
    <label
      className={`inline-flex cursor-pointer items-center rounded-lg font-medium ${
        small
          ? "bg-brand px-2.5 py-1 text-xs text-white hover:opacity-90"
          : "border border-black/10 px-3 py-1.5 text-sm text-black/70 hover:bg-black/4"
      }`}
    >
      {children}
      <input type="file" accept="image/*" onChange={onChange} className="hidden" />
    </label>
  );
}

// A compact Y2K-styled mirror of how the room reads with the current content.
function RoomPreview({ room, name }: { room: RoomContent; name: string }) {
  const c = room.accentColor;
  return (
    <div
      className="overflow-hidden rounded-xl ring-1 ring-black/10"
      style={{ background: `linear-gradient(135deg, ${c} 0%, #1a1320 85%)` }}
    >
      <div className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <img
            src={room.profilePhoto}
            alt=""
            className="h-14 w-14 rounded-lg object-cover ring-2 ring-white/70"
          />
          <div className="text-white">
            <div className="text-lg font-black leading-tight drop-shadow">{name}</div>
            <div className="text-[11px] opacity-90">
              @{room.igHandle} // {room.tagline}
            </div>
          </div>
        </div>

        {/* buddy info window */}
        <div className="rounded border border-black/30 bg-[#c8c8c8] shadow">
          <div
            className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-white"
            style={{ backgroundColor: "#1a4ea8" }}
          >
            <span>{room.igHandle} — Buddy Info</span>
            <span className="opacity-80">_ □ ×</span>
          </div>
          <div className="px-3 py-2 font-mono text-[11px] leading-snug text-black/80">
            {room.bio || <span className="text-black/40">no bio yet…</span>}
          </div>
        </div>

        {/* polaroids */}
        {room.polaroids.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {room.polaroids.map((p: Polaroid) => (
              <div key={p.id} className="rotate-[-2deg] bg-white p-1 pb-3 shadow">
                <img src={p.src} alt="" className="h-14 w-14 object-cover" />
                <div className="mt-0.5 text-center font-mono text-[9px] text-black/70">
                  {p.caption}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* portfolio window */}
        <div className="mt-3 rounded border border-black/30 bg-[#c8c8c8] shadow">
          <div className="px-2 py-1 text-[11px] font-bold text-white" style={{ backgroundColor: "#1a4ea8" }}>
            C:\{name.split(" ")[0]}\My Pictures
          </div>
          <div className="grid grid-cols-4 gap-1 p-2">
            {room.portfolio.length === 0 && (
              <div className="col-span-4 py-2 text-center font-mono text-[10px] text-black/40">
                add photos to fill the wall
              </div>
            )}
            {room.portfolio.map((p: PortfolioItem) => (
              <img key={p.id} src={p.src} alt={p.alt} className="aspect-square w-full object-cover" />
            ))}
          </div>
        </div>

        {/* now playing */}
        <div className="mt-3 flex items-center gap-2 rounded bg-black/40 px-2 py-1.5 font-mono text-[10px] text-[#7CFC00]">
          <span className="animate-pulse">♪</span>
          NOW PLAYING: {songLabel(room.songId)}
        </div>
      </div>
    </div>
  );
}
