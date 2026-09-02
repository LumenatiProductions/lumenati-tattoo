import type { SupabaseClient } from "@supabase/supabase-js";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { emailFrom } from "@/lib/email/from";

// How far ahead counts as "expiring soon" (and triggers the owner email).
export const EXPIRY_WINDOW_DAYS = 30;
const SHOP_NAME = "Lumenati Tattoo";

export type ComplianceStatus = "active" | "expiring" | "expired" | "na";

// DB `date` columns are YYYY-MM-DD strings; keep all math in that space.
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => isoDate(new Date());
const addDays = (dateStr: string, n: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

// Whole-days from today until `expires_on` (negative = already past). null when
// nothing is tracked.
export function daysUntil(expiresOn: string | null): number | null {
  if (!expiresOn) return null;
  const a = new Date(`${today()}T00:00:00Z`).getTime();
  const b = new Date(`${expiresOn.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// The single source of truth for an item's badge. Shared by the route (so a
// freshly-entered item is immediately colored right) and the nightly recompute.
export function computeStatus(expiresOn: string | null): ComplianceStatus {
  const d = daysUntil(expiresOn);
  if (d === null) return "na";
  if (d < 0) return "expired";
  if (d <= EXPIRY_WINDOW_DAYS) return "expiring";
  return "active";
}

type ItemRow = {
  id: string;
  shop_id: string;
  scope: string;
  artist_id: string | null;
  kind: string;
  label: string | null;
  expires_on: string | null;
  status: string;
};

const KIND_LABELS: Record<string, string> = {
  tattoo_license: "Tattoo license",
  bbp_cert: "BBP certification",
  shop_permit: "Shop permit",
  inspection: "Inspection",
  insurance: "Liability insurance",
};
export const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind;

// Recompute every item's status from its expiry. Only writes rows that actually
// changed, so a quiet day is a no-op. Returns the set now within the window.
async function recompute(client: SupabaseClient) {
  const { data, error } = await client
    .from("compliance_items")
    .select("id, shop_id, scope, artist_id, kind, label, expires_on, status");
  if (error) throw new Error(error.message);
  const items = (data || []) as ItemRow[];

  let changed = 0;
  for (const it of items) {
    const next = computeStatus(it.expires_on);
    if (next !== it.status) {
      const { error: upErr } = await client
        .from("compliance_items")
        .update({ status: next })
        .eq("id", it.id);
      if (upErr) throw new Error(upErr.message);
      changed++;
    }
  }

  const lapsing = items
    .map((it) => ({ ...it, status: computeStatus(it.expires_on) }))
    .filter((it) => it.status === "expiring" || it.status === "expired");
  return { changed, lapsing, total: items.length };
}

async function ownerNames(client: SupabaseClient, artistIds: string[]) {
  if (!artistIds.length) return new Map<string, string>();
  const { data } = await client
    .from("artists")
    .select("id, name")
    .in("id", artistIds);
  return new Map((data || []).map((a: { id: string; name: string }) => [a.id, a.name]));
}

function alertHtml(
  rows: { what: string; expires: string | null; status: string; days: number | null }[],
  shopName: string,
  accent: string,
) {
  const line = (r: (typeof rows)[number]) => {
    const color = r.status === "expired" ? "#b91c1c" : "#b45309";
    const when =
      r.days === null
        ? ""
        : r.days < 0
          ? ` — expired ${Math.abs(r.days)} day${Math.abs(r.days) === 1 ? "" : "s"} ago`
          : ` — ${r.days} day${r.days === 1 ? "" : "s"} left`;
    const due = r.expires ? ` (${r.expires})` : "";
    return `<div style="font-size:13px;color:${color};padding:4px 0;">• ${r.what}${due}${when}</div>`;
  };
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">${shopName}</span><span style="font-size:22px;font-weight:800;color:${accent};">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">Compliance — action needed</div>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <div style="font-size:15px;font-weight:700;color:#0e0e11;margin-bottom:8px;">${rows.length} item${rows.length === 1 ? "" : "s"} expiring or expired</div>
        <div style="font-size:13px;color:#52525b;margin-bottom:14px;">Renew these to keep the shop inspection-ready.</div>
        ${rows.map(line).join("")}
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">${shopName} &nbsp;//&nbsp; anything within ${EXPIRY_WINDOW_DAYS} days of expiry is flagged here automatically. Powered by Lumenati.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

// The DIGEST_RECIPIENTS env is Lumenati's inbox; every other shop's alert goes
// to its own owners (profiles, role=owner, that shop).
async function alertRecipients(client: SupabaseClient, shopId: string): Promise<string[]> {
  if (shopId === LUMENATI_SHOP_ID) {
    return (process.env.DIGEST_RECIPIENTS || "lumenati@icloud.com")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const { data } = await client
    .from("profiles")
    .select("email")
    .eq("shop_id", shopId)
    .eq("role", "owner");
  return ((data ?? []) as { email: string | null }[]).map((p) => p.email).filter(Boolean) as string[];
}

async function emailOwner(
  client: SupabaseClient,
  shopId: string,
  lapsing: ItemRow[],
): Promise<{ emailed: boolean; reason?: string }> {
  if (!lapsing.length) return { emailed: false, reason: "nothing lapsing" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { emailed: false, reason: "RESEND_API_KEY not set" };

  const names = await ownerNames(
    client,
    [...new Set(lapsing.filter((l) => l.artist_id).map((l) => l.artist_id!))],
  );
  const rows = lapsing
    .map((l) => {
      const who =
        l.scope === "artist" && l.artist_id ? `${names.get(l.artist_id) ?? "Artist"} — ` : "Shop — ";
      const what = `${who}${l.label?.trim() || kindLabel(l.kind)}`;
      return {
        what,
        expires: l.expires_on,
        status: computeStatus(l.expires_on),
        days: daysUntil(l.expires_on),
      };
    })
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0)); // most-overdue first

  const recipients = await alertRecipients(client, shopId);
  if (!recipients.length) return { emailed: false, reason: "no owner email" };

  const { data: shop } = await client.from("shops").select("name, accent").eq("id", shopId).maybeSingle();
  const shopName = (shop?.name as string | undefined)?.trim() || SHOP_NAME;
  const accent = /^#[0-9a-f]{6}$/i.test((shop?.accent as string) ?? "") ? (shop!.accent as string) : "#FF1493";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(shopName),
      to: recipients,
      subject: `${shopName} — ${rows.length} compliance item${rows.length === 1 ? "" : "s"} need attention`,
      html: alertHtml(rows, shopName, accent),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { emailed: false, reason: body?.message || `Send failed (${res.status})` };
  }
  return { emailed: true };
}

/**
 * Daily ops job. Always recomputes statuses (safe, no external calls). Emailing
 * the owner is best-effort and gated on RESEND_API_KEY — if it's not set the
 * statuses still update so the page badges are right; only the email is skipped.
 * Called by /api/ops/daily with the service-role client (bypasses RLS).
 */
export async function runDailyJob(admin: unknown) {
  const client = admin as SupabaseClient;
  const { changed, lapsing, total } = await recompute(client);

  // One alert per shop, each holding only that shop's lapsing items.
  const byShop = new Map<string, ItemRow[]>();
  for (const it of lapsing) {
    (byShop.get(it.shop_id) ?? byShop.set(it.shop_id, []).get(it.shop_id)!).push(it);
  }
  const emails: Record<string, unknown>[] = [];
  for (const [shopId, items] of byShop) {
    const mail = await emailOwner(client, shopId, items);
    emails.push({ shop: shopId, lapsing: items.length, emailed: mail.emailed, ...(mail.reason ? { note: mail.reason } : {}) });
  }

  return {
    feature: "compliance",
    total,
    changed,
    lapsing: lapsing.length,
    emails,
  };
}
