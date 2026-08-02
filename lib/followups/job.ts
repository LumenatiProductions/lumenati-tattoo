import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveTemplate,
  overlayArtist,
  renderEmail,
  renderSms,
  FOLLOWUP_KINDS,
  type FollowupKind,
  type Template,
  SHOP_NAME,
} from "./templates";
import { isSmsConfigured, normalizePhone, sendSms } from "@/lib/sms";
import { logOpsEvent } from "@/lib/ops-events";

// Don't backfill ancient history: only completed bookings within this window get
// auto-enqueued, so the first run can't blast months of old clients.
const ENQUEUE_LOOKBACK_DAYS = 14;
// Birthday outreach fires when the birthday is today or within this many days.
const BIRTHDAY_WINDOW_DAYS = 2;

// --- small date helpers (DB `date` columns are YYYY-MM-DD strings) ---
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const today = () => isoDate(new Date());
const addDays = (dateStr: string, n: number) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};
const maxDate = (a: string, b: string) => (a >= b ? a : b);

// The Google review link comes from Scott (env), surfaced via the {{review_link}}
// token. The desk can also paste it straight into the template body.
const reviewLink = () => process.env.GOOGLE_REVIEW_URL || "";

type TemplateMap = Record<FollowupKind, Template>;

// Resolve every kind's template (DB edits over code defaults) in one read.
// `shopId` scopes the read on the service-role (cron) path; the cookie-client
// path omits it and lets RLS scope instead.
async function loadTemplates(client: SupabaseClient, shopId?: string): Promise<TemplateMap> {
  let q = client.from("followup_templates").select("kind, subject, body, lead_days, enabled");
  if (shopId) q = q.eq("shop_id", shopId);
  const { data } = await q;
  const byKind = new Map((data || []).map((r: { kind: string }) => [r.kind, r]));
  return Object.fromEntries(
    FOLLOWUP_KINDS.map((k) => [k, resolveTemplate(k, byKind.get(k) as Partial<Template>)]),
  ) as TemplateMap;
}

// Per-artist overrides, keyed artist -> kind -> the followup_prefs row's fields.
export type ArtistPrefs = Map<string, Map<FollowupKind, Partial<Template>>>;

// Load every artist's follow-up overrides for the shop (or, on the cookie path,
// whatever RLS scopes to). Used to resolve each follow-up's artist-specific
// timing + copy on top of the shop template.
async function loadArtistPrefs(client: SupabaseClient, shopId?: string): Promise<ArtistPrefs> {
  let q = client.from("followup_prefs").select("artist_id, kind, subject, body, lead_days, enabled");
  if (shopId) q = q.eq("shop_id", shopId);
  const { data } = await q;
  const map: ArtistPrefs = new Map();
  for (const r of (data ?? []) as (Partial<Template> & { artist_id: string; kind: FollowupKind })[]) {
    if (!map.has(r.artist_id)) map.set(r.artist_id, new Map());
    map.get(r.artist_id)!.set(r.kind, r);
  }
  return map;
}

// The resolved template for a booking's artist: code default -> shop -> artist.
function templateFor(
  shopTpl: TemplateMap,
  prefs: ArtistPrefs,
  artistId: string | null | undefined,
  kind: FollowupKind,
): Template {
  const pref = artistId ? prefs.get(artistId)?.get(kind) : null;
  return overlayArtist(shopTpl[kind], pref);
}

type EnqueueRow = {
  booking_id: string | null;
  client_id: string | null;
  artist_id?: string | null;
  kind: FollowupKind;
  channel: string;
  scheduled_for: string;
  status: string;
  shop_id?: string;
};

// Cron inserts must carry the source row's shop_id explicitly (service role
// bypasses RLS and the column default is Lumenati's).
const stamp = (rows: EnqueueRow[], shopId?: string) =>
  shopId ? rows.map((r) => ({ ...r, shop_id: shopId })) : rows;

/**
 * The one-tap close-out (page-walk note 8): queue the drip for ONE booking the
 * moment the artist closes it out — no waiting for the nightly scan. Same rows
 * and idempotency as enqueueFollowups (upsert on booking_id+kind), so the scan
 * running later never duplicates. Returns the kinds actually queued so the app
 * can say "aftercare drip started" honestly.
 */
export async function enqueueForBooking(
  client: SupabaseClient,
  bookingId: string,
  shopId: string,
): Promise<{ queued: FollowupKind[]; reason?: string }> {
  const tpl = await loadTemplates(client, shopId);
  const prefs = await loadArtistPrefs(client, shopId);
  const { data: b } = await client
    .from("bookings")
    .select("id, client_id, starts_at, artist_id")
    .eq("id", bookingId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (!b) return { queued: [], reason: "Booking not found" };
  if (!b.client_id) return { queued: [], reason: "No client on the booking — nobody to message" };

  const t = today();
  const visitDay = (b.starts_at as string).slice(0, 10);
  const artistId = (b.artist_id as string | null) ?? null;
  // Resolve each kind for THIS booking's artist (their timing + copy, inheriting
  // the shop default). Stamp the artist on the row so the send resolves the same.
  const tf = (kind: FollowupKind) => templateFor(tpl, prefs, artistId, kind);
  const rows: EnqueueRow[] = [];
  if (tf("aftercare").enabled) {
    rows.push({
      booking_id: b.id as string,
      client_id: b.client_id as string,
      artist_id: artistId,
      kind: "aftercare",
      channel: "email",
      scheduled_for: maxDate(t, visitDay),
      status: "pending",
    });
  }
  if (tf("review_request").enabled) {
    rows.push({
      booking_id: b.id as string,
      client_id: b.client_id as string,
      artist_id: artistId,
      kind: "review_request",
      channel: "email",
      scheduled_for: maxDate(t, addDays(visitDay, tf("review_request").lead_days)),
      status: "pending",
    });
  }
  if (tf("healed_photo").enabled) {
    rows.push({
      booking_id: b.id as string,
      client_id: b.client_id as string,
      artist_id: artistId,
      kind: "healed_photo",
      channel: "email",
      scheduled_for: maxDate(t, addDays(visitDay, tf("healed_photo").lead_days)),
      status: "pending",
    });
  }
  if (rows.length) {
    const { error } = await client
      .from("followups")
      .upsert(stamp(rows, shopId), { onConflict: "booking_id,kind", ignoreDuplicates: true });
    if (error) return { queued: [], reason: error.message };
  }
  return { queued: rows.map((r) => r.kind) };
}

/**
 * Enqueue follow-ups that are now due to exist. Idempotent:
 *  - aftercare + review_request upsert on (booking_id, kind), so re-running over
 *    the same completed bookings never duplicates.
 *  - rebook_nudge + birthday have no booking_id, so they're de-duped here by
 *    client + time window before inserting.
 * Only enqueues kinds whose template is enabled. Safe to run with either the
 * service-role client (cron) or an owner session (the "Scan now" button).
 */
export async function enqueueFollowups(client: SupabaseClient, tpl: TemplateMap, shopId?: string) {
  const t = today();
  const prefs = await loadArtistPrefs(client, shopId);
  const rows: EnqueueRow[] = [];

  // 1) aftercare + review_request + healed_photo off recently-completed bookings,
  // resolved PER the booking's artist (their timing + on/off, inheriting the shop
  // default). We always scan the window and decide per booking rather than a
  // shop-wide gate, so an artist who turned a kind on that the shop left off is
  // still honored.
  {
    // Look back far enough to still catch a booking whose healed-photo ask (the
    // longest lead) hadn't come due — across the shop default AND any artist who
    // pushed their healed lead out.
    const healedLeads = [tpl.healed_photo.lead_days];
    for (const byKind of prefs.values()) {
      const l = byKind.get("healed_photo")?.lead_days;
      if (typeof l === "number") healedLeads.push(l);
    }
    const lookback = Math.max(ENQUEUE_LOOKBACK_DAYS, Math.max(...healedLeads) + 7);
    const cutoff = addDays(t, -lookback);
    let bq = client
      .from("bookings")
      .select("id, client_id, starts_at, artist_id")
      .eq("status", "completed")
      .gte("starts_at", cutoff)
      .not("client_id", "is", null);
    if (shopId) bq = bq.eq("shop_id", shopId);
    const { data: bookings } = await bq;

    for (const b of (bookings || []) as { id: string; client_id: string | null; starts_at: string; artist_id: string | null }[]) {
      if (!b.client_id) continue;
      const visitDay = b.starts_at.slice(0, 10);
      const tf = (kind: FollowupKind) => templateFor(tpl, prefs, b.artist_id, kind);
      const base = { booking_id: b.id, client_id: b.client_id, artist_id: b.artist_id ?? null, channel: "email", status: "pending" };
      if (tf("aftercare").enabled && visitDay >= addDays(t, -ENQUEUE_LOOKBACK_DAYS)) {
        // Immediately on detection — never before the visit day.
        rows.push({ ...base, kind: "aftercare", scheduled_for: maxDate(t, visitDay) });
      }
      if (tf("review_request").enabled && visitDay >= addDays(t, -ENQUEUE_LOOKBACK_DAYS)) {
        rows.push({ ...base, kind: "review_request", scheduled_for: maxDate(t, addDays(visitDay, tf("review_request").lead_days)) });
      }
      if (tf("healed_photo").enabled) {
        rows.push({ ...base, kind: "healed_photo", scheduled_for: maxDate(t, addDays(visitDay, tf("healed_photo").lead_days)) });
      }
    }
  }

  // 1b) pre-appointment reminders off upcoming scheduled bookings. lead_days =
  // days BEFORE the visit, resolved per the booking's artist. Texted when Twilio
  // is on (channel is re-decided at send time based on what the client has).
  {
    const horizon = addDays(t, 4); // covers both reminder windows
    let uq = client
      .from("bookings")
      .select("id, client_id, starts_at, artist_id")
      .eq("status", "scheduled")
      .gte("starts_at", t)
      .lte("starts_at", `${horizon}T23:59:59.999`)
      .not("client_id", "is", null);
    if (shopId) uq = uq.eq("shop_id", shopId);
    const { data: upcoming } = await uq;

    for (const b of (upcoming || []) as { id: string; client_id: string | null; starts_at: string; artist_id: string | null }[]) {
      if (!b.client_id) continue;
      const visitDay = b.starts_at.slice(0, 10);
      for (const kind of ["reminder_48h", "reminder_24h"] as const) {
        const resolved = templateFor(tpl, prefs, b.artist_id, kind);
        if (!resolved.enabled) continue;
        const sendDay = addDays(visitDay, -resolved.lead_days);
        // Skip reminders whose window has already passed (booked last-minute).
        if (sendDay < t) continue;
        rows.push({
          booking_id: b.id,
          client_id: b.client_id,
          artist_id: b.artist_id ?? null,
          kind,
          channel: isSmsConfigured ? "sms" : "email",
          scheduled_for: sendDay,
          status: "pending",
        });
      }
    }
  }

  let enqueuedBooking = 0;
  if (rows.length) {
    // ignoreDuplicates: leave any existing follow-up (and its sent/skip state)
    // untouched; only brand-new (booking, kind) pairs are inserted.
    const { data, error } = await client
      .from("followups")
      .upsert(stamp(rows, shopId), { onConflict: "booking_id,kind", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    enqueuedBooking = data?.length ?? 0;
  }

  // 2) rebook nudges for lapsed clients.
  let enqueuedRebook = 0;
  if (tpl.rebook_nudge.enabled) {
    enqueuedRebook = await enqueueRebookNudges(client, tpl.rebook_nudge.lead_days, shopId);
  }

  // 3) birthday outreach.
  let enqueuedBirthday = 0;
  if (tpl.birthday.enabled) {
    enqueuedBirthday = await enqueueBirthdays(client, shopId);
  }

  return {
    enqueued: enqueuedBooking + enqueuedRebook + enqueuedBirthday,
    aftercareReview: enqueuedBooking,
    rebook: enqueuedRebook,
    birthday: enqueuedBirthday,
  };
}

// Lapsed = no visit in `lapseDays`. De-dupe: skip a client who already has a
// rebook_nudge created within the same lapse window (so we nudge at most once
// per window, not every night).
async function enqueueRebookNudges(client: SupabaseClient, lapseDays: number, shopId?: string) {
  const t = today();
  const lapsedBefore = addDays(t, -lapseDays);
  let cq = client
    .from("clients")
    .select("id, last_seen, email")
    .not("email", "is", null)
    .lt("last_seen", lapsedBefore);
  if (shopId) cq = cq.eq("shop_id", shopId);
  const { data: clients } = await cq;

  const candidates = (clients || []).filter(
    (c: { email: string | null }) => !!c.email,
  ) as { id: string }[];
  if (!candidates.length) return 0;

  let rq = client
    .from("followups")
    .select("client_id")
    .eq("kind", "rebook_nudge")
    .gte("created_at", `${lapsedBefore}T00:00:00Z`);
  if (shopId) rq = rq.eq("shop_id", shopId);
  const { data: recent } = await rq;
  const nudged = new Set((recent || []).map((r: { client_id: string | null }) => r.client_id));

  const rows: EnqueueRow[] = candidates
    .filter((c) => !nudged.has(c.id))
    .map((c) => ({
      booking_id: null,
      client_id: c.id,
      kind: "rebook_nudge",
      channel: "email",
      scheduled_for: t,
      status: "pending",
    }));
  if (!rows.length) return 0;

  const { error } = await client.from("followups").insert(stamp(rows, shopId));
  if (error) throw new Error(error.message);
  return rows.length;
}

// Birthday today or within the next BIRTHDAY_WINDOW_DAYS. De-dupe: at most one
// birthday follow-up per client per calendar year.
async function enqueueBirthdays(client: SupabaseClient, shopId?: string) {
  const now = new Date();
  const year = now.getUTCFullYear();
  // MM-DD strings for today..+window.
  const windowMd = new Set<string>();
  for (let i = 0; i <= BIRTHDAY_WINDOW_DAYS; i++) {
    windowMd.add(addDays(today(), i).slice(5)); // "MM-DD"
  }

  let cq = client
    .from("clients")
    .select("id, birthdate, email")
    .not("birthdate", "is", null)
    .not("email", "is", null);
  if (shopId) cq = cq.eq("shop_id", shopId);
  const { data: clients } = await cq;

  const due = (clients || []).filter(
    (c: { birthdate: string | null; email: string | null }) =>
      !!c.email && !!c.birthdate && windowMd.has(c.birthdate.slice(5)),
  ) as { id: string }[];
  if (!due.length) return 0;

  let yq = client
    .from("followups")
    .select("client_id")
    .eq("kind", "birthday")
    .gte("created_at", `${year}-01-01T00:00:00Z`);
  if (shopId) yq = yq.eq("shop_id", shopId);
  const { data: thisYear } = await yq;
  const already = new Set((thisYear || []).map((r: { client_id: string | null }) => r.client_id));

  const rows: EnqueueRow[] = due
    .filter((c) => !already.has(c.id))
    .map((c) => ({
      booking_id: null,
      client_id: c.id,
      kind: "birthday",
      channel: "email",
      scheduled_for: today(),
      status: "pending",
    }));
  if (!rows.length) return 0;

  const { error } = await client.from("followups").insert(stamp(rows, shopId));
  if (error) throw new Error(error.message);
  return rows.length;
}

// --- sending ---

type FollowupRow = {
  id: string;
  booking_id?: string | null;
  client_id: string | null;
  artist_id?: string | null;
  kind: FollowupKind;
  channel: string;
  scheduled_for: string | null;
  shop_id?: string | null;
};

// Client-facing messages must sign with the sending shop's name, not Lumenati.
// Cheap per-run cache keyed by shop_id (a drain is a handful of shops at most).
const shopNameCache = new Map<string, string>();
async function shopNameFor(client: SupabaseClient, shopId: string | null | undefined): Promise<string> {
  if (!shopId) return SHOP_NAME;
  const hit = shopNameCache.get(shopId);
  if (hit) return hit;
  const { data } = await client.from("shops").select("name").eq("id", shopId).maybeSingle();
  const name = (data?.name as string | undefined)?.trim() || SHOP_NAME;
  shopNameCache.set(shopId, name);
  return name;
}

const REMINDER_KINDS: FollowupKind[] = ["reminder_48h", "reminder_24h"];

// "Tue Jun 16 at 2:00 PM" in the shop's timezone for reminder copy.
const SHOP_TZ = process.env.SHOP_TIMEZONE || "America/Denver";
const apptTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOP_TZ,
  });

async function postResend(to: string, subject: string, html: string, fromName?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false as const, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // RESEND_FROM (once a verified domain is moved over) wins; otherwise the
      // sandbox sender is labelled with the sending shop's name so a client of
      // another shop never sees "Lumenati" as the sender.
      from: process.env.RESEND_FROM || `${fromName?.trim() || SHOP_NAME} <onboarding@resend.dev>`,
      to: [to],
      subject,
      html,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: body?.message || `Send failed (${res.status})` };
  return { ok: true as const, id: body?.id as string | undefined };
}

// Deliver one follow-up: render its template against the client and send it.
// Channel preference: SMS when the row asks for it AND Twilio + a phone exist;
// otherwise email; otherwise skip. Reminders also re-check the booking so a
// cancelled session never gets a "see you tomorrow" text. Marks the row
// sent / skipped / failed (and the channel actually used). Shared by the daily
// drain and the manual "send now" button.
export async function sendFollowupRow(
  client: SupabaseClient,
  row: FollowupRow,
  tpl: TemplateMap,
  prefs?: ArtistPrefs,
): Promise<{ status: "sent" | "skipped" | "failed"; result: string }> {
  // Render with the artist's copy (their subject/body override, inheriting the
  // shop template). Callers that don't pass prefs (single manual send) fall back
  // to the shop template — still correct, just not artist-personalized.
  const template = templateFor(tpl, prefs ?? new Map(), row.artist_id, row.kind);
  if (!template.enabled) {
    return finalize(client, row.id, "skipped", "Template disabled");
  }

  let contact: { first_name: string | null; email: string | null; phone: string | null } | null = null;
  if (row.client_id) {
    const { data } = await client
      .from("clients")
      .select("first_name, email, phone")
      .eq("id", row.client_id)
      .maybeSingle();
    contact = data;
  }
  const phone = normalizePhone(contact?.phone);
  if (!contact || (!contact.email && !phone)) {
    return finalize(client, row.id, "skipped", "No email or mobile on file");
  }

  const shopName = await shopNameFor(client, row.shop_id);

  // Reminder context: appointment time + artist, and a liveness check.
  const tokens: Parameters<typeof renderEmail>[1] = {
    first_name: contact.first_name,
    review_link: reviewLink(),
    shop_name: shopName,
  };
  if (row.kind === "healed_photo") {
    // The followup's own uuid is the upload capability — see /api/healed.
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lumenati-tattoo.vercel.app";
    tokens.healed_link = `${base}/healed/${row.id}`;
  }
  if (row.kind === "aftercare") {
    // Same capability pattern: this row's uuid opens the client's day-by-day
    // care timeline (/care/<id> — see /api/care).
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://lumenati-tattoo.vercel.app";
    tokens.care_link = `${base}/care/${row.id}`;
  }
  if (REMINDER_KINDS.includes(row.kind)) {
    if (!row.booking_id) return finalize(client, row.id, "skipped", "Reminder has no booking");
    const { data: bk } = await client
      .from("bookings")
      .select("starts_at, status, artist_id")
      .eq("id", row.booking_id)
      .maybeSingle();
    if (!bk || bk.status !== "scheduled") {
      return finalize(client, row.id, "skipped", `Booking is ${bk?.status ?? "gone"} — reminder dropped`);
    }
    tokens.appointment_time = apptTime(bk.starts_at as string);
    if (bk.artist_id) {
      const { data: a } = await client.from("artists").select("name").eq("id", bk.artist_id).maybeSingle();
      tokens.artist_name = (a?.name as string) ?? null;
    }
  }

  // Try SMS first when the row wants it; fall back to email rather than fail.
  if (row.channel === "sms" && isSmsConfigured && phone) {
    const sms = await sendSms(phone, renderSms(template, tokens));
    if (sms.ok) return finalize(client, row.id, "sent", sms.sid || "sent", "sms");
    if (!contact.email) return finalize(client, row.id, "failed", sms.error);
    // fall through to email with the SMS error noted
  }

  if (!contact.email) {
    return finalize(client, row.id, "skipped", "No client email on file (SMS unavailable)");
  }
  const { subject, html } = renderEmail(template, tokens);
  const sent = await postResend(contact.email, subject, html, shopName);
  if (!sent.ok) {
    return finalize(client, row.id, "failed", sent.error);
  }
  return finalize(client, row.id, "sent", sent.id || "sent", "email");
}

async function finalize(
  client: SupabaseClient,
  id: string,
  status: "sent" | "skipped" | "failed",
  result: string,
  channelUsed?: "email" | "sms",
) {
  await client
    .from("followups")
    .update({
      status,
      result,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      ...(channelUsed ? { channel: channelUsed } : {}),
    })
    .eq("id", id);
  return { status, result };
}

// Drain everything due today (pending + scheduled_for <= today, any channel).
export async function sendDueFollowups(client: SupabaseClient, tpl: TemplateMap, shopId?: string) {
  const prefs = await loadArtistPrefs(client, shopId);
  let dq = client
    .from("followups")
    .select("id, booking_id, client_id, artist_id, kind, channel, scheduled_for, shop_id")
    .eq("status", "pending")
    .lte("scheduled_for", today());
  if (shopId) dq = dq.eq("shop_id", shopId);
  const { data: due } = await dq;

  let sent = 0,
    skipped = 0,
    failed = 0;
  for (const row of (due || []) as FollowupRow[]) {
    const r = await sendFollowupRow(client, row, tpl, prefs);
    if (r.status === "sent") sent++;
    else if (r.status === "skipped") skipped++;
    else failed++;
  }
  return { sent, skipped, failed, due: due?.length ?? 0 };
}

/**
 * Daily ops job. Always enqueues (no external send, safe). Automated sending is
 * gated behind FOLLOWUPS_AUTOSEND === "true" AND a configured channel — Twilio
 * (SMS, preferred for rebooking) OR Resend (email). So the queue fills up but
 * nothing goes out until Scott flips the switch and at least one channel is
 * live. Manual "send now" from the page always works.
 */
export async function runDailyJob(admin: unknown) {
  const client = admin as SupabaseClient;
  const autosend = process.env.FOLLOWUPS_AUTOSEND === "true";
  const canSend = autosend && (isSmsConfigured || !!process.env.RESEND_API_KEY);

  // Service role bypasses RLS, so each shop gets its own scoped pass: its own
  // templates, its own bookings/clients, and inserts stamped with its shop_id.
  const { data: shops } = await client.from("shops").select("id");
  const results: Record<string, unknown>[] = [];
  for (const s of (shops ?? []) as { id: string }[]) {
    const tpl = await loadTemplates(client, s.id);
    const enqueued = await enqueueFollowups(client, tpl, s.id);
    const sent = canSend
      ? await sendDueFollowups(client, tpl, s.id)
      : { sent: 0, skipped: 0, failed: 0, due: 0 };
    if (sent.failed > 0) {
      await logOpsEvent(client, {
        shopId: s.id,
        kind: "sms_failed",
        severity: "warn",
        summary: `${sent.failed} client follow-up${sent.failed === 1 ? "" : "s"} failed to send`,
        detail: `Nightly follow-up run: ${sent.sent} sent, ${sent.failed} failed of ${sent.due} due.`,
      });
    }
    results.push({ shop: s.id, ...enqueued, sent });
  }

  return { feature: "followups", autosend: canSend, shops: results };
}

// Re-exported for the API routes so they resolve templates the same way.
export { loadTemplates };
