"use client";

import { useCallback, useEffect, useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";

// Healed-photo approval queue (Social page). Clients upload via the 14-day
// follow-up link; staff approve (lands in the artist's room portfolio on the
// public site) or dismiss. Hidden until something is pending.

type HealedPhoto = {
  id: string;
  artist_id: string | null;
  client_id: string | null;
  url: string;
  status: string;
  created_at: string;
};

export default function HealedQueue() {
  const { artists } = useArtists();
  const [photos, setPhotos] = useState<HealedPhoto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/healed");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setPhotos(d.photos || []);
    } catch {
      /* queue stays hidden */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "dismiss") => {
    setBusyId(id);
    setMsg(null);
    try {
      const r = await fetch("/api/healed", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(d.error || "Could not update that photo.");
        return;
      }
      setMsg(action === "approve" ? "Added to the artist's room portfolio." : "Dismissed.");
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (photos.length === 0) return null;

  return (
    <div className="mb-6">
      <SectionTitle>
        Healed photos <span className="font-normal text-black/35">· from clients, awaiting approval</span>
      </SectionTitle>
      {msg && (
        <div className="mb-3 rounded-lg border border-black/8 bg-white px-3 py-2 text-xs text-black/60 shadow-sm">{msg}</div>
      )}
      <Card>
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => {
            const artist = artists.find((a) => a.id === p.artist_id);
            return (
              <div key={p.id} className="overflow-hidden rounded-lg border border-black/8">
                <a href={p.url} target="_blank" rel="noreferrer" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="Healed tattoo from a client" className="h-40 w-full object-cover hover:opacity-90" loading="lazy" />
                </a>
                <div className="flex items-center justify-between gap-1 px-2 py-2">
                  <Badge tone="brand">{artist?.name ?? "Unassigned"}</Badge>
                  <div className="flex gap-1">
                    <button
                      onClick={() => act(p.id, "approve")}
                      disabled={busyId === p.id || !p.artist_id}
                      title={p.artist_id ? "Add to the artist's room portfolio" : "No artist linked — dismiss or fix the booking"}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => act(p.id, "dismiss")}
                      disabled={busyId === p.id}
                      className="rounded-md border border-black/10 px-2 py-1 text-[11px] font-medium text-black/55 hover:bg-black/4 disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
