import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { loadTemplates } from "@/lib/followups/job";
import {
  ARTIST_FOLLOWUP_KINDS,
  KIND_LABEL,
  overlayArtist,
  type FollowupKind,
  type Template,
} from "@/lib/followups/templates";

export const dynamic = "force-dynamic";

// An artist controls the timing + copy of their OWN follow-ups. Overrides live in
// followup_prefs (any field null = inherit the shop default). This resolves the
// chain code default -> shop template -> artist override so the app can show
// what's live, what the shop's default is, and whether the artist has changed it.
// Cookie-or-Bearer; scoped to the caller's own artist_id. Owners manage the shop
// templates on the web instead, so this is artist-only.

function isArtistKind(k: string): k is FollowupKind {
  return (ARTIST_FOLLOWUP_KINDS as string[]).includes(k);
}

// Whose follow-ups the caller may touch. An artist only ever their own; an owner
// may name any artist in their shop (that's how they manage a chair via preview).
// Returns the artist_id or null if not allowed / no chair in context.
async function targetArtist(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { role: string; shopId: string; artistId: string | null },
  asked: string | null,
): Promise<string | null> {
  if (ctx.role !== "owner") return ctx.artistId ?? null;
  const candidate = asked || ctx.artistId;
  if (!candidate || !admin) return null;
  const { data } = await admin.from("artists").select("id").eq("id", candidate).eq("shop_id", ctx.shopId).maybeSingle();
  return data ? candidate : null;
}

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const artistId = await targetArtist(admin, ctx, new URL(req.url).searchParams.get("artistId"));
  if (!artistId) {
    return NextResponse.json({ error: "Pick a chair to manage follow-ups for." }, { status: 400 });
  }

  const shopTpl = await loadTemplates(admin, ctx.shopId);
  const { data: rows } = await admin
    .from("followup_prefs")
    .select("kind, subject, body, lead_days, enabled")
    .eq("artist_id", artistId);
  const byKind = new Map((rows ?? []).map((r) => [r.kind as FollowupKind, r as Partial<Template>]));

  const items = ARTIST_FOLLOWUP_KINDS.map((kind) => {
    const shop = shopTpl[kind];
    const override = byKind.get(kind) ?? null;
    const effective = overlayArtist(shop, override);
    return {
      kind,
      label: KIND_LABEL[kind],
      // What the client actually gets (shop default with the artist's changes on top).
      effective: {
        subject: effective.subject,
        body: effective.body,
        lead_days: effective.lead_days,
        enabled: effective.enabled,
      },
      // The shop's version, so the app can show "reset to shop default".
      shopDefault: {
        subject: shop.subject,
        body: shop.body,
        lead_days: shop.lead_days,
        enabled: shop.enabled,
      },
      // Which fields the artist has actually overridden (null = inherited).
      overridden: {
        subject: !!override?.subject?.trim(),
        body: !!override?.body?.trim(),
        lead_days: typeof override?.lead_days === "number",
        enabled: typeof override?.enabled === "boolean",
      },
    };
  });

  return NextResponse.json({ items });
}

// Save (or clear) an override. Body: { kind, subject?, body?, lead_days?, enabled? }.
// A field sent as null / "" clears that field's override (inherit the shop again).
// When every field is inherited, the row is deleted entirely.
export async function POST(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const b = (await req.json().catch(() => ({}))) as {
    kind?: string;
    artistId?: string;
    subject?: string | null;
    body?: string | null;
    lead_days?: number | null;
    enabled?: boolean | null;
  };
  const artistId = await targetArtist(admin, ctx, b.artistId ?? null);
  if (!artistId) return NextResponse.json({ error: "Pick a chair to manage follow-ups for." }, { status: 400 });
  if (!b.kind || !isArtistKind(b.kind)) {
    return NextResponse.json({ error: "That follow-up can't be customized." }, { status: 400 });
  }

  const subject = typeof b.subject === "string" && b.subject.trim() ? b.subject.trim().slice(0, 300) : null;
  const body = typeof b.body === "string" && b.body.trim() ? b.body.trim().slice(0, 4000) : null;
  const lead_days =
    typeof b.lead_days === "number" && Number.isFinite(b.lead_days)
      ? Math.max(0, Math.min(120, Math.round(b.lead_days)))
      : null;
  const enabled = typeof b.enabled === "boolean" ? b.enabled : null;

  // Nothing overridden -> drop the row so it fully inherits the shop default.
  if (subject === null && body === null && lead_days === null && enabled === null) {
    await admin.from("followup_prefs").delete().eq("artist_id", artistId).eq("kind", b.kind);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const { error } = await admin.from("followup_prefs").upsert(
    {
      shop_id: ctx.shopId,
      artist_id: artistId,
      kind: b.kind,
      subject,
      body,
      lead_days,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id,kind" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
