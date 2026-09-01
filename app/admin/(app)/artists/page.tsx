"use client";

import { useCallback, useEffect, useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { useSales } from "@/lib/admin/sales-context";
import { useRole } from "@/lib/admin/role-context";
import { COLOR_PRESETS } from "@/lib/admin/room-content";
import { createClient } from "@/lib/supabase/browser";
import { statementFor, fmt, payTypeLabel } from "@/lib/admin/calc";
import { Card, PageHeader, SectionTitle, Badge, Dot } from "@/components/admin/ui";
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
  giveLogin: boolean;
  loginEmail: string;
  loginPhone: string;
};
const blankDraft = (): Draft => ({
  name: "",
  handle: "",
  color: COLOR_PRESETS[0],
  pay_type: "payroll_split",
  rentDollars: "",
  splitPct: "",
  guest: false,
  giveLogin: false,
  loginEmail: "",
  loginPhone: "",
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
  // Who can sign in: one line per card, so adding an artist and giving them
  // the app is one stop (Scott, 2026-09-01: Artists & Pay + Team was two).
  const [logins, setLogins] = useState<Record<string, { email: string | null; phone: string | null }>>({});
  const loadLogins = useCallback(async () => {
    const { data } = await sb.from("profiles").select("artist_id, email, phone").not("artist_id", "is", null);
    const next: Record<string, { email: string | null; phone: string | null }> = {};
    for (const p of (data ?? []) as { artist_id: string; email: string | null; phone: string | null }[]) {
      next[p.artist_id] = { email: p.email, phone: p.phone };
    }
    setLogins(next);
  }, [sb]);
  useEffect(() => {
    if (isOwner) loadLogins();
  }, [isOwner, loadLogins]);

  const draftToRow = (d: Draft) => ({
    name: d.name.trim(),
    handle: d.handle.trim().replace(/^@/, ""),
    color: d.color,
    pay_type: d.pay_type,
    rent_cents:
      d.pay_type === "booth_rent" ? Math.round((parseFloat(d.rentDollars) || 0) * 100) : 0,
    split_pct: d.pay_type === "payroll_split" ? (parseFloat(d.splitPct) || 0) / 100 : 0,
    guest: d.guest,
  });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!draft.name.trim()) return;
    if (draft.giveLogin && !draft.loginEmail.trim()) {
      setMsg("An email is needed to give them a login, or uncheck it.");
      return;
    }
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
    // Same act, one stop: if asked, create their app login tied to this chair.
    // The page already exists, so a login hiccup is reported, never a blocker.
    let loginNote = "";
    if (draft.giveLogin && draft.loginEmail.trim()) {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: draft.loginEmail.trim(),
          phone: draft.loginPhone.trim() || undefined,
          name: draft.name.trim(),
          role: "artist",
          artistId: id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        loginNote = ` (added to the roster, but the login didn't set: ${j.error ?? "try Staff"})`;
      } else {
        loginNote = " Their app login is set.";
      }
    }
    setDraft(blankDraft());
    setAdding(false);
    setBusy(false);
    setMsg(`${row.name} added.${loginNote}`);
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
      giveLogin: false,
      loginEmail: "",
      loginPhone: "",
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
    if (!confirm(`Remove ${a.name}? This deletes their page too.`)) return;
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
      <PageHeader
        title="Artists & Pay"
        subtitle="Your roster and how each one is paid. Adding an artist gives them their own public page."
        action={
          isOwner ? (
            <button
              onClick={() => { setAdding((v) => !v); setMsg(null); }}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {adding ? "Cancel" : "+ Add artist"}
            </button>
          ) : undefined
        }
      />

      {msg && !adding && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/75 shadow-sm">
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
              <label className="ml-2 flex items-center gap-1.5 text-sm text-white/75">
                <input type="checkbox" checked={draft.guest} onChange={(e) => setDraft({ ...draft, guest: e.target.checked })} /> Guest artist
              </label>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/4 p-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-medium text-white/85">
                <input type="checkbox" checked={draft.giveLogin} onChange={(e) => setDraft({ ...draft, giveLogin: e.target.checked })} />
                Give them an app login now
              </label>
              <p className="mt-1 text-xs text-white/55">
                Sign in with a text code to their phone. Skip it for a guest who just needs a page.
              </p>
              {draft.giveLogin && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Email"><input className="inp" type="email" value={draft.loginEmail} onChange={(e) => setDraft({ ...draft, loginEmail: e.target.value })} placeholder="artist@email.com" /></Field>
                  <Field label="Mobile (optional)"><input className="inp" value={draft.loginPhone} onChange={(e) => setDraft({ ...draft, loginPhone: e.target.value })} placeholder="(303) 555-0199" /></Field>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-white/14 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "Adding…" : "Add to roster"}
              </button>
              {msg && <span className="ml-3 text-xs text-rose-400">{msg}</span>}
            </div>
          </form>
        </Card>
      )}

      <SectionTitle>The crew ({artists.length})</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {artists.map((a) => {
          const st = statementFor(a, sales);
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
                    <div className="text-xs text-white/60">@{a.handle}</div>
                  </div>
                </div>
                <Badge tone="neutral">{payTypeLabel(a)}</Badge>
              </div>

              {editing ? (
                <div className="grid grid-cols-1 gap-3 border-t border-white/9 p-4 sm:grid-cols-2">
                  <PayFields d={edit} set={setEdit} />
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <button onClick={saveEdit} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">Save</button>
                    <button onClick={() => setEditId(null)} className="rounded-lg border border-white/12 px-3 py-1.5 text-sm text-white/75 hover:bg-white/6">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 border-t border-white/9 text-center">
                    <Stat label="Tickets" value={String(st.saleCount)} />
                    <Stat label="Service" value={fmt(st.grossService)} />
                    <Stat label="Shop keeps" value={fmt(st.shopCut)} />
                  </div>
                  {isOwner && <LoginRow artist={a} login={logins[a.id]} onChanged={loadLogins} />}
                  {isOwner && (
                    <div className="flex items-center gap-2 border-t border-white/9 px-4 py-2.5">
                      <button onClick={() => startEdit(a)} className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6">Edit pay</button>
                      <a href={`/${a.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6">View page ↗</a>
                      <a href={`/admin/card/${a.slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6">QR card ↗</a>
                      <button onClick={() => remove(a)} className="ml-auto rounded-lg border border-rose-400/30 px-2.5 py-1 text-xs font-medium text-rose-400 hover:bg-rose-400/10">Remove</button>
                    </div>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      {isOwner && <SquareHistoryPanel artists={artists} />}
    </div>
  );
}

// The app-login line on each card: who this chair signs in as, or a one-tap
// invite that provisions the login (same /api/staff call the add form uses).
function LoginRow({
  artist,
  login,
  onChanged,
}: {
  artist: Artist;
  login?: { email: string | null; phone: string | null };
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    if (!email.trim()) return setErr("An email is needed for the login.");
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), phone: phone.trim() || undefined, name: artist.name, role: "artist", artistId: artist.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "Could not set the login.");
      return;
    }
    setOpen(false);
    onChanged();
  };
  return (
    <div className="border-t border-white/9 px-4 py-2.5 text-xs">
      {login ? (
        <div className="flex flex-wrap items-center gap-x-2 text-white/65">
          <span className="font-medium text-white/85">App login</span>
          <span>{login.email ?? "·"}</span>
          {login.phone && <span>· {login.phone}</span>}
        </div>
      ) : open ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className="inp" type="email" placeholder="artist@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="inp" placeholder="(303) 555-0199 · optional" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button onClick={send} disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? "Setting…" : "Give login"}
          </button>
          <button onClick={() => setOpen(false)} className="rounded-lg border border-white/12 px-3 py-1.5 text-xs text-white/75">Cancel</button>
          {err && <span className="text-rose-400 sm:col-span-4">{err}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="text-white/55">No app login yet</span>
          <button onClick={() => setOpen(true)} className="rounded-lg border border-white/12 px-2.5 py-1 text-xs font-medium text-white/75 hover:bg-white/6">
            Give them the app
          </button>
        </div>
      )}
    </div>
  );
}

// Old Square logins not yet tied to anyone on the roster. Linking one moves
// that person's ENTIRE sales history (sales + ledger + all reports) onto the
// chosen artist, and future syncs keep attributing to them. One dropdown, one
// click — no database work. Owner only.
function SquareHistoryPanel({ artists }: { artists: Artist[] }) {
  type Member = { square_id: string; name: string };
  const sb = createClient();
  const [members, setMembers] = useState<Member[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await sb
      .from("square_team_members")
      .select("square_id, name")
      .is("artist_id", null)
      .order("name");
    setMembers((data ?? []) as Member[]);
  }, [sb]);
  useEffect(() => {
    load();
  }, [load]);

  if (members.length === 0) return null;

  const link = async (m: Member) => {
    const artistId = picks[m.square_id];
    if (!artistId) return;
    setBusy(m.square_id);
    setNote(null);
    const { data, error } = await sb.rpc("link_square_history", {
      p_square_id: m.square_id,
      p_artist_id: artistId,
    });
    setBusy(null);
    if (error) {
      setNote(error.message);
      return;
    }
    const artistName = artists.find((a) => a.id === artistId)?.name ?? artistId;
    setNote(`Linked ${m.name} to ${artistName}. ${data ?? 0} historical sales moved onto their name.`);
    await load();
  };

  return (
    <div className="mt-8">
      <SectionTitle>Square history not linked to anyone</SectionTitle>
      <p className="-mt-1 mb-3 text-xs text-white/60">
        Old Square logins with sales that currently count as shop revenue. If one of these people is on
        (or joins) the roster, pick their name and their whole history follows them: tickets, reports,
        pay math, everything. Leave former guests unlinked on purpose.
      </p>
      {note && (
        <div className="mb-3 rounded-lg border border-white/10 bg-white/6 px-3 py-2 text-xs text-white/75 shadow-sm">
          {note}
        </div>
      )}
      <Card>
        <div className="divide-y divide-white/8">
          {members.map((m) => (
            <div key={m.square_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="text-sm font-medium">{m.name}</span>
              <div className="flex items-center gap-2">
                <select
                  value={picks[m.square_id] ?? ""}
                  onChange={(e) => setPicks((p) => ({ ...p, [m.square_id]: e.target.value }))}
                  className="rounded-lg border border-white/12 bg-white/6 px-2.5 py-1.5 text-sm"
                >
                  <option value="">Not on the roster</option>
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => link(m)}
                  disabled={!picks[m.square_id] || busy === m.square_id}
                  className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {busy === m.square_id ? "Linking…" : "Link history"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
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

function PayFields({ d, set }: { d: Draft; set: (d: Draft) => void }) {
  return (
    <>
      <Field label="How they're paid">
        <select className="inp" value={d.pay_type} onChange={(e) => set({ ...d, pay_type: e.target.value as PayType })}>
          <option value="payroll_split">% split · Gusto payroll</option>
          <option value="booth_rent">Booth rent · 100% pass-through</option>
          <option value="payroll_salary">Owner salary · Gusto</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {d.pay_type === "booth_rent" && (
          <Field label="Rent ($/mo)"><input className="inp" type="number" value={d.rentDollars} onChange={(e) => set({ ...d, rentDollars: e.target.value })} placeholder="1000" /></Field>
        )}
        {d.pay_type === "payroll_split" && (
          <Field label="Shop split (%)"><input className="inp" type="number" value={d.splitPct} onChange={(e) => set({ ...d, splitPct: e.target.value })} placeholder="30" /></Field>
        )}
        {d.pay_type === "payroll_salary" && (
          <div className="self-end pb-2 text-xs text-white/55">Salary amount lives in Gusto, not here.</div>
        )}
      </div>
    </>
  );
}

function PalettePicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLOR_PRESETS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className={`h-6 w-6 rounded-full ${value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-white/30 ring-offset-1" : "ring-1 ring-white/15"}`} style={{ backgroundColor: c }} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="ml-1 h-6 w-8 cursor-pointer rounded border border-white/12 bg-white/6 p-0.5" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <div className="tnum text-sm font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-white/55">{label}</div>
    </div>
  );
}
