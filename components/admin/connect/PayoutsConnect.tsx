"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";

type ConnectArtist = { id: string; name: string; hasAccount: boolean; onboarded: boolean };

// Owner-only: set each artist up as a Stripe Connect account so their card
// tickets auto-split. Lives at the top of Payouts (POS-STARTER-5). Until Stripe
// keys are set it shows a configure note; the rest of Payouts still works.
export default function PayoutsConnect() {
  const [artists, setArtists] = useState<ConnectArtist[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/connect");
      const d = await r.json();
      if (r.ok) {
        setArtists(d.artists || []);
        setConfigured(!!d.configured);
        setError(null);
      } else {
        setError(r.status === 403 ? null : d.error || "Could not load payout setup.");
      }
    } catch {
      setError("Could not load payout setup.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async (artistId: string) => {
      setBusyId(artistId);
      // Surface failures AFTER the reload — load() clears the error on success.
      let failed: string | null = null;
      try {
        const r = await fetch("/api/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artistId, action: "refresh" }),
        });
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          failed = d.error || "Could not check onboarding status — try again.";
        }
      } catch {
        failed = "Could not check onboarding status — try again.";
      }
      setBusyId(null);
      await load();
      if (failed) setError(failed);
    },
    [load],
  );

  // On return from Stripe onboarding (?connect=return&artist=ID) re-check status.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const artist = p.get("artist");
    if (p.get("connect") === "return" && artist) refresh(artist);
    load();
  }, [load, refresh]);

  const onboard = async (artistId: string) => {
    setBusyId(artistId);
    setError(null);
    const r = await fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistId, action: "onboard" }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) {
      window.location.href = d.url; // hosted Stripe onboarding
      return;
    }
    setBusyId(null);
    setError(d.error || "Could not start onboarding.");
  };

  if (loading) return null;

  return (
    <div className="mb-6">
      <SectionTitle>Artist payouts · Stripe Connect</SectionTitle>
      <Card>
        <div className="border-b border-black/5 px-4 py-3 text-xs text-black/50">
          {configured
            ? "Onboarded artists are paid automatically: each card ticket splits the shop's cut off as a fee and sends the rest to the artist's bank. Stripe files their 1099."
            : "Add Stripe keys to enable automatic artist payouts. Until then, settle manually below."}
        </div>
        {error && <div className="px-4 py-2 text-sm text-rose-600">{error}</div>}
        <div className="divide-y divide-black/5">
          {artists.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-medium">{a.name}</span>
                {a.onboarded ? (
                  <Badge tone="good">Auto-payouts on</Badge>
                ) : a.hasAccount ? (
                  <Badge tone="warn">Onboarding incomplete</Badge>
                ) : (
                  <Badge tone="neutral">Not set up</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {a.onboarded ? (
                  <button
                    onClick={() => refresh(a.id)}
                    disabled={busyId === a.id}
                    className="text-xs text-black/40 hover:text-black/70 disabled:opacity-40"
                  >
                    Refresh
                  </button>
                ) : (
                  <>
                    {a.hasAccount && (
                      <button
                        onClick={() => refresh(a.id)}
                        disabled={busyId === a.id}
                        className="text-xs text-black/40 hover:text-black/70 disabled:opacity-40"
                      >
                        Check
                      </button>
                    )}
                    <button
                      onClick={() => onboard(a.id)}
                      disabled={!configured || busyId === a.id}
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {busyId === a.id ? "…" : a.hasAccount ? "Finish setup" : "Set up payouts"}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {artists.length === 0 && (
            <div className="px-4 py-5 text-center text-sm text-black/40">No active artists.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
