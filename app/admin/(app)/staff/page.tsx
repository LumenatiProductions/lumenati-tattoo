"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useArtists } from "@/lib/admin/artists-context";
import { ROLE_LABELS, useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import type { Role } from "@/lib/admin/types";

// The new process: two roles. Admins run the shop; artists get their own
// room, money, and day. Everyone signs in with a text code to their phone
// (email works too — it anchors the account).

type Profile = {
  email: string;
  phone: string | null;
  role: Role;
  artist_id: string | null;
  full_name: string | null;
};

const prettyPhone = (p: string | null) =>
  p && /^\+1\d{10}$/.test(p) ? `(${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8)}` : p ?? "";

export default function StaffPage() {
  const { realRole, email: myEmail } = useRole();
  const { artists } = useArtists();
  const supabase = createClient();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "artist">("artist");
  const [artistId, setArtistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from("profiles").select("*").order("role");
    setRows((data as Profile[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Admins only.</p>;
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const r = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        phone,
        name,
        role,
        artistId: role === "artist" ? artistId || artists[0]?.id || null : null,
      }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(d.error || "Could not add them.");
      return;
    }
    setEmail("");
    setPhone("");
    setName("");
    setMsg(phone ? "Added. They can sign in right now with a text code." : "Added. They can sign in with an email code.");
    load();
  };

  const remove = async (em: string) => {
    if (em === myEmail) {
      setMsg("You can't remove yourself — have another admin do it.");
      return;
    }
    if (!window.confirm(`Remove ${em}? They lose access immediately.`)) return;
    const r = await fetch(`/api/staff?email=${encodeURIComponent(em)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? `${em} removed.` : d.error || "Could not remove them.");
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm text-white/65">
          Two roles: admins run the shop, artists run their chair. Add someone with their phone number
          and they sign in with a text code — no passwords, nothing to set up.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionTitle>Team</SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/55">
                  <th className="px-4 py-2.5 font-medium">Who</th>
                  <th className="px-4 py-2.5 font-medium">Phone</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Artist</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-white/55">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-white/55">No one yet.</td></tr>
                )}
                {rows.map((p) => (
                  <tr key={p.email} className="border-b border-white/8 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{p.full_name || p.email}</div>
                      {p.full_name && <div className="text-xs text-white/60">{p.email}</div>}
                    </td>
                    <td className="tnum px-4 py-2.5 text-white/70">
                      {p.phone ? prettyPhone(p.phone) : <span className="text-white/45">—</span>}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone="brand">{ROLE_LABELS[p.role]}</Badge></td>
                    <td className="px-4 py-2.5 text-white/70">
                      {p.artist_id ? artists.find((a) => a.id === p.artist_id)?.name ?? p.artist_id : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => remove(p.email)}
                        className="rounded-lg border border-white/12 px-2 py-1 text-xs text-white/65 hover:bg-white/6"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <div>
          <SectionTitle>Add someone</SectionTitle>
          <Card>
            <form onSubmit={add} className="space-y-3 p-4">
              <input className="inp" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
              <input
                className="inp"
                type="tel"
                placeholder="phone (they'll get text codes)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input className="inp" type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className="inp" value={role} onChange={(e) => setRole(e.target.value as "admin" | "artist")}>
                <option value="artist">Artist</option>
                <option value="admin">Admin</option>
              </select>
              {role === "artist" && (
                <select
                  className="inp"
                  value={artistId || artists[0]?.id || ""}
                  onChange={(e) => setArtistId(e.target.value)}
                >
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add to team"}
              </button>
              {msg && <p className="text-xs text-white/70">{msg}</p>}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
