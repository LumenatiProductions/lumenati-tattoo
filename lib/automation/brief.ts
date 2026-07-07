import type { SupabaseClient } from "@supabase/supabase-js";
import { isLow } from "@/lib/inventory/job";
import { findNoShowCandidates } from "./no-show";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";

// Morning brief (POS-STARTER-4): a one-screen "here is today" email to the owner,
// composed across features. Runs from the daily ops fan-out (no new cron).
// Best-effort + gated on RESEND_API_KEY, like the other jobs — if it's unset the
// gathering still runs (so the daily route reports the numbers) and only the
// send is skipped.

const SHOP_NAME = "Lumenati Tattoo";

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

type Gathered = {
  date: string;
  appts: { time: string; who: string; artist: string; checkedIn: boolean }[];
  depositsHeld: number;
  lowStock: string[];
  expiring: string[];
  followupsDue: number;
  noShowCandidates: number;
};

async function gather(admin: SupabaseClient, shopId: string): Promise<Gathered> {
  const date = new Date().toISOString().slice(0, 10); // UTC day; close enough for a brief
  const dayEnd = `${date}T23:59:59.999`;

  const [bookingsRes, heldRes, invRes, compRes, fuRes, noShows] = await Promise.all([
    admin
      .from("bookings")
      .select("starts_at, client_id, artist_id, checked_in_at, status")
      .eq("shop_id", shopId)
      .gte("starts_at", date)
      .lte("starts_at", dayEnd)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    admin.from("bookings").select("deposit_cents").eq("shop_id", shopId).eq("deposit_status", "held"),
    admin.from("inventory_items").select("name, qty, reorder_at, unit").eq("shop_id", shopId),
    admin
      .from("compliance_items")
      .select("kind, label, status")
      .in("status", ["expiring", "expired"])
      .eq("shop_id", shopId),
    admin
      .from("followups")
      .select("id")
      .eq("shop_id", shopId)
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString()),
    findNoShowCandidates(admin),
  ]);

  // findNoShowCandidates is shop-agnostic; keep only this shop's bookings.
  let noShowCount = 0;
  if (noShows.length) {
    const { data: mine } = await admin
      .from("bookings")
      .select("id")
      .eq("shop_id", shopId)
      .in("id", noShows.map((n) => n.id));
    noShowCount = (mine ?? []).length;
  }

  const bookings = bookingsRes.data ?? [];
  const clientIds = [...new Set(bookings.map((b) => b.client_id).filter(Boolean) as string[])];
  const artistIds = [...new Set(bookings.map((b) => b.artist_id).filter(Boolean) as string[])];
  const [clientsRes, artistsRes] = await Promise.all([
    clientIds.length
      ? admin.from("clients").select("id, first_name, last_name").in("id", clientIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    artistIds.length
      ? admin.from("artists").select("id, name").in("id", artistIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const cName = new Map((clientsRes.data ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]));
  const aName = new Map((artistsRes.data ?? []).map((a) => [a.id, a.name]));

  return {
    date,
    appts: bookings.map((b) => ({
      time: clock(b.starts_at),
      who: b.client_id ? cName.get(b.client_id) ?? "Client" : "Walk-in",
      artist: b.artist_id ? aName.get(b.artist_id) ?? "" : "",
      checkedIn: !!b.checked_in_at,
    })),
    depositsHeld: (heldRes.data ?? []).reduce((a, r) => a + ((r.deposit_cents as number) ?? 0), 0),
    lowStock: (invRes.data ?? [])
      .filter((i) => isLow(Number(i.qty), Number(i.reorder_at)))
      .map((i) => `${i.name} (${Number(i.qty)} ${i.unit})`),
    expiring: (compRes.data ?? []).map((c) => (c.label as string)?.trim() || (c.kind as string)),
    followupsDue: (fuRes.data ?? []).length,
    noShowCandidates: noShowCount,
  };
}

function briefHtml(g: Gathered) {
  const section = (title: string, lines: string[], empty: string) => `
    <div style="margin-top:18px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#0e0e11;">${title}</div>
      ${
        lines.length
          ? lines.map((l) => `<div style="font-size:13px;color:#3f3f46;padding:3px 0;">• ${l}</div>`).join("")
          : `<div style="font-size:13px;color:#a1a1aa;padding:3px 0;">${empty}</div>`
      }
    </div>`;

  const apptLines = g.appts.map(
    (a) => `${a.time} — ${a.who}${a.artist ? ` with ${a.artist}` : ""}${a.checkedIn ? " ✓ checked in" : ""}`,
  );
  const watch: string[] = [];
  if (g.followupsDue) watch.push(`${g.followupsDue} follow-up${g.followupsDue === 1 ? "" : "s"} due`);
  if (g.noShowCandidates) watch.push(`${g.noShowCandidates} no-show deposit${g.noShowCandidates === 1 ? "" : "s"} to review`);
  if (g.depositsHeld) watch.push(`${usd(g.depositsHeld)} in deposits held`);

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">LUMENATI</span><span style="font-size:22px;font-weight:800;color:#FF1493;">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">Today at the shop · ${g.date}</div>
      </td></tr>
      <tr><td style="padding:22px 28px;">
        ${section(`Appointments (${g.appts.length})`, apptLines, "Nothing on the books today.")}
        ${section("Watch", watch, "Nothing needs chasing.")}
        ${section(`Reorder (${g.lowStock.length})`, g.lowStock, "Everything's stocked.")}
        ${section(`Compliance (${g.expiring.length})`, g.expiring, "Nothing lapsing.")}
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">${SHOP_NAME} · your daily brief, sent automatically.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

// The DIGEST_RECIPIENTS env is Lumenati's inbox; every other shop's brief goes
// to its own owners (profiles, role=owner, that shop).
async function briefRecipients(client: SupabaseClient, shopId: string): Promise<string[]> {
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

export async function runMorningBrief(admin: unknown) {
  const client = admin as SupabaseClient;
  const { data: shops } = await client.from("shops").select("id, name");
  const key = process.env.RESEND_API_KEY;

  const results: Record<string, unknown>[] = [];
  for (const shop of (shops ?? []) as { id: string; name: string }[]) {
    const g = await gather(client, shop.id);
    if (!key) {
      results.push({ shop: shop.id, appts: g.appts.length, emailed: false, note: "RESEND_API_KEY not set" });
      continue;
    }
    const recipients = await briefRecipients(client, shop.id);
    if (!recipients.length) {
      results.push({ shop: shop.id, appts: g.appts.length, emailed: false, note: "no owner email" });
      continue;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${shop.name || SHOP_NAME} <onboarding@resend.dev>`,
        to: recipients,
        subject: `${shop.name || SHOP_NAME} — today: ${g.appts.length} appointment${g.appts.length === 1 ? "" : "s"}`,
        html: briefHtml(g),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      results.push({ shop: shop.id, appts: g.appts.length, emailed: false, note: body?.message || `send ${res.status}` });
      continue;
    }
    results.push({
      shop: shop.id,
      appts: g.appts.length,
      lowStock: g.lowStock.length,
      expiring: g.expiring.length,
      emailed: true,
    });
  }
  return { feature: "morning_brief", shops: results };
}
