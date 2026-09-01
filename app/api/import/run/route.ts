import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shopDayStartUtc } from "@/lib/dates";
import {
  parseCsv,
  detectMapping,
  detectKind,
  normalizePhoneLoose,
  normalizeEmail,
  splitName,
  truthy,
  parseDateLoose,
  parseTimeLoose,
  parseMoneyLoose,
  presetLabel,
  type Mapping,
  type Role,
} from "@/lib/import/csv";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;
const MAX_BYTES = 6 * 1024 * 1024;

// The write. Owner-only, service role, every row stamped with the caller's
// shop. Clients dedupe on phone, then email, then exact name; an existing
// person only gains blanks (we never overwrite what the shop typed). Marketing
// consent turns ON only when the file says the person opted in. Appointments
// land on a chair via the staff map; past ones become completed sessions with
// the price on the record (history, never P&L), future ones are scheduled.
export async function POST(req: Request) {
  const me = await resolveStaff(req);
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (me.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    csv?: string;
    preset?: string;
    mapping?: Partial<Record<Role, number | null>>;
    staffMap?: Record<string, string>;
    defaultArtistId?: string | null;
  };
  const csv = typeof b.csv === "string" ? b.csv : "";
  if (!csv.trim() || csv.length > MAX_BYTES) return NextResponse.json({ error: "Bad file." }, { status: 400 });
  const rows = parseCsv(csv);
  if (rows.length < 2) return NextResponse.json({ error: "Nothing to import." }, { status: 400 });
  const headers = rows[0].map((h) => h.trim());
  const auto = detectMapping(headers);
  const mapping: Mapping = { ...auto };
  for (const [role, idx] of Object.entries(b.mapping ?? {})) {
    if (idx == null || idx < 0) delete mapping[role as Role];
    else mapping[role as Role] = Number(idx);
  }
  const kind = detectKind(mapping);
  const data = rows.slice(1, 1 + MAX_ROWS);
  const from = presetLabel(b.preset ?? "other");
  const shopId = me.shopId;
  const cell = (r: string[], role: Role) => (mapping[role] != null ? (r[mapping[role]!] ?? "").trim() : "");

  // The shop's people, once, for dedupe.
  const { data: existingRows } = await admin
    .from("clients")
    .select("id, first_name, last_name, phone, email, last_seen, first_seen, total_spent_cents, marketing_ok")
    .eq("shop_id", shopId);
  type C = { id: string; first_name: string; last_name: string; phone: string | null; email: string | null; last_seen: string | null; first_seen: string | null; total_spent_cents: number; marketing_ok: boolean | null };
  const existing = (existingRows ?? []) as C[];
  const byPhone = new Map(existing.filter((c) => c.phone).map((c) => [c.phone as string, c]));
  const byEmail = new Map(existing.filter((c) => c.email).map((c) => [(c.email as string).toLowerCase(), c]));
  const byName = new Map(existing.map((c) => [`${c.first_name} ${c.last_name}`.trim().toLowerCase(), c]));

  const personOf = (r: string[]) => {
    let first = cell(r, "first_name");
    let last = cell(r, "last_name");
    if (!first && !last) ({ first, last } = splitName(cell(r, "full_name")));
    return {
      first,
      last,
      phone: normalizePhoneLoose(cell(r, "phone")),
      email: normalizeEmail(cell(r, "email")),
    };
  };

  // Find-or-create a client; returns the id and whether it was new. Blanks on
  // an existing row fill in; nothing already set is touched.
  const added: string[] = [];
  let updated = 0;
  const upsertClient = async (r: string[], visit?: { day: string | null; spentCents: number }) => {
    const p = personOf(r);
    if (!p.first && !p.last && !p.phone && !p.email) return null;
    const found = (p.phone && byPhone.get(p.phone)) || (p.email && byEmail.get(p.email)) || byName.get(`${p.first} ${p.last}`.trim().toLowerCase()) || null;
    const lastVisit = visit?.day ?? parseDateLoose(cell(r, "last_visit"));
    const firstVisit = parseDateLoose(cell(r, "first_visit"));
    const spent = visit ? visit.spentCents : parseMoneyLoose(cell(r, "total_spent"));
    const optIn = mapping.opt_in != null ? truthy(cell(r, "opt_in")) : false;
    if (found) {
      const patch: Record<string, unknown> = {};
      if (!found.phone && p.phone) patch.phone = p.phone;
      if (!found.email && p.email) patch.email = p.email;
      if (lastVisit && (!found.last_seen || lastVisit > found.last_seen)) patch.last_seen = lastVisit;
      if (firstVisit && (!found.first_seen || firstVisit < found.first_seen)) patch.first_seen = firstVisit;
      if (visit && visit.spentCents > 0) patch.total_spent_cents = (found.total_spent_cents ?? 0) + visit.spentCents;
      else if (!visit && spent > 0 && !(found.total_spent_cents > 0)) patch.total_spent_cents = spent;
      if (optIn && !found.marketing_ok) {
        patch.marketing_ok = true;
        patch.marketing_ok_at = new Date().toISOString();
      }
      if (Object.keys(patch).length) {
        await admin.from("clients").update(patch).eq("id", found.id).eq("shop_id", shopId);
        Object.assign(found, patch);
        updated++;
      }
      return found.id;
    }
    const id = `cl-${randomUUID()}`;
    const notes = [cell(r, "notes"), `Imported from ${from}.`].filter(Boolean).join("\n");
    const birthday = parseDateLoose(cell(r, "birthday"));
    const row: Record<string, unknown> = {
      id,
      shop_id: shopId,
      first_name: p.first || "Client",
      last_name: p.last,
      phone: p.phone,
      email: p.email,
      instagram: cell(r, "instagram").replace(/^@/, "") || null,
      notes,
      source: "import",
      last_seen: lastVisit,
      first_seen: firstVisit ?? lastVisit,
      total_spent_cents: spent,
      ...(birthday ? { birthdate: birthday } : {}),
      ...(optIn ? { marketing_ok: true, marketing_ok_at: new Date().toISOString() } : {}),
    };
    const { error } = await admin.from("clients").insert(row);
    if (error) {
      // Optional columns (birthdate/marketing_ok) can be absent on an older
      // schema; retry with the core fields so one column never blocks a person.
      const { error: e2 } = await admin.from("clients").insert({
        id, shop_id: shopId, first_name: row.first_name, last_name: row.last_name, phone: p.phone, email: p.email, notes, source: "import", last_seen: lastVisit, first_seen: firstVisit ?? lastVisit, total_spent_cents: spent,
      });
      if (e2) return null;
    }
    const c: C = { id, first_name: row.first_name as string, last_name: row.last_name as string, phone: p.phone, email: p.email, last_seen: lastVisit, first_seen: firstVisit ?? lastVisit, total_spent_cents: spent, marketing_ok: optIn };
    if (p.phone) byPhone.set(p.phone, c);
    if (p.email) byEmail.set(p.email, c);
    byName.set(`${c.first_name} ${c.last_name}`.trim().toLowerCase(), c);
    added.push(id);
    return id;
  };

  if (kind === "clients") {
    let skipped = 0;
    for (const r of data) {
      const id = await upsertClient(r);
      if (!id) skipped++;
    }
    return NextResponse.json({ ok: true, kind, added: added.length, updated, skipped, rows: data.length });
  }

  // ── Appointments ──
  const staffMap = b.staffMap ?? {};
  const defaultArtist = b.defaultArtistId ?? null;
  const { data: chairs } = await admin.from("artists").select("id").eq("shop_id", shopId);
  const chairIds = new Set((chairs ?? []).map((a) => a.id as string));
  const tz = process.env.SHOP_TIMEZONE || "America/Denver";
  const nowIso = new Date().toISOString();
  let booked = 0,
    past = 0,
    skipped = 0,
    dup = 0;
  const seen = new Set<string>();
  // Existing (client, start) pairs so a re-run never doubles the book.
  const { data: existingBk } = await admin.from("bookings").select("client_id, starts_at").eq("shop_id", shopId).eq("source", "import");
  for (const bk of (existingBk ?? []) as { client_id: string | null; starts_at: string }[]) seen.add(`${bk.client_id}|${new Date(bk.starts_at).toISOString()}`);

  for (const r of data) {
    let startIso: string | null = null;
    const dt = cell(r, "datetime");
    if (dt) {
      const day = parseDateLoose(dt);
      const mins = parseTimeLoose(dt.replace(/^\S+\s*/, "")) ?? parseTimeLoose(dt);
      if (day) startIso = new Date(Date.parse(shopDayStartUtc(day, tz)) + (mins ?? 12 * 60) * 60000).toISOString();
    } else {
      const day = parseDateLoose(cell(r, "date"));
      const mins = parseTimeLoose(cell(r, "time"));
      if (day) startIso = new Date(Date.parse(shopDayStartUtc(day, tz)) + (mins ?? 12 * 60) * 60000).toISOString();
    }
    if (!startIso) {
      skipped++;
      continue;
    }
    const status = cell(r, "status").toLowerCase();
    if (/cancel|no.?show|declin/.test(status)) {
      skipped++;
      continue;
    }
    const isPast = startIso < nowIso;
    const price = parseMoneyLoose(cell(r, "price"));
    const clientId = await upsertClient(r, isPast ? { day: startIso.slice(0, 10), spentCents: price } : undefined);
    if (!clientId) {
      skipped++;
      continue;
    }
    const key = `${clientId}|${startIso}`;
    if (seen.has(key)) {
      dup++;
      continue;
    }
    seen.add(key);
    const staffName = cell(r, "staff");
    const artistId = (staffName && staffMap[staffName]) || defaultArtist;
    const { error } = await admin.from("bookings").insert({
      id: `bk-${randomUUID()}`,
      shop_id: shopId,
      client_id: clientId,
      artist_id: artistId && chairIds.has(artistId) ? artistId : null,
      starts_at: startIso,
      status: isPast ? "completed" : "scheduled",
      confirmed_at: isPast ? null : nowIso,
      service_desc: cell(r, "service").slice(0, 200) || null,
      est_price_cents: price,
      deposit_cents: 0,
      deposit_status: "none",
      notes: `Imported from ${from}.`,
      source: "import",
    });
    if (error) skipped++;
    else if (isPast) past++;
    else booked++;
  }
  return NextResponse.json({ ok: true, kind, added: added.length, updated, booked, past, skipped, duplicates: dup, rows: data.length });
}
