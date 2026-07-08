"use client";

import { useMemo, useState } from "react";
import {
  useCompliance,
  type ComplianceItem,
  type ComplianceStatus,
} from "@/lib/admin/compliance-context";
import { useArtists } from "@/lib/admin/artists-context";
import { useRole } from "@/lib/admin/role-context";
import { Card, SectionTitle, StatCard, Badge } from "@/components/admin/ui";
import { todayLocal } from "@/lib/dates";

const KIND_LABELS: Record<string, string> = {
  tattoo_license: "Tattoo license",
  bbp_cert: "BBP certification",
  shop_permit: "Shop permit",
  inspection: "Inspection",
  insurance: "Liability insurance",
};
const KIND_OPTIONS = Object.entries(KIND_LABELS);
const kindLabel = (k: string) => KIND_LABELS[k] ?? k;

const STATUS_TONE: Record<ComplianceStatus, "good" | "warn" | "bad" | "neutral"> = {
  active: "good",
  expiring: "warn",
  expired: "bad",
  na: "neutral",
};
const STATUS_LABEL: Record<ComplianceStatus, string> = {
  active: "Active",
  expiring: "Expiring",
  expired: "Expired",
  na: "No expiry",
};

// Days from today to an ISO date (negative = past). Pure display helper.
function daysUntil(expiresOn: string | null): number | null {
  if (!expiresOn) return null;
  const today = todayLocal();
  const a = new Date(`${today}T00:00:00Z`).getTime();
  const b = new Date(`${expiresOn.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
function expiryNote(item: ComplianceItem): string {
  if (!item.expires_on) return "no expiry tracked";
  const d = daysUntil(item.expires_on);
  if (d === null) return item.expires_on;
  if (d < 0) return `expired ${Math.abs(d)}d ago`;
  if (d === 0) return "expires today";
  return `${d}d left`;
}

export default function CompliancePage() {
  const { realRole } = useRole();
  const { items, loading, error, expiringSoon, addItem, removeItem } = useCompliance();
  const { artists } = useArtists();

  const artistName = useMemo(() => {
    const m = new Map(artists.map((a) => [a.id, a.name] as const));
    return (id: string | null) => (id ? m.get(id) ?? "Unknown artist" : "Shop");
  }, [artists]);

  const stats = useMemo(() => {
    const expired = items.filter((i) => i.status === "expired").length;
    const expiring = items.filter((i) => i.status === "expiring").length;
    return { tracked: items.length, expiring, expired };
  }, [items]);

  // Group artist-scoped rows by artist; shop rows stand alone.
  const byArtist = useMemo(() => {
    const groups = new Map<string, ComplianceItem[]>();
    for (const it of items) {
      if (it.scope !== "artist" || !it.artist_id) continue;
      const arr = groups.get(it.artist_id) ?? [];
      arr.push(it);
      groups.set(it.artist_id, arr);
    }
    return groups;
  }, [items]);
  const shopItems = useMemo(() => items.filter((i) => i.scope === "shop"), [items]);

  // The API is owner-gated too — this just renders the clean message instead of
  // a wall of 403 errors if someone types the URL.
  if (realRole !== "owner") {
    return <p className="text-sm text-white/65">Owners only.</p>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Compliance</h1>
        <p className="text-sm text-white/65">
          Licenses, BBP certs, permits, insurance, and inspections — and a warning before anything
          lapses. Owner-only.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Items tracked" value={String(stats.tracked)} accent />
        <StatCard
          label="Expiring soon"
          value={String(stats.expiring)}
          sub="within 30 days"
          tone={stats.expiring ? "warn" : "neutral"}
        />
        <StatCard
          label="Expired"
          value={String(stats.expired)}
          tone={stats.expired ? "warn" : "neutral"}
        />
      </div>

      {/* The whole point: what's lapsing, up top. */}
      {expiringSoon.length > 0 && (
        <Card className="mb-5 ring-1 ring-amber-400/35">
          <div className="p-4">
            <div className="mb-2 text-sm font-semibold text-amber-300">
              {expiringSoon.length} item{expiringSoon.length === 1 ? "" : "s"} need attention
            </div>
            <div className="flex flex-col gap-1.5">
              {expiringSoon.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">
                    <span className="text-white/60">{artistName(it.artist_id)} — </span>
                    {it.label?.trim() || kindLabel(it.kind)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={it.status === "expired" ? "text-rose-400" : "text-amber-400"}
                    >
                      {expiryNote(it)}
                    </span>
                    <Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <AddItemForm artists={artists} onAdd={addItem} />

      {error && (
        <Card className="mb-5">
          <div className="px-4 py-3 text-sm text-rose-400">{error}</div>
        </Card>
      )}

      {loading ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-white/55">Loading compliance…</div>
        </Card>
      ) : items.length === 0 && !error ? (
        <Card>
          <div className="px-4 py-10 text-center text-sm text-white/55">
            Nothing tracked yet. Add a license, cert, permit, or inspection above.
          </div>
        </Card>
      ) : (
        <>
          {/* Per-artist groups */}
          {artists
            .filter((a) => byArtist.has(a.id))
            .map((a) => (
              <div key={a.id} className="mb-5">
                <SectionTitle>{a.name}</SectionTitle>
                <ItemTable
                  items={byArtist.get(a.id)!}
                  artistName={artistName}
                  onRemove={removeItem}
                />
              </div>
            ))}

          {/* Shop-level */}
          {shopItems.length > 0 && (
            <div className="mb-5">
              <SectionTitle>Shop</SectionTitle>
              <ItemTable items={shopItems} artistName={artistName} onRemove={removeItem} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemTable({
  items,
  artistName,
  onRemove,
}: {
  items: ComplianceItem[];
  artistName: (id: string | null) => string;
  onRemove: (id: string) => void;
}) {
  void artistName; // grouping already labels the owner; kept for signature parity
  return (
    <Card>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/60">
            <th className="px-4 py-2 font-medium">Item</th>
            <th className="px-4 py-2 font-medium">Issued</th>
            <th className="px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-white/8 last:border-0">
              <td className="px-4 py-2.5">
                <div className="font-medium">{it.label?.trim() || kindLabel(it.kind)}</div>
                <div className="text-xs text-white/55">
                  {kindLabel(it.kind)}
                  {it.document_url && (
                    <>
                      {" · "}
                      <a
                        href={it.document_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand underline"
                      >
                        scan
                      </a>
                    </>
                  )}
                </div>
                {it.notes && <div className="mt-0.5 text-xs text-white/55">{it.notes}</div>}
              </td>
              <td className="px-4 py-2.5 tnum text-white/75">{it.issued_on ?? "—"}</td>
              <td className="px-4 py-2.5 tnum">
                <div>{it.expires_on ?? "—"}</div>
                <div className="text-xs text-white/55">{expiryNote(it)}</div>
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={STATUS_TONE[it.status]}>{STATUS_LABEL[it.status]}</Badge>
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => onRemove(it.id)}
                  className="text-xs text-white/50 hover:text-rose-400"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AddItemForm({
  artists,
  onAdd,
}: {
  artists: { id: string; name: string }[];
  onAdd: ReturnType<typeof useCompliance>["addItem"];
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"artist" | "shop">("artist");
  const [artistId, setArtistId] = useState("");
  const [kind, setKind] = useState("tattoo_license");
  const [label, setLabel] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setLabel("");
    setIssuedOn("");
    setExpiresOn("");
    setDocumentUrl("");
    setNotes("");
    setFormError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const res = await onAdd({
      scope,
      artistId: scope === "artist" ? artistId || null : null,
      kind,
      label: label || null,
      issuedOn: issuedOn || null,
      expiresOn: expiresOn || null,
      documentUrl: documentUrl || null,
      notes,
    });
    setBusy(false);
    if (res.ok) {
      reset();
      setOpen(false);
    } else {
      setFormError(res.error || "Could not add that item.");
    }
  };

  const field =
    "w-full rounded-lg border border-white/12 bg-white/6 px-3 py-2 text-sm";
  const labelCls =
    "mb-1 block text-xs font-medium uppercase tracking-wide text-white/60";

  if (!open) {
    return (
      <div className="mb-5">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Add item
        </button>
      </div>
    );
  }

  return (
    <Card className="mb-5">
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <label>
          <span className={labelCls}>Scope</span>
          <select value={scope} onChange={(e) => setScope(e.target.value as "artist" | "shop")} className={field}>
            <option value="artist">Artist</option>
            <option value="shop">Shop</option>
          </select>
        </label>
        <label>
          <span className={labelCls}>Artist</span>
          <select
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            disabled={scope === "shop"}
            className={`${field} disabled:opacity-40`}
          >
            <option value="">Select…</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
            {KIND_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelCls}>Label (optional)</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kindLabel(kind)}
            className={field}
          />
        </label>
        <label>
          <span className={labelCls}>Issued on</span>
          <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} className={field} />
        </label>
        <label>
          <span className={labelCls}>Expires on</span>
          <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className={labelCls}>Document scan URL (optional)</span>
          <input
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
            placeholder="https://…"
            className={field}
          />
        </label>
        <label className="sm:col-span-2">
          <span className={labelCls}>Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </label>
        {formError && <div className="text-xs text-rose-400 sm:col-span-2">{formError}</div>}
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save item"}
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            className="rounded-lg border border-white/12 px-4 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
