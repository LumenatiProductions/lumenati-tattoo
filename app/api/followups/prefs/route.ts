import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStaff } from "@/lib/api-auth";
import { loadTemplates } from "@/lib/followups/job";
import {
  ARTIST_FOLLOWUP_KINDS,
  FOLLOWUP_KINDS,
  KIND_LABEL,
  DEFAULT_TEMPLATES,
  overlayArtist,
  type FollowupKind,
  type Template,
} from "@/lib/followups/templates";

export const dynamic = "force-dynamic";

// Follow-up control has TWO layers, both editable from the same app screen:
//   • the OWNER edits the SHOP-LEVEL set (all kinds, including the promotional
//     rebook/birthday ones for deals) — stored in followup_templates.
//   • an ARTIST edits their OWN per-kind overrides on the visit-tied kinds —
//     stored in followup_prefs, inheriting the shop default until changed.
// An owner manages a specific chair by previewing it (passing artistId); with no
// artistId, an owner is editing their own shop-level set. Both the daily job and
// the send resolve: code default -> shop -> artist. Cookie-or-Bearer.

const fields = (t: { subject: string; body: string; lead_days: number; enabled: boolean }) => ({
  subject: t.subject,
  body: t.body,
  lead_days: t.lead_days,
  enabled: t.enabled,
});

function isKind(k: string, set: readonly FollowupKind[]): k is FollowupKind {
  return (set as readonly string[]).includes(k);
}

// The artist a caller may act on: an artist only their own; an owner any chair in
// their shop. null = the owner is in shop-level mode (no chair named).
async function targetArtist(
  admin: ReturnType<typeof createAdminClient>,
  ctx: { role: string; shopId: string; artistId: string | null },
  asked: string | null,
): Promise<string | null> {
  if (ctx.role !== "owner") return ctx.artistId ?? null;
  if (!asked || !admin) return null;
  const { data } = await admin.from("artists").select("id").eq("id", asked).eq("shop_id", ctx.shopId).maybeSingle();
  return data ? asked : null;
}

export async function GET(req: Request) {
  const ctx = await resolveStaff(req);
  if (!ctx) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service role not set." }, { status: 500 });

  const shopTpl = await loadTemplates(admin, ctx.shopId);
  const asked = new URL(req.url).searchParams.get("artistId");

  // Owner with no chair named -> shop-level set (every kind).
  if (ctx.role === "owner" && !asked) {
    const items = FOLLOWUP_KINDS.map((kind) => {
      const shop = shopTpl[kind];
      const def = DEFAULT_TEMPLATES[kind];
      return {
        kind,
        label: KIND_LABEL[kind],
        effective: fields(shop),
        shopDefault: fields(def), // for shop mode, "default" = the built-in copy
        overridden: {
          subject: shop.subject !== def.subject,
          body: shop.body !== def.body,
          lead_days: shop.lead_days !== def.lead_days,
          enabled: shop.enabled !== def.enabled,
        },
      };
    });
    return NextResponse.json({ mode: "shop", items });
  }

  // Artist (own) or owner acting on a specific chair -> per-artist overrides.
  const artistId = await targetArtist(admin, ctx, asked);
  if (!artistId) return NextResponse.json({ error: "Pick a chair to manage follow-ups for." }, { status: 400 });

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
      effective: fields(effective),
      shopDefault: fields(shop),
      overridden: {
        subject: !!override?.subject?.trim(),
        body: !!override?.body?.trim(),
        lead_days: typeof override?.lead_days === "number",
        enabled: typeof override?.enabled === "boolean",
      },
    };
  });

  return NextResponse.json({ mode: "artist", items });
}

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

  const subject = typeof b.subject === "string" && b.subject.trim() ? b.subject.trim().slice(0, 300) : null;
  const body = typeof b.body === "string" && b.body.trim() ? b.body.trim().slice(0, 4000) : null;
  const lead_days =
    typeof b.lead_days === "number" && Number.isFinite(b.lead_days)
      ? Math.max(0, Math.min(120, Math.round(b.lead_days)))
      : null;
  const enabled = typeof b.enabled === "boolean" ? b.enabled : null;
  const allInherited = subject === null && body === null && lead_days === null && enabled === null;

  // Owner, no chair named -> edit the SHOP template for this kind.
  if (ctx.role === "owner" && !b.artistId) {
    if (!b.kind || !isKind(b.kind, FOLLOWUP_KINDS)) {
      return NextResponse.json({ error: "Unknown follow-up." }, { status: 400 });
    }
    // Reset = delete the shop row so it falls back to the built-in default.
    // Scoped by shop_id: never touches another shop's row.
    if (allInherited) {
      await admin.from("followup_templates").delete().eq("shop_id", ctx.shopId).eq("kind", b.kind);
      return NextResponse.json({ ok: true, cleared: true });
    }
    // Safe update-or-insert scoped to this shop (followup_templates is keyed on
    // kind alone, so we scope writes by shop_id by hand instead of upserting).
    const { data: existing } = await admin
      .from("followup_templates")
      .select("kind")
      .eq("shop_id", ctx.shopId)
      .eq("kind", b.kind)
      .maybeSingle();
    const row = {
      subject: subject ?? "",
      body: body ?? "",
      lead_days: lead_days ?? 0,
      enabled: enabled ?? true,
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await admin.from("followup_templates").update(row).eq("shop_id", ctx.shopId).eq("kind", b.kind)
      : await admin.from("followup_templates").insert({ shop_id: ctx.shopId, kind: b.kind, ...row });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Artist (own) or owner on a specific chair -> per-artist override.
  const artistId = await targetArtist(admin, ctx, b.artistId ?? null);
  if (!artistId) return NextResponse.json({ error: "Pick a chair to manage follow-ups for." }, { status: 400 });
  if (!b.kind || !isKind(b.kind, ARTIST_FOLLOWUP_KINDS)) {
    return NextResponse.json({ error: "That follow-up can't be customized per artist." }, { status: 400 });
  }

  if (allInherited) {
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
