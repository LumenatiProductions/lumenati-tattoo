"use client";

import { useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { useSales } from "@/lib/admin/sales-context";
import { useRole } from "@/lib/admin/role-context";
import { COLOR_PRESETS } from "@/lib/admin/room-content";
import { createClient } from "@/lib/supabase/browser";
import { statementFor, fmt, payTypeLabel } from "@/lib/admin/calc";
import { Card, SectionTitle, Badge, Dot } from "@/components/admin/ui";
import type { Artist, PayType } from "@/lib/admin/types";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Draft = {
  name: string;
  handle: string;
  color: string;
  pay_type: PayType;
  rentDollars: string;
  splitPct: string;
  guest: boolean;
};
const blankDraft = (): Draft => ({
  name: "",
  handle: "",
  color: COLOR_PRESETS[0],
  pay_type: "split",
  rentDollars: "",
  splitPct: "",
  guest: false,
});

export default function ArtistsPage() {
  const { artists, refresh } = useArtists();
  const { sales } = useSales();
  const { realRole } = useRole();
  const isOwner = realRole === "owner";
  const sb = createClient();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(blankDraft());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const draftToRow = (d: Draft) => ({
    name: d.name.trim(),
    handle: d.handle.trim().replace(/^@/, ""),
    color: d.color,
    pay_type: d.pay_type,
    rent_cents: d.pay_type === "split" ? 0 : Math.round((parseFloat(d.rentDollars) || 0) * 100),
    split_pct: d.pay_type === "rent" ? 0 : (parseFloat(d.splitPct) || 0) / 100,
    guest: d.guest,
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!draft.name.trim()) return;
    setBusy(true);
    const id = slugify(draft.name);
    const row = draftToRow(draft);
    const sort = artists.length + 1;
    const { error } = await sb.from("artists").insert({ id, slug: id, active: true, room_extras: false, sort, ...row });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    // Give them a room so they show on the site + work in My Room.
    await sb.from("room_content").insert({
      artist_id: id,
      tagline: "",
      bio: "",
      ig_handle: row.handle,
      song_id: "offspring",
      accent_color: row.color,
      profile_photo: "",
      polaroids: [],
      portfolio: [],
    });
    setDraft(blankDraft());
    setAdding(false);
    setBusy(false);
    await refresh();
  };

  const startEdit = (a: Artist) => {
    setEditId(a.id);
    setEdit({
      name: a.name,
      handle: a.handle,
      color: a.color,
      pay_type: a.pay.type,
      rentDollars: a.pay.rentCents ? String(a.pay.rentCents / 100) : "",
      splitPct: a.pay.shopSplitPct ? String(Math.round(a.pay.shopSplitPct * 100)) : "",
      guest: !!a.guest,
    });
  };

  const saveEdit = async () => {
    if (!editId) return;
    setBusy(true);
    const { error } = await sb.from("artists").update(draftToRow(edit)).eq("id", editId);
    setMsg(error ? error.message : "Saved.");
    if (!error) setEditId(null);
    setBusy(false);
    await refresh();
  };

  const remove = async (a: Artist) => {
    if (!confirm(`Remove ${a.name}? This deletes their room too.`)) return;
    setBusy(true);
    const { error } = await sb.from("artists").delete().eq("id", a.id);
    if (error) {
      setMsg(error.message);
    } else {
      await sb.from("room_content").delete().eq("artist_id", a.id);
      setMsg(`${a.name} removed.`);
    }
    setBusy(false);
    await refresh();
  };

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Artists &amp; Pay</h1>
          <p className="text-sm text-black/50">
            Your roster and how each one pays the shop. Adding an artist gives them a room + public page.
          </p>
        </div>
        {isOwner && (
          <button
            onClick={() => { setAdding((v) => !v); setMsg(null); }}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            {adding ? "Cancel" : "+ Add artist"}
          </button>
        )}
      </div>

      {msg && !adding && (
        <div className="mb-4 rounded-lg border border-black/8 bg-white px-3 py-2 text-xs text-black/60 shadow-sm">
          {msg}
        </div>
      )}

      {adding && isOwner && (
        <Card className="mb-5">
          <form onSubmit={add} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
            <Field label="Name"><input className="inp" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Travis Page" required /></Field>
            <Field label="Instagram handle"><input className="inp" value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value })} placeholder="travis.tattoo" /></Field>
            <PayFields d={draft} set={setDraft} />
            <div className="flex items-center gap-2 sm:col-span-2">
              <PalettePicker value={draft.color} onChange={(c) => setDraft({ ...draft, color: c })} />
              <label className="ml-2 flex items-center gap-1.5 text-sm text-black/60">
                <input type="checkbox" checked={draft.guest} onChange={(e) => setDraft({ ...draft, guest: e.target.checked })} /> Guest artist
              </label>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "Adding…" : "Add to roster"}
              </button>
              {msg && <span className="ml-3 text-xs text-rose-600">{msg}</span>}
            </div>
          </form>
        </Card>
      )}

      <SectionTitle>The crew ({artists.length})</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {artists.map((a) => {
          const st = statementFor(a, sales, []);
          const editing = editId === a.id;
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: a.color }}>
                    {a.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 font-semibold">{a.name}{a.guest && <Badge>guest</Badge>}</div>
                    <div className="text-xs text-black/45">@{a.handle}</div>
                  </div>
                </div>
                <Badge tone="brand">{payTypeLabel(a)}</Badge>
              </div>

              {editing ? (
                <div className="grid grid-cols-1 gap-3 border-t border-black/6 p-4 sm:grid-cols-2">
                  <PayFields d={edit} set={setEdit} />
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId(null)} className="rounded-lg border border-black/10 px-3 py-1.5 text-sm text-black/60 hover:bg-black/4">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 border-t border-black/6 text-center">
                    <Stat label="Tickets" value={String(st.saleCount)} />
                    <Stat label="Service" value={fmt(st.grossService)} />
                    <Stat label="Shop cut" value={fmt(st.shopCut + st.rentOwed)} />
                  </div>
                  {isOwner && (
                    <div className="flex items-center gap-2 border-t border-black/6 px-4 py-2.5">
                      <button onClick={() => startEdit(a)} className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-black/60 hover:bg-black/4">Edit pay</button>
                      <a href={`/${a.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-black/60 hover:bg-black/4">View room ↗</a>
                      <button onClick={() => remove(a)} className="ml-auto rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50">Remove</button>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
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

function PayFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  return (
    <>
      <Field label="Pays the shop by">
        <select className="inp" value={d.pay_type} onChange={(e) => set({ ...d, pay_type: e.target.value as PayType })}>
          <option value="split">% split</option>
          <option value="rent">Booth rent</option>
          <option value="hybrid">Hybrid (rent + %)</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {d.pay_type !== "split" && (
          <Field label="Rent ($/mo)"><input className="inp" type="number" value={d.rentDollars} onChange={(e) => set({ ...d, rentDollars: e.target.value })} placeholder="1000" /></Field>
        )}
        {d.pay_type !== "rent" && (
          <Field label="Shop split (%)"><input className="inp" type="number" value={d.splitPct} onChange={(e) => set({ ...d, splitPct: e.target.value })} placeholder="30" /></Field>
        )}
      </div>
    </>
  );
}

function PalettePicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className={`h-6 w-6 rounded-full ${value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-black/40 ring-offset-1" : "ring-1 ring-black/10"}`} style={{ backgroundColor: c }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="ml-1 h-6 w-8 cursor-pointer rounded border border-black/10 bg-white p-0.5" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <div className="tnum text-sm font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-black/40">{label}</div>
    </div>
  );
}
