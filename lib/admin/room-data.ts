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
  stickers: RoomContent["stickers"];
  posters: RoomContent["posters"];
  video_url: string | null;
  video_title: string | null;
  tv_video_id?: string | null;
  socials: Record<string, string> | null;
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
  stickers: r.stickers ?? null,
  posters: r.posters ?? null,
  videoUrl: r.video_url ?? null,
  videoTitle: r.video_title ?? null,
  tvVideoId: r.tv_video_id ?? null,
  socials: r.socials ?? null,
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
  stickers: c.stickers,
  posters: c.posters,
  video_url: c.videoUrl,
  video_title: c.videoTitle,
  tv_video_id: c.tvVideoId,
  socials: c.socials,
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

function emptyRoom(artistId: string): RoomContent {
  return {
    artistId,
    tagline: "",
    bio: "",
    igHandle: "",
    songId: "offspring",
    accentColor: "#FF1493",
    profilePhoto: "",
    polaroids: [],
    portfolio: [],
    stickers: null,
    posters: null,
    videoUrl: null,
    videoTitle: null,
    tvVideoId: "7iNbnineUCI", // The Offspring, same as songId
    socials: null,
  };
}

/** One room. Supabase when configured, else the mock seed. Never undefined. */
export async function fetchRoom(artistId: string): Promise<RoomContent> {
  const sb = getSupabase();
  if (!sb) return ROOM_CONTENT[artistId] ?? emptyRoom(artistId);
  const { data, error } = await sb
    .from("room_content")
    .select("*")
    .eq("artist_id", artistId)
    .maybeSingle();
  if (error || !data) return ROOM_CONTENT[artistId] ?? emptyRoom(artistId);
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
