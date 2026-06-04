"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ARTISTS } from "@/lib/admin/mock-data";
import { ROLE_LABELS, useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import type { Role } from "@/lib/admin/types";

type Profile = {
  email: string;
  role: Role;
  artist_id: string | null;
  full_name: string | null;
};

export default function StaffPage() {
  const { realRole } = useRole();
  const supabase = createClient();
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("artist");
  const [artistId, setArtistId] = useState("jd");
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
    return <p className="text-sm text-black/50">Owners only.</p>;
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const { error } = await supabase.from("profiles").upsert(
      {
        email: email.trim().toLowerCase(),
        full_name: name.trim() || null,
        role,
        artist_id: role === "artist" ? artistId : null,
      },
      { onConflict: "email" },
    );
    if (error) setMsg(error.message);
    else {
      setEmail("");
      setName("");
      setMsg("Added. They can sign in with that email now.");
      load();
    }
  };

  const remove = async (em: string) => {
    await supabase.from("profiles").delete().eq("email", em);
    load();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Staff &amp; Artists</h1>
        <p className="text-sm text-black/50">
          Anyone listed here can sign in with a magic link. Set their role; for
          artists, pick whose room they manage.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionTitle>Team</SectionTitle>
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/8 text-left text-xs uppercase tracking-wide text-black/40">
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Artist</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-black/40">Loading…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-black/40">No one yet.</td></tr>
                )}
                {rows.map((p) => (
                  <tr key={p.email} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{p.email}</div>
                      {p.full_name && <div className="text-xs text-black/45">{p.full_name}</div>}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone="brand">{ROLE_LABELS[p.role]}</Badge></td>
                    <td className="px-4 py-2.5 text-black/55">
                      {p.artist_id ? ARTISTS.find((a) => a.id === p.artist_id)?.name ?? p.artist_id : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => remove(p.email)}
                        className="rounded-lg border border-black/10 px-2 py-1 text-xs text-black/50 hover:bg-black/4"
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
              <input className="inp" type="email" required placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="inp" placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
              <select className="inp" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              {role === "artist" && (
                <select className="inp" value={artistId} onChange={(e) => setArtistId(e.target.value)}>
                  {ARTISTS.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
              <button type="submit" className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:opacity-90">
                Add to team
              </button>
              {msg && <p className="text-xs text-black/55">{msg}</p>}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
