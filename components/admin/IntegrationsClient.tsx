"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Card, SectionTitle, Badge, StatCard, Dot } from "@/components/admin/ui";

type Member = { square_id: string; name: string; artist_id: string | null };
type Artist = { id: string; name: string };

export default function IntegrationsClient({
  configured,
  members,
  lastSyncedAt,
  lastResult,
  salesCount,
  artists,
}: {
  configured: boolean;
  members: Member[];
  lastSyncedAt: string | null;
  lastResult: string | null;
  salesCount: number;
  artists: Artist[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [map, setMap] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.square_id, m.artist_id ?? ""])),
  );
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const setArtist = async (squareId: string, artistId: string) => {
    setMap((m) => ({ ...m, [squareId]: artistId }));
    await supabase
      .from("square_team_members")
      .update({ artist_id: artistId || null })
      .eq("square_id", squareId);
  };

  const sync = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/square/sync", { method: "POST" });
      const data = await res.json();
      if (!data.ok) setMsg(data.error || "Sync failed");
      else {
        setMsg(data.result || "Synced");
        router.refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Integrations</h1>
        <p className="text-sm text-black/50">Connect Square so the dashboard runs on real sales.</p>
      </div>

      <SectionTitle>Square</SectionTitle>
      {!configured ? (
        <Card>
          <div className="p-5">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="warn">Not connected</Badge>
            </div>
            <p className="mb-3 text-sm text-black/60">
              Square is read-only here (we never change anything in your Square account).
              To connect:
            </p>
            <ol className="ml-4 list-decimal space-y-1.5 text-sm text-black/70">
              <li>
                In your Square <span className="font-medium">Developer dashboard</span> →
                your app → <span className="font-medium">Production</span> →{" "}
                <span className="font-medium">Credentials</span>, copy the{" "}
                <span className="font-medium">Production Access Token</span>.
              </li>
              <li>
                Add it as <code className="rounded bg-black/5 px-1">SQUARE_ACCESS_TOKEN</code>{" "}
                in <code className="rounded bg-black/5 px-1">.env.local</code> and in Vercel
                (Project → Settings → Environment Variables), then redeploy.
              </li>
              <li>Refresh this page and click <span className="font-medium">Sync now</span>.</li>
            </ol>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Status" value="Connected" tone="good" />
            <StatCard label="Sales synced" value={String(salesCount)} />
            <StatCard
              label="Team members"
              value={String(members.length)}
              sub={`${members.filter((m) => map[m.square_id]).length} mapped`}
            />
            <StatCard
              label="Last sync"
              value={lastSyncedAt ? new Date(lastSyncedAt).toLocaleDateString() : "never"}
              sub={lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : undefined}
            />
          </div>

          <div className="mb-5 flex items-center gap-3">
            <button
              onClick={sync}
              disabled={syncing}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            {msg && <span className="text-sm text-black/55">{msg}</span>}
            {!msg && lastResult && <span className="text-xs text-black/40">{lastResult}</span>}
          </div>

          <SectionTitle>Map Square team members to artists</SectionTitle>
          <Card>
            {members.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-black/45">
                No team members yet — click <span className="font-medium">Sync now</span> to pull
                them from Square.
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {members.map((m) => {
                  const a = artists.find((x) => x.id === map[m.square_id]);
                  return (
                    <div key={m.square_id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {a && <Dot color="#FF1493" />}
                        <span className="text-sm font-medium">{m.name}</span>
                        {!map[m.square_id] && <Badge tone="warn">unassigned</Badge>}
                      </div>
                      <select
                        value={map[m.square_id] || ""}
                        onChange={(e) => setArtist(m.square_id, e.target.value)}
                        className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm"
                      >
                        <option value="">— not an artist —</option>
                        {artists.map((art) => (
                          <option key={art.id} value={art.id}>
                            {art.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <p className="mt-2 text-xs text-black/40">
            After changing mappings, click <span className="font-medium">Sync now</span> to apply
            them to past sales. Sales with no mapped member show as Unassigned.
          </p>
        </>
      )}
    </div>
  );
}
