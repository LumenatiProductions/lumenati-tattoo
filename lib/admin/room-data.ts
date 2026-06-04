import { getSupabase, isSupabaseConfigured, ROOM_PHOTOS_BUCKET } from "@/lib/supabase";
import type { RoomContent } from "./types";
import { ROOM_CONTENT } from "./room-seed";

// DB row (snake_case) <-> RoomContent (camelCase).
type Row = {
  artist_id: string;
  tagline: string;
  bio: string;
  ig_handle: string;
  song_id: string;
  accent_color: string;
  profile_photo: string;
  polaroids: RoomContent["polaroids"];
  portfolio: RoomContent["portfolio"];
};

const rowToContent = (r: Row): RoomContent => ({
  artistId: r.artist_id,
  tagline: r.tagline,
  bio: r.bio,
  igHandle: r.ig_handle,
  songId: r.song_id,
  accentColor: r.accent_color,
  profilePhoto: r.profile_photo,
  polaroids: r.polaroids ?? [],
  portfolio: r.portfolio ?? [],
});

const contentToRow = (c: RoomContent): Row => ({
  artist_id: c.artistId,
  tagline: c.tagline,
  bio: c.bio,
  ig_handle: c.igHandle,
  song_id: c.songId,
  accent_color: c.accentColor,
  profile_photo: c.profilePhoto,
  polaroids: c.polaroids,
  portfolio: c.portfolio,
});

/** All rooms keyed by artistId. Supabase when configured, else the mock seed. */
export async function fetchAllRooms(): Promise<Record<string, RoomContent>> {
  const sb = getSupabase();
  if (!sb) return ROOM_CONTENT;
  const { data, error } = await sb.from("room_content").select("*");
  if (error || !data) return ROOM_CONTENT;
  const out: Record<string, RoomContent> = {};
  for (const row of data as Row[]) out[row.artist_id] = rowToContent(row);
  // Fall back to seed for any artist not yet in the DB.
  return { ...ROOM_CONTENT, ...out };
}

/** One room. Supabase when configured, else the mock seed. */
export async function fetchRoom(artistId: string): Promise<RoomContent> {
  const sb = getSupabase();
  if (!sb) return ROOM_CONTENT[artistId];
  const { data, error } = await sb
    .from("room_content")
    .select("*")
    .eq("artist_id", artistId)
    .maybeSingle();
  if (error || !data) return ROOM_CONTENT[artistId];
  return rowToContent(data as Row);
}

/** Upsert a room. No-op (returns false) when Supabase isn't configured. */
export async function saveRoom(content: RoomContent): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb
    .from("room_content")
    .upsert(contentToRow(content), { onConflict: "artist_id" });
  return !error;
}

/**
 * Upload a room photo. With Supabase → Storage public URL. Without → a local
 * data URL (preview only, the current behavior).
 */
export async function uploadPhoto(artistId: string, file: File): Promise<string> {
  const sb = getSupabase();
  if (!sb) {
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(file);
    });
  }
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${artistId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(ROOM_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb.storage.from(ROOM_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export { isSupabaseConfigured };
