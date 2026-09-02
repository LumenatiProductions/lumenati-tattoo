import type { SupabaseClient } from "@supabase/supabase-js";
import { emailFrom } from "@/lib/email/from";


// An item needs reordering once it's at or below its threshold. A `reorder_at`
// of 0 means "only flag when fully out". Shared truth for the route, context,
// page badges, and this email — never compute "low" any other way.
export function isLow(qty: number, reorderAt: number): boolean {
  return qty <= reorderAt;
}

export const CATEGORY_LABELS: Record<string, string> = {
  needle: "Needles",
  ink: "Ink",
  glove: "Gloves",
  tube: "Tubes",
  aftercare: "Aftercare",
  disposable: "Disposables",
  other: "Other",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;

type ItemRow = {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  unit: string;
  qty: number;
  reorder_at: number;
  reorder_qty: number;
  supplier: string | null;
  supplier_url: string | null;
};

// Everything at/below threshold, most-depleted first (qty relative to threshold).
async function lowStock(client: SupabaseClient) {
  const { data, error } = await client
    .from("inventory_items")
    .select("id, name, category, brand, unit, qty, reorder_at, reorder_qty, supplier, supplier_url");
  if (error) throw new Error(error.message);
  const items = (data || []) as ItemRow[];
  const low = items
    .filter((i) => isLow(Number(i.qty), Number(i.reorder_at)))
    .sort((a, b) => Number(a.qty) - Number(a.reorder_at) - (Number(b.qty) - Number(b.reorder_at)));
  return { total: items.length, low };
}

function alertHtml(rows: ItemRow[]) {
  const line = (r: ItemRow) => {
    const out = Number(r.qty) <= 0;
    const color = out ? "#b91c1c" : "#b45309";
    const who = r.brand ? `${r.brand} ` : "";
    const label = `${who}${r.name}`;
    const qty = `${Number(r.qty)} ${r.unit}${Number(r.qty) === 1 ? "" : "s"}`;
    const sugg = Number(r.reorder_qty) > 0 ? ` — reorder ${Number(r.reorder_qty)}` : "";
    const link = r.supplier_url
      ? ` &nbsp;<a href="${r.supplier_url}" style="color:#2563eb;text-decoration:none;">${r.supplier ? r.supplier : "order"} →</a>`
      : r.supplier
        ? ` (${r.supplier})`
        : "";
    return `<div style="font-size:13px;color:${color};padding:4px 0;">• ${label} — <strong>${qty}</strong> left${sugg}${link}</div>`;
  };
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">LUMENATI</span><span style="font-size:22px;font-weight:800;color:#FF1493;">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">Inventory — running low</div>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <div style="font-size:15px;font-weight:700;color:#0e0e11;margin-bottom:8px;">${rows.length} item${rows.length === 1 ? "" : "s"} at or below reorder threshold</div>
        <div style="font-size:13px;color:#52525b;margin-bottom:14px;">Restock these before the next session so nobody's making an emergency supply run.</div>
        ${rows.map(line).join("")}
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">Lumenati Tattoo &nbsp;//&nbsp; items hit this list automatically once quantity reaches the reorder point you set.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

async function emailOwner(low: ItemRow[]): Promise<{ emailed: boolean; reason?: string }> {
  if (!low.length) return { emailed: false, reason: "nothing low" };
  const key = process.env.RESEND_API_KEY;
  if (!key) return { emailed: false, reason: "RESEND_API_KEY not set" };

  const recipients = (process.env.DIGEST_RECIPIENTS || "lumenati@icloud.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(),
      to: recipients,
      subject: `Lumenati — ${low.length} suppl${low.length === 1 ? "y" : "ies"} running low`,
      html: alertHtml(low),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { emailed: false, reason: body?.message || `Send failed (${res.status})` };
  }
  return { emailed: true };
}

/**
 * Daily ops job. Reads the stock list and, if anything is at/below its reorder
 * threshold, emails the owner. Emailing is best-effort and gated on
 * RESEND_API_KEY — if it's unset the job is a clean no-op (the page badges,
 * computed client-side, are unaffected). Called by /api/ops/daily with the
 * service-role client (bypasses RLS).
 */
export async function runDailyJob(admin: unknown) {
  const client = admin as SupabaseClient;
  const { total, low } = await lowStock(client);
  const mail = await emailOwner(low);
  return {
    feature: "inventory",
    total,
    low: low.length,
    emailed: mail.emailed,
    ...(mail.reason ? { emailNote: mail.reason } : {}),
  };
}
