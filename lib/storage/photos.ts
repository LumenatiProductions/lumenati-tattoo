import type { SupabaseClient } from "@supabase/supabase-js";

// Private-photo helpers (2026-07-26). healed-photos and request-refs are
// PRIVATE buckets: DB rows store storage paths, and staff surfaces exchange
// them for short signed URLs here (same shape as lib/storage/proof.ts).
// A value that is already a full URL is a legacy row from before the
// lockdown — pass it through untouched. SERVER ONLY (service-role client).

const TTL_SECONDS = 60 * 15;

const isFullUrl = (v: string) => /^https?:\/\//i.test(v);

export async function signPhoto(
  admin: SupabaseClient,
  bucket: "healed-photos" | "request-refs",
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (isFullUrl(value)) return value;
  const { data } = await admin.storage.from(bucket).createSignedUrl(value, TTL_SECONDS);
  return data?.signedUrl ?? null;
}

// Copy an approved healed shot into the public room-photos bucket so the
// artist's public portfolio can serve it without auth. Idempotent per photo
// (fixed destination, upsert). Returns the public URL, or null on any failure
// so the caller can refuse the approve rather than publish a broken image.
export async function publishHealedShot(
  admin: SupabaseClient,
  photoId: string,
  storedValue: string,
): Promise<string | null> {
  try {
    if (isFullUrl(storedValue)) return storedValue; // legacy row, already public
    const dl = await admin.storage.from("healed-photos").download(storedValue);
    if (dl.error || !dl.data) return null;
    const ext = storedValue.split(".").pop() || "jpg";
    const dest = `healed-public/${photoId}.${ext}`;
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const up = await admin.storage.from("room-photos").upload(dest, buf, {
      contentType: dl.data.type || undefined,
      cacheControl: "31536000",
      upsert: true,
    });
    if (up.error) return null;
    return admin.storage.from("room-photos").getPublicUrl(dest).data.publicUrl;
  } catch {
    return null;
  }
}
