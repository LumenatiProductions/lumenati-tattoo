import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePermalink, resolveOEmbed } from "@/lib/social/instagram";

export const dynamic = "force-dynamic";

const CURATORS = ["owner"] as const;

// Resolve the signed-in user's role, or null. Shared by every handler.
async function curator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}

// List the curated wall, newest first. Any signed-in staff can read (RLS also enforces it).
export async function GET() {
  const { supabase, user } = await curator();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("social_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message, posts: [] }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

// Add a post by pasting its Instagram URL. Admins.
// Body: { url: string, artistId?: string|null, caption?: string, mediaUrl?: string }
export async function POST(req: Request) {
  const { supabase, user, role } = await curator();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !CURATORS.includes(role as (typeof CURATORS)[number])) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    artistId?: string | null;
    caption?: string;
    mediaUrl?: string;
  };
  const parsed = parsePermalink(body.url ?? "");
  if (!parsed) {
    return NextResponse.json(
      { error: "That doesn't look like an Instagram post or reel URL." },
      { status: 400 },
    );
  }

  // Best-effort enrichment (no-op unless INSTAGRAM_OEMBED_TOKEN is set). User-supplied
  // values win when provided, so a manual caption/image is never clobbered by a blank oEmbed.
  const oembed = await resolveOEmbed(parsed.permalink);
  const row = {
    id: parsed.shortcode,
    artist_id: body.artistId || null,
    platform: "instagram",
    external_id: parsed.shortcode,
    permalink: parsed.permalink,
    media_url: body.mediaUrl || oembed.mediaUrl || null,
    media_type: parsed.mediaType,
    caption: (body.caption ?? oembed.caption ?? "").trim(),
    source: "manual",
    posted_at: oembed.postedAt ?? null,
    submitted_by: user.email,
    fetched_at: new Date().toISOString(),
  };

  // Upsert on the shortcode PK so re-pasting the same post refreshes instead of dupes.
  const { data, error } = await supabase
    .from("social_posts")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

// Toggle the "featured" curation flag (and allow caption/artist edits). Admins.
// Body: { id: string, featured?: boolean, caption?: string, artistId?: string|null }
export async function PATCH(req: Request) {
  const { supabase, user, role } = await curator();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !CURATORS.includes(role as (typeof CURATORS)[number])) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    featured?: boolean;
    caption?: string;
    artistId?: string | null;
  };
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.featured === "boolean") patch.featured = body.featured;
  if (typeof body.caption === "string") patch.caption = body.caption.trim();
  if (body.artistId !== undefined) patch.artist_id = body.artistId || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("social_posts")
    .update(patch)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

// Remove a post from the wall. Owner + front desk. Pass ?id=<shortcode>.
export async function DELETE(req: Request) {
  const { supabase, user, role } = await curator();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !CURATORS.includes(role as (typeof CURATORS)[number])) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("social_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
