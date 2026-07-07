import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveTemplate,
  renderEmail,
  renderSms,
  FOLLOWUP_KINDS,
  type FollowupKind,
  type Template,
  SHOP_NAME,
} from "./templates";
import { isSmsConfigured, normalizePhone, sendSms } from "@/lib/sms";

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
async function loadTemplates(client: SupabaseClient): Promise<TemplateMap> {
  const { data } = await client
    .from("followup_templates")
    .select("kind, subject, body, lead_days, enabled");
  const byKind = new Map((data || []).map((r: { kind: string }) => [r.kind, r]));
  return Object.fromEntries(
    FOLLOWUP_KINDS.map((k) => [k, resolveTemplate(k, byKind.get(k) as Partial<Template>)]),
  ) as TemplateMap;
}

type EnqueueRow = {
  booking_id: string | null;
  client_id: string | null;
  kind: FollowupKind;
  channel: string;
  scheduled_for: string;
  status: string;
};

/**
 * Enqueue follow-ups that are now due to exist. Idempotent:
 *  - aftercare + review_request upsert on (booking_id, kind), so re-running over
 *    the same completed bookings never duplicates.
 *  - rebook_nudge + birthday have no booking_id, so they're de-duped here by
 *    client + time window before inserting.
 * Only enqueues kinds whose template is enabled. Safe to run with either the
 * service-role client (cron) or an owner session (the "Scan now" button).
 */
export async function enqueueFollowups(client: SupabaseClient, tpl: TemplateMap) {
  const t = today();
  const rows: EnqueueRow[] = [];

  // 1) aftercare + review_request + healed_photo off recently-completed bookings.
  if (tpl.aftercare.enabled || tpl.review_request.enabled || tpl.healed_photo.enabled) {
    // The healed-photo ask lands ~2 weeks out, so look back far enough that a
    // booking completed before the photo was due still gets one.
    const lookback = Math.max(ENQUEUE_LOOKBACK_DAYS, tpl.healed_photo.lead_days + 7);
    const cutoff = addDays(t, -lookback);
    const { data: bookings } = await client
      .from("bookings")
      .select("id, client_id, starts_at")
      .eq("status", "completed")
      .gte("starts_at", cutoff)
      .not("client_id", "is", null);

    for (const b of (bookings || []) as { id: string; client_id: string | null; starts_at: string }[]) {
      if (!b.client_id) continue;
      const visitDay = b.starts_at.slice(0, 10);
      if (tpl.aftercare.enabled && visitDay >= addDays(t, -ENQUEUE_LOOKBACK_DAYS)) {
        rows.push({
          booking_id: b.id,
          client_id: b.client_id,
          kind: "aftercare",
          channel: "email",
          // Immediately on detection — never before the visit day.
          scheduled_for: maxDate(t, visitDay),
          status: "pending",
        });
      }
      if (tpl.review_request.enabled && visitDay >= addDays(t, -ENQUEUE_LOOKBACK_DAYS)) {
        rows.push({
          booking_id: b.id,
          client_id: b.client_id,
          kind: "review_request",
          channel: "email",
          scheduled_for: maxDate(t, addDays(visitDay, tpl.review_request.lead_days)),
          status: "pending",
        });
      }
      if (tpl.healed_photo.enabled) {
        rows.push({
          booking_id: b.id,
          client_id: b.client_id,
          kind: "healed_photo",
          channel: "email",
          scheduled_for: maxDate(t, addDays(visitDay, tpl.healed_photo.lead_days)),
          status: "pending",
        });
      }
    }
  }

  // 1b) pre-appointment reminders off upcoming scheduled bookings. lead_days =
  // days BEFORE the visit. Texted when Twilio is on (channel is re-decided at
  // send time based on what the client actually has on file).
  if (tpl.reminder_48h.enabled || tpl.reminder_24h.enabled) {
    const horizon = addDays(t, 4); // covers both reminder windows
    const { data: upcoming } = await client
      .from("bookings")
      .select("id, client_id, starts_at")
      .eq("status", "scheduled")
      .gte("starts_at", t)
      .lte("starts_at", `${horizon}T23:59:59.999`)
      .not("client_id", "is", null);

    for (const b of (upcoming || []) as { id: string; client_id: string | null; starts_at: string }[]) {
      if (!b.client_id) continue;
      const visitDay = b.starts_at.slice(0, 10);
      for (const kind of ["reminder_48h", "reminder_24h"] as const) {
        if (!tpl[kind].enabled) continue;
        const sendDay = addDays(visitDay, -tpl[kind].lead_days);
        // Skip reminders whose window has already passed (booked last-minute).
        if (sendDay < t) continue;
        rows.push({
          booking_id: b.id,
          client_id: b.client_id,
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
      .upsert(rows, { onConflict: "booking_id,kind", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    enqueuedBooking = data?.length ?? 0;
  }

  // 2) rebook nudges for lapsed clients.
  let enqueuedRebook = 0;
  if (tpl.rebook_nudge.enabled) {
    enqueuedRebook = await enqueueRebookNudges(client, tpl.rebook_nudge.lead_days);
  }

  // 3) birthday outreach.
  let enqueuedBirthday = 0;
  if (tpl.birthday.enabled) {
    enqueuedBirthday = await enqueueBirthdays(client);
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
async function enqueueRebookNudges(client: SupabaseClient, lapseDays: number) {
  const t = today();
  const lapsedBefore = addDays(t, -lapseDays);
  const { data: clients } = await client
    .from("clients")
    .select("id, last_seen, email")
    .not("email", "is", null)
    .lt("last_seen", lapsedBefore);

  const candidates = (clients || []).filter(
    (c: { email: string | null }) => !!c.email,
  ) as { id: string }[];
  if (!candidates.length) return 0;

  const { data: recent } = await client
    .from("followups")
    .select("client_id")
    .eq("kind", "rebook_nudge")
    .gte("created_at", `${lapsedBefore}T00:00:00Z`);
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

  const { error } = await client.from("followups").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// Birthday today or within the next BIRTHDAY_WINDOW_DAYS. De-dupe: at most one
// birthday follow-up per client per calendar year.
async function enqueueBirthdays(client: SupabaseClient) {
  const now = new Date();
  const year = now.getUTCFullYear();
  // MM-DD strings for today..+window.
  const windowMd = new Set<string>();
  for (let i = 0; i <= BIRTHDAY_WINDOW_DAYS; i++) {
    windowMd.add(addDays(today(), i).slice(5)); // "MM-DD"
  }

  const { data: clients } = await client
    .from("clients")
    .select("id, birthdate, email")
    .not("birthdate", "is", null)
    .not("email", "is", null);

  const due = (clients || []).filter(
    (c: { birthdate: string | null; email: string | null }) =>
      !!c.email && !!c.birthdate && windowMd.has(c.birthdate.slice(5)),
  ) as { id: string }[];
  if (!due.length) return 0;

  const { data: thisYear } = await client
    .from("followups")
    .select("client_id")
    .eq("kind", "birthday")
    .gte("created_at", `${year}-01-01T00:00:00Z`);
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

  const { error } = await client.from("followups").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// --- sending ---

type FollowupRow = {
  id: string;
  booking_id?: string | null;
  client_id: string | null;
  kind: FollowupKind;
  channel: string;
  scheduled_for: string | null;
};

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

async function postResend(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false as const, error: "RESEND_API_KEY not set" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Set RESEND_FROM to a verified-domain address once the domain is moved
      // over (e.g. "Lumenati Tattoo <hello@lumenati.com>"); until then the
      // sandbox sender works for testing but lands in spam.
      from: process.env.RESEND_FROM || `${SHOP_NAME} <onboarding@resend.dev>`,
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
): Promise<{ status: "sent" | "skipped" | "failed"; result: string }> {
  const template = tpl[row.kind];
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

  // Reminder context: appointment time + artist, and a liveness check.
  const tokens: Parameters<typeof renderEmail>[1] = {
    first_name: contact.first_name,
    review_link: reviewLink(),
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
  const sent = await postResend(contact.email, subject, html);
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
export async function sendDueFollowups(client: SupabaseClient, tpl: TemplateMap) {
  const { data: due } = await client
    .from("followups")
    .select("id, booking_id, client_id, kind, channel, scheduled_for")
    .eq("status", "pending")
    .lte("scheduled_for", today());

  let sent = 0,
    skipped = 0,
    failed = 0;
  for (const row of (due || []) as FollowupRow[]) {
    const r = await sendFollowupRow(client, row, tpl);
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
  const tpl = await loadTemplates(client);
  const enqueued = await enqueueFollowups(client, tpl);

  const autosend = process.env.FOLLOWUPS_AUTOSEND === "true";
  const canSend = autosend && (isSmsConfigured || !!process.env.RESEND_API_KEY);
  const sent = canSend
    ? await sendDueFollowups(client, tpl)
    : { sent: 0, skipped: 0, failed: 0, due: 0 };

  return { feature: "followups", autosend: canSend, ...enqueued, sent };
}

// Re-exported for the API routes so they resolve templates the same way.
export { loadTemplates };
