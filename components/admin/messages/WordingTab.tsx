"use client";

import { TabHeader } from "@/components/admin/tabs";

import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/lib/admin/role-context";
import { useArtists } from "@/lib/admin/artists-context";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { Empty } from "@/components/admin/home/shared";

// The artist's OWN follow-up SMS preferences, ported from the phone app's
// "My Follow-ups" screen. Each visit-tied message (booking confirmation,
// reminders, aftercare/healed check) inherits the shop's version until the
// artist changes the timing or wording, or turns it off for their chair.
// Reads/writes /api/followups/prefs, which resolves code default -> shop ->
// artist. We scope to the current chair (asArtistId) exactly as the app does.

type FieldSet = { subject: string; body: string; lead_days: number; enabled: boolean };
type Overridden = { subject: boolean; body: boolean; lead_days: boolean; enabled: boolean };
type Item = {
  kind: string;
  label: string;
  effective: FieldSet;
  shopDefault: FieldSet;
  overridden: Overridden;
};

const isReminder = (k: string) => k === "reminder_48h" || k === "reminder_24h";

// Human timing. Reminders go out BEFORE the visit; the rest AFTER.
function timing(kind: string, days: number): string {
  if (isReminder(kind)) return days === 0 ? "On the day" : `${days} day${days === 1 ? "" : "s"} before`;
  if (days === 0) return "Right after the appointment";
  return `${days} day${days === 1 ? "" : "s"} after`;
}

export default function MyFollowupsPage() {
  const { asArtistId, canPreview } = useRole();
  const { artists } = useArtists();
  // asArtistId defaults to a shared "jd" for owners, which is not a real chair
  // and left this page blank (lum-011). Resolve to a real roster member; owners
  // pick which chair to manage with the selector in the header.
  const [chair, setChair] = useState<string>("");
  const artistId =
    chair || (artists.some((a) => a.id === asArtistId) ? asArtistId : artists[0]?.id ?? "");

  const [items, setItems] = useState<Item[] | null>(null);
  const [openKind, setOpenKind] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldSet | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null);
    try {
      const res = await fetch(`/api/followups/prefs?artistId=${encodeURIComponent(artistId)}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { items?: Item[]; error?: string };
      // Always set items so it never spins forever; surface the error if any.
      setItems(res.ok ? data.items ?? [] : []);
      if (!res.ok) setMsg(data.error ?? "Could not load follow-ups.");
    } catch {
      setItems([]);
      setMsg("Could not load follow-ups.");
    }
  }, [artistId]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditor = (it: Item) => {
    setMsg(null);
    setOpenKind(it.kind);
    setDraft({ ...it.effective });
  };

  const closeEditor = () => {
    setOpenKind(null);
    setDraft(null);
  };

  const save = async () => {
    if (!openKind || !draft) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/followups/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artistId,
        kind: openKind,
        subject: draft.subject,
        body: draft.body,
        lead_days: draft.lead_days,
        enabled: draft.enabled,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Could not save.");
      return;
    }
    closeEditor();
    await load();
    setMsg("Saved. It's live.");
  };

  const useShopDefault = async (kind: string) => {
    setBusy(true);
    setMsg(null);
    // Clearing = an empty override, which the API deletes so it inherits the
    // shop's version again.
    const res = await fetch("/api/followups/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistId, kind }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? "Could not reset.");
      return;
    }
    closeEditor();
    await load();
    setMsg("Back to the shop's version.");
  };

  return (
    <div>
      <TabHeader
        title="My follow-ups"
        sub="The texts your clients get around a visit. Change the timing or wording, or leave the shop's version. Turn any of them off for your chair."
        action={
          canPreview && artists.length > 1 ? (
            <select
              value={artistId}
              onChange={(e) => setChair(e.target.value)}
              className="rounded-lg border border-white/12 bg-white/6 px-3 py-1.5 text-sm"
              aria-label="Pick a chair"
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}&apos;s chair
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {msg && <div className="mb-4 text-sm text-white/70">{msg}</div>}

      {items === null ? (
        <Card>
          <div className="px-4 py-6 text-center text-sm text-white/55">Loading your follow-ups...</div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Empty>Nothing to manage here yet.</Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {items.map((it) => {
            const anyOverride = Object.values(it.overridden).some(Boolean);
            const editing = openKind === it.kind && draft;
            return (
              <div key={it.kind}>
                <SectionTitle>{it.label}</SectionTitle>
                <Card>
                  {editing ? (
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Send this follow-up</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={draft.enabled}
                          onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                            draft.enabled ? "bg-brand" : "bg-white/15"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                              draft.enabled ? "left-[22px]" : "left-0.5"
                            }`}
                          />
                        </button>
                      </div>

                      {draft.enabled && (
                        <>
                          <div className="mt-5 mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
                            Timing
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({ ...draft, lead_days: Math.max(0, draft.lead_days - 1) })
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/12 bg-white/6 text-xl font-bold hover:bg-white/10"
                              aria-label="Fewer days"
                            >
                              -
                            </button>
                            <div className="flex-1 text-center text-sm font-semibold">
                              {timing(it.kind, draft.lead_days)}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({ ...draft, lead_days: Math.min(120, draft.lead_days + 1) })
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/12 bg-white/6 text-xl font-bold hover:bg-white/10"
                              aria-label="More days"
                            >
                              +
                            </button>
                          </div>

                          <div className="mt-5 mb-2 text-xs font-bold uppercase tracking-wide text-white/60">
                            Message
                          </div>
                          <textarea
                            value={draft.body}
                            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                            rows={5}
                            className="inp"
                            placeholder="What your client reads"
                          />
                          <div className="mt-2 text-xs text-white/50">
                            {"{{first_name}}"} and {"{{shop_name}}"} fill in automatically.
                          </div>
                        </>
                      )}

                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={save}
                          disabled={busy}
                          className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {busy ? "Saving..." : "Save my version"}
                        </button>
                        <button
                          onClick={closeEditor}
                          disabled={busy}
                          className="rounded-lg border border-white/12 bg-white/6 px-5 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        {anyOverride && (
                          <button
                            onClick={() => useShopDefault(it.kind)}
                            disabled={busy}
                            className="ml-auto text-sm text-white/60 underline hover:text-white/80 disabled:opacity-50"
                          >
                            Use the shop's version instead
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openEditor(it)}
                      className="block w-full p-4 text-left hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className={`text-[15px] font-bold ${
                            it.effective.enabled ? "text-ink" : "text-white/40"
                          }`}
                        >
                          {it.effective.enabled
                            ? timing(it.kind, it.effective.lead_days)
                            : "Off for your chair"}
                        </span>
                        <Badge tone={anyOverride ? "brand" : "neutral"}>
                          {anyOverride ? "Your version" : "Shop default"}
                        </Badge>
                      </div>
                      {it.effective.enabled && (
                        <p className="mt-1.5 line-clamp-2 text-sm text-white/65">{it.effective.body}</p>
                      )}
                      <div className="mt-2.5 text-xs text-white/45">Click to change</div>
                    </button>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
