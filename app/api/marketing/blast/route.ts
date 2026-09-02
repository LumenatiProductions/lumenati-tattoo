import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSmsConfigured, normalizePhone, sendSms } from "@/lib/sms";
import { SHOP_NAME } from "@/lib/followups/templates";
import { emailFrom } from "@/lib/email/from";
import {
  isSegmentKey,
  reachable,
  segmentClients,
  SEGMENTS,
  type BlastChannel,
} from "@/lib/marketing/segments";

export const dynamic = "force-dynamic";

// One-off blasts to a client segment. Owner only, service-role reads/writes,
// always scoped to the caller's shop. Only consented clients with contact info
// for the channel are messaged; everyone else in the segment counts as skipped.
//   GET  : recent blast history for the shop
//   POST : { channel: 'email'|'sms', segment, subject?, body } send now

// Hard ceiling for one blast. Bigger lists need a proper campaign tool, not a
// sequential loop inside a request.
const MAX_RECIPIENTS = 500;

// Per-shop daily ceilings (trailing 24h) so a compromised or runaway owner
// session can't loop 500-recipient blasts without bound. Read off the blasts
// history table, so no new state. Fails open if the table isn't there yet.
const MAX_BLASTS_PER_DAY = 20;
const MAX_RECIPIENTS_PER_DAY = 2000;

// How many blasts the shop has fired and how many recipients they reached in the
// trailing 24h. sent+failed = actually attempted (skipped never got a message).
async function last24h(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  shopId: string,
): Promise<{ blasts: number; recipients: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("blasts")
    .select("sent_count, failed_count")
    .eq("shop_id", shopId)
    .gte("created_at", since);
  if (error || !data) return { blasts: 0, recipients: 0 };
  const recipients = data.reduce((n, r) => n + (r.sent_count ?? 0) + (r.failed_count ?? 0), 0);
  return { blasts: data.length, recipients };
}

const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);

async function shopNameFor(admin: NonNullable<ReturnType<typeof createAdminClient>>, shopId: string) {
  const { data } = await admin.from("shops").select("name").eq("id", shopId).maybeSingle();
  return (data?.name as string | undefined)?.trim() || SHOP_NAME;
}

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ blasts: [] });

  const { data, error } = await admin
    .from("blasts")
    .select("id, channel, segment, subject, body, sent_count, failed_count, skipped_count, created_at")
    .eq("shop_id", ctx.shopId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    // Table not created yet: the page just shows an empty history.
    return NextResponse.json({ blasts: [] });
  }
  return NextResponse.json({ blasts: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as {
    channel?: string;
    segment?: string;
    subject?: string;
    body?: string;
  };

  if (b.channel !== "email" && b.channel !== "sms") {
    return NextResponse.json({ error: "Pick text or email." }, { status: 400 });
  }
  const channel = b.channel as BlastChannel;
  if (!isSegmentKey(b.segment)) {
    return NextResponse.json({ error: "Pick who this goes to." }, { status: 400 });
  }
  const body = (b.body ?? "").trim();
  if (!body) {
    return NextResponse.json({ error: "Write the message first." }, { status: 400 });
  }
  const subject = (b.subject ?? "").trim();
  if (channel === "email" && !subject) {
    return NextResponse.json({ error: "Email needs a subject line." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is not fully set up yet." }, { status: 500 });
  }

  // Channel not switched on yet: succeed quietly with a plain note so the
  // page can explain instead of erroring.
  const emailReady = !!process.env.RESEND_API_KEY;
  if (channel === "sms" && !isSmsConfigured) {
    return NextResponse.json({
      sent: 0,
      failed: 0,
      skipped: 0,
      note: "Texting is not switched on for the shop yet, so nothing went out.",
    });
  }
  if (channel === "email" && !emailReady) {
    return NextResponse.json({
      sent: 0,
      failed: 0,
      skipped: 0,
      note: "Email is not switched on for the shop yet, so nothing went out.",
    });
  }

  const everyone = await segmentClients(admin, ctx.shopId, b.segment);
  const members = everyone.filter((c) => reachable(c, channel));
  const skipped = everyone.length - members.length;

  if (members.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      {
        error: `That group is ${members.length} people, over the ${MAX_RECIPIENTS} person limit for one blast. Pick a smaller group.`,
      },
      { status: 400 },
    );
  }

  // Daily ceilings: stop a runaway loop before it sends the next batch.
  const day = await last24h(admin, ctx.shopId);
  if (day.blasts >= MAX_BLASTS_PER_DAY) {
    return NextResponse.json(
      {
        error: `You've sent ${day.blasts} blasts in the last 24 hours, which is the daily limit. Try again tomorrow.`,
      },
      { status: 429 },
    );
  }
  if (day.recipients + members.length > MAX_RECIPIENTS_PER_DAY) {
    return NextResponse.json(
      {
        error: `This would put you over ${MAX_RECIPIENTS_PER_DAY} people reached in 24 hours. Wait a bit before sending more.`,
      },
      { status: 429 },
    );
  }

  const shopName = await shopNameFor(admin, ctx.shopId);

  let sent = 0;
  let failed = 0;

  if (channel === "sms") {
    // Texts always say who they're from and how to opt out.
    let text = body;
    if (!text.toLowerCase().includes(shopName.toLowerCase())) text = `${shopName}: ${text}`;
    if (!/reply stop/i.test(text)) text = `${text} Reply STOP to opt out.`;
    for (const m of members) {
      const phone = normalizePhone(m.phone);
      if (!phone) {
        failed++;
        continue;
      }
      const r = await sendSms(phone, text);
      if (r.ok) sent++;
      else failed++;
    }
  } else {
    const key = process.env.RESEND_API_KEY!;
    const from = emailFrom(shopName);
    for (const m of members) {
      if (!m.email) {
        failed++;
        continue;
      }
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [m.email], subject, text: body }),
        });
        if (r.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
  }

  // Record the blast. If the history table isn't there yet the send already
  // happened: report the tallies and say history is unavailable.
  let note: string | undefined;
  const { error: insErr } = await admin.from("blasts").insert({
    shop_id: ctx.shopId,
    channel,
    segment: b.segment,
    subject: subject || null,
    body,
    sent_count: sent,
    failed_count: failed,
    skipped_count: skipped,
  });
  if (insErr) {
    note = isMissingTable(insErr.message)
      ? "Sent, but the history list is not set up yet, so this blast will not appear below."
      : "Sent, but this blast could not be saved to the history list.";
  }

  return NextResponse.json({
    sent,
    failed,
    skipped,
    segmentLabel: SEGMENTS.find((s) => s.key === b.segment)?.label,
    ...(note ? { note } : {}),
  });
}
