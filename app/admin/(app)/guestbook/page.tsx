"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, SectionTitle, Badge } from "@/components/admin/ui";
import { PageHead, Empty } from "@/components/admin/home/shared";

// The Y2K site's guestbook and poll, from the shop's side. Entries wait here
// until someone approves them; the poll section swaps the live question.
// Both tables are service-role only, so everything goes through
// /api/site/*/admin (admin role, cookie session).

type Entry = { id: string; name: string; from_where: string | null; message: string; approved: boolean; created_at: string };
type Poll = { id: string; question: string; options: { key: string; label: string }[]; active: boolean; created_at: string; counts: Record<string, number> };

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function GuestbookPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, p] = await Promise.all([
      fetch("/api/site/guestbook/admin", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/site/poll/admin", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({})),
    ]);
    setEntries((g.entries ?? []) as Entry[]);
    setPolls((p.polls ?? []) as Poll[]);
    if (g.error || p.error) setErr(g.error || p.error);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string, approved: boolean) => {
    await fetch("/api/site/guestbook/admin", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, approved }) });
    load();
  };
  const remove = async (id: string) => {
    await fetch(`/api/site/guestbook/admin?id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
    load();
  };
  const postPoll = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/site/poll/admin", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, options: options.split("\n").map((s) => s.trim()).filter(Boolean) }),
    }).then((x) => x.json());
    setBusy(false);
    if (r.error) setErr(r.error);
    else {
      setQuestion("");
      setOptions("");
      load();
    }
  };

  const pending = (entries ?? []).filter((e) => !e.approved);
  const approved = (entries ?? []).filter((e) => e.approved);
  const live = (polls ?? []).find((p) => p.active) ?? null;
  const total = live ? Object.values(live.counts).reduce((n, c) => n + c, 0) : 0;

  const Row = ({ e }: { e: Entry }) => (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">
          {e.name}
          {e.from_where ? <span className="font-normal text-white/60"> from {e.from_where}</span> : null}
          <span className="ml-2 text-xs font-normal text-white/45">{when(e.created_at)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-white/85">{e.message}</p>
      </div>
      <div className="flex gap-2">
        {e.approved ? (
          <Button size="sm" onClick={() => approve(e.id, false)}>Hide</Button>
        ) : (
          <Button size="sm" variant="money" onClick={() => approve(e.id, true)}>Approve</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>Delete</Button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHead title="Guestbook" sub="What visitors wrote on the site. Nothing shows until you approve it." />
      {err && <p className="mb-4 text-sm text-rose-400">{err}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle action={pending.length ? <Badge tone="warn">{pending.length} waiting</Badge> : null}>Waiting for a read</SectionTitle>
            {entries === null ? <Empty>Loading</Empty> : pending.length ? pending.map((e) => <Row key={e.id} e={e} />) : <Empty>Nothing waiting.</Empty>}
          </Card>
          <Card className="p-5">
            <SectionTitle>On the site</SectionTitle>
            {entries === null ? <Empty>Loading</Empty> : approved.length ? approved.map((e) => <Row key={e.id} e={e} />) : <Empty>Nothing approved yet.</Empty>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle action={live ? <Badge tone="good">live</Badge> : <Badge tone="warn">none live</Badge>}>Poll</SectionTitle>
            {live ? (
              <div>
                <p className="text-sm font-semibold">{live.question}</p>
                <p className="mb-3 text-xs text-white/50">{total} votes</p>
                {live.options.map((o) => {
                  const c = live.counts[o.key] ?? 0;
                  const pct = total ? Math.round((c / total) * 100) : 0;
                  return (
                    <div key={o.key} className="mb-2">
                      <div className="flex justify-between text-xs text-white/75">
                        <span>{o.label}</span>
                        <span>{c} ({pct}%)</span>
                      </div>
                      <div className="h-2 rounded bg-white/8"><div className="h-2 rounded bg-brand" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty>No live poll.</Empty>
            )}
          </Card>
          <Card className="p-5">
            <SectionTitle>New question</SectionTitle>
            <p className="mb-3 text-xs text-white/55">Posting a new one retires the live poll. Its votes stay in the record.</p>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What should we put on the flash wall next?"
              className="mb-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            />
            <textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={"One option per line\nTraditional\nFine line"}
              rows={5}
              className="mb-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            />
            <Button variant="money" onClick={postPoll} disabled={busy}>Post the poll</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
