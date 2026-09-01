"use client";

import { useRef, useState } from "react";
import { useArtists } from "@/lib/admin/artists-context";
import { Card, SectionTitle, Badge } from "@/components/admin/ui";
import { PRESETS, type Role } from "@/lib/import/csv";

// Bring your people over. Pick where the spreadsheet came from, drop the file,
// check what we read, import. Clients and appointments both ride this one
// screen; the server tells us which kind the file is.

type Preview = {
  ok: boolean;
  kind: "clients" | "appointments";
  headers: string[];
  mapping: Partial<Record<Role, number>>;
  roles: Role[];
  roleLabels: Record<Role, string>;
  rowCount: number;
  sample: string[][];
  staffNames: string[];
  warnings: string[];
};
type Result = { kind: string; added: number; updated: number; skipped: number; rows: number; booked?: number; past?: number; duplicates?: number };

const CLIENT_ROLES: Role[] = ["full_name", "first_name", "last_name", "phone", "email", "instagram", "last_visit", "first_visit", "total_spent", "opt_in", "birthday", "notes"];
const APPT_ROLES: Role[] = ["datetime", "date", "time", "full_name", "first_name", "last_name", "phone", "email", "staff", "service", "price", "status", "notes"];

export default function ImportTab() {
  const { artists } = useArtists();
  const [preset, setPreset] = useState("square");
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<Role, number | null>>>({});
  const [staffMap, setStaffMap] = useState<Record<string, string>>({});
  const [defaultArtist, setDefaultArtist] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setResult(null);
    setPreview(null);
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    setBusy(true);
    try {
      const r = await fetch("/api/import/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: text, preset }) });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Could not read that file.");
        return;
      }
      setPreview(d);
      setMapping(d.mapping);
      setStaffMap({});
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!csv || !preview) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, preset, mapping, staffMap, defaultArtistId: defaultArtist || null }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "Import failed.");
        return;
      }
      setResult(d);
      setPreview(null);
      setCsv(null);
    } finally {
      setBusy(false);
    }
  };

  const hint = PRESETS.find((p) => p.key === preset)?.hint;
  const roles = preview?.kind === "appointments" ? APPT_ROLES : CLIENT_ROLES;
  const inp = "rounded-md border border-white/12 bg-white/6 px-2 py-1 text-sm text-white";

  return (
    <div>
      <p className="mb-5 max-w-3xl text-sm text-white/65">
        Leaving Square, Booksy, Vagaro, Podium, Mailchimp, or anything else? Export a spreadsheet from it and drop it here.
        Clients come over with their contact, last visit and spend. Appointments land on the right chair. Nothing you already
        have gets overwritten.
      </p>

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/55">Coming from</span>
            <select className={`${inp} w-full`} value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
            {hint && <span className="mt-1 block text-xs text-white/45">{hint}</span>}
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/55">The file</span>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="rounded-lg border border-white/12 px-4 py-2 text-sm font-medium text-white/85 hover:bg-white/6 disabled:opacity-50"
            >
              {busy && !preview ? "Reading…" : fileName ? `Change file (${fileName})` : "Choose a CSV"}
            </button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" onChange={pick} className="hidden" />
            <span className="mt-1 block text-xs text-white/45">Up to 6 MB, 5,000 rows at a time.</span>
          </div>
        </div>
      </Card>

      {err && <div className="mb-4 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-300">{err}</div>}

      {result && (
        <Card className="mb-5">
          <div className="p-4">
            <div className="text-sm font-semibold">Done.</div>
            <p className="mt-1 text-sm text-white/65">
              {result.kind === "clients"
                ? `${result.added} new client${result.added === 1 ? "" : "s"}, ${result.updated} already here and filled in, ${result.skipped} row${result.skipped === 1 ? "" : "s"} without a usable name or contact.`
                : `${result.booked ?? 0} upcoming appointment${(result.booked ?? 0) === 1 ? "" : "s"} on the book, ${result.past ?? 0} past session${(result.past ?? 0) === 1 ? "" : "s"} on record, ${result.added} new client${result.added === 1 ? "" : "s"}${result.duplicates ? `, ${result.duplicates} already imported` : ""}${result.skipped ? `, ${result.skipped} skipped` : ""}.`}
            </p>
          </div>
        </Card>
      )}

      {preview && (
        <>
          <SectionTitle>
            {preview.kind === "appointments" ? "Appointments" : "Clients"}{" "}
            <span className="font-normal text-white/50">· {preview.rowCount.toLocaleString()} rows</span>
          </SectionTitle>
          {preview.warnings.map((w) => (
            <div key={w} className="mb-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              {w}
            </div>
          ))}
          <Card className="mb-4">
            <div className="p-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/55">What each column means</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {roles.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <span className="w-36 text-white/65">{preview.roleLabels[role]}</span>
                    <select
                      className={`${inp} flex-1`}
                      value={mapping[role] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [role]: e.target.value === "" ? null : Number(e.target.value) }))}
                    >
                      <option value="">—</option>
                      {preview.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          </Card>

          {preview.kind === "appointments" && (
            <Card className="mb-4">
              <div className="p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/55">Whose chair</div>
                {preview.staffNames.length ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {preview.staffNames.map((name) => (
                      <label key={name} className="flex items-center gap-2 text-sm">
                        <span className="w-40 truncate text-white/75">{name}</span>
                        <select className={`${inp} flex-1`} value={staffMap[name] ?? ""} onChange={(e) => setStaffMap((m) => ({ ...m, [name]: e.target.value }))}>
                          <option value="">Skip this person&apos;s bookings</option>
                          {artists.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-white/75">Everything goes to</span>
                    <select className={inp} value={defaultArtist} onChange={(e) => setDefaultArtist(e.target.value)}>
                      <option value="">No chair (shop-level)</option>
                      {artists.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </Card>
          )}

          <Card className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-left uppercase tracking-wide text-white/50">
                    {preview.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 font-medium">
                        {h || `Column ${i + 1}`}
                        {Object.entries(mapping).find(([, idx]) => idx === i) ? (
                          <Badge tone="brand">{preview.roleLabels[Object.entries(mapping).find(([, idx]) => idx === i)![0] as Role]}</Badge>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, ri) => (
                    <tr key={ri} className="border-b border-white/8 last:border-0">
                      {preview.headers.map((_, ci) => (
                        <td key={ci} className="max-w-[14rem] truncate px-3 py-1.5 text-white/75">
                          {r[ci]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <button onClick={run} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Importing…" : `Import ${preview.rowCount.toLocaleString()} ${preview.kind === "appointments" ? "appointments" : "clients"}`}
          </button>
        </>
      )}
    </div>
  );
}
