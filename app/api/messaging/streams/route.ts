import { NextResponse } from "next/server";
import { resolveStaff } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSmsConfigured } from "@/lib/sms";
import {
  DEFAULT_TEMPLATES,
  FOLLOWUP_KINDS,
  KIND_LABEL,
  resolveTemplate,
  type FollowupKind,
  type Template,
} from "@/lib/followups/templates";
import type { MessageStream } from "@/lib/messaging/streams";

export const dynamic = "force-dynamic";

// The Sending page's data: every automatic message stream the shop runs and
// its switch. Owner only; all reads/writes use the service role scoped to the
// caller's shop (message_streams is a server-only table).
//   GET   : client streams (follow-up kinds), artist streams, master status
//   PATCH : { kind, enabled?, lead_days? } or { stream, enabled }

const ARTIST_STREAMS: { stream: MessageStream; label: string }[] = [
  { stream: "rent_nudges", label: "Rent reminders" },
  { stream: "weekly_summary", label: "Week in review" },
];

const isKind = (k: unknown): k is FollowupKind =>
  typeof k === "string" && (FOLLOWUP_KINDS as string[]).includes(k);
const isStream = (s: unknown): s is MessageStream =>
  s === "rent_nudges" || s === "weekly_summary";

const isMissingTable = (msg: string) => /relation .* does not exist|42P01/i.test(msg);

// "Fully on" the same way the jobs decide it: the automatic-send switches are
// flipped AND at least one real channel is live. Exposed only as a boolean;
// the page speaks plain English about it.
const masterOn = () =>
  (isSmsConfigured || !!process.env.RESEND_API_KEY) &&
  process.env.FOLLOWUPS_AUTOSEND === "true" &&
  process.env.RENT_AUTOSEND === "true";

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ clientStreams: [], artistStreams: [], masterOn: false });
  }

  // Shop templates over code defaults: exactly how the nightly job resolves.
  const { data: tplRows } = await admin
    .from("followup_templates")
    .select("kind, subject, body, lead_days, enabled")
    .eq("shop_id", ctx.shopId);
  const byKind = new Map((tplRows ?? []).map((r) => [r.kind as string, r]));

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const clientStreams = await Promise.all(
    FOLLOWUP_KINDS.map(async (kind) => {
      const tpl = resolveTemplate(kind, byKind.get(kind) as Partial<Template> | undefined);
      let sent30 = 0;
      const { count, error } = await admin
        .from("followups")
        .select("id", { count: "exact", head: true })
        .eq("shop_id", ctx.shopId)
        .eq("kind", kind)
        .eq("status", "sent")
        .gte("sent_at", since);
      if (!error && typeof count === "number") sent30 = count;
      return {
        kind,
        label: KIND_LABEL[kind],
        enabled: tpl.enabled,
        lead_days: tpl.lead_days,
        sent30,
      };
    }),
  );

  // Absent row (or absent table) = on, matching lib/messaging/streams.
  const { data: streamRows, error: streamErr } = await admin
    .from("message_streams")
    .select("stream, enabled")
    .eq("shop_id", ctx.shopId);
  const streamMap = new Map(
    streamErr ? [] : (streamRows ?? []).map((r) => [r.stream as string, !!r.enabled]),
  );
  const artistStreams = ARTIST_STREAMS.map(({ stream, label }) => ({
    stream,
    label,
    enabled: streamMap.get(stream) ?? true,
  }));

  return NextResponse.json({ clientStreams, artistStreams, masterOn: masterOn() });
}

export async function PATCH(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (ctx.role !== "owner") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "The server is not fully set up yet." }, { status: 500 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    kind?: string;
    stream?: string;
    enabled?: boolean;
    lead_days?: number;
  };

  // A follow-up kind's switch or timing. Only the fields sent change; subject
  // and body stay whatever the shop already saved (empty = code default), and
  // rows keep the same keying the job reads (one row per kind, shop-stamped).
  if (b.kind !== undefined) {
    if (!isKind(b.kind)) {
      return NextResponse.json({ error: "Unknown message type" }, { status: 400 });
    }
    if (b.enabled === undefined && b.lead_days === undefined) {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }

    const { data: existing, error: readErr } = await admin
      .from("followup_templates")
      .select("subject, body, lead_days, enabled")
      .eq("shop_id", ctx.shopId)
      .eq("kind", b.kind)
      .maybeSingle();
    if (readErr && isMissingTable(readErr.message)) {
      return NextResponse.json({ error: "This switch is not ready yet." }, { status: 503 });
    }

    const base = DEFAULT_TEMPLATES[b.kind];
    const row = {
      kind: b.kind,
      shop_id: ctx.shopId,
      subject: existing?.subject ?? "",
      body: existing?.body ?? "",
      lead_days:
        b.lead_days !== undefined
          ? Math.max(0, Math.round(b.lead_days))
          : ((existing?.lead_days as number | null) ?? base.lead_days),
      enabled: b.enabled ?? ((existing?.enabled as boolean | null) ?? base.enabled),
      updated_at: new Date().toISOString(),
    };
    const { error } = await admin.from("followup_templates").upsert(row, { onConflict: "shop_id,kind" });
    if (error) {
      if (isMissingTable(error.message)) {
        return NextResponse.json({ error: "This switch is not ready yet." }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, kind: b.kind, enabled: row.enabled, lead_days: row.lead_days });
  }

  // An artist-facing stream's switch.
  if (b.stream !== undefined) {
    if (!isStream(b.stream)) {
      return NextResponse.json({ error: "Unknown message stream" }, { status: 400 });
    }
    if (typeof b.enabled !== "boolean") {
      return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
    }
    const { error } = await admin.from("message_streams").upsert(
      {
        shop_id: ctx.shopId,
        stream: b.stream,
        enabled: b.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop_id,stream" },
    );
    if (error) {
      if (isMissingTable(error.message)) {
        return NextResponse.json({ error: "This switch is not ready yet." }, { status: 503 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, stream: b.stream, enabled: b.enabled });
  }

  return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
}
