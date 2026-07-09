import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Proof photos (page-walk note 13): the snap of the cash stack on a handoff
// confirm, and receipt shots on shop expenses. They live in the PRIVATE
// `proof-photos` bucket (money evidence is nobody's public content) and are
// served through short-lived signed URLs, admin-gated at the route.

const MAX_BYTES = 4 * 1024 * 1024;

const SNIFF: { ext: string; type: string; match: (b: Buffer) => boolean }[] = [
  { ext: "jpg", type: "image/jpeg", match: (b) => b[0] === 0xff && b[1] === 0xd8 },
  {
    ext: "png",
    type: "image/png",
    match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    ext: "webp",
    type: "image/webp",
    match: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

/** Sniff + store a base64 image under `<prefix>/<date>/<random>.<ext>`. */
export async function storeProofPhoto(
  admin: SupabaseClient,
  prefix: "cash" | "receipts",
  imageBase64: string,
): Promise<{ path?: string; error?: string }> {
  let buf: Buffer;
  try {
    buf = Buffer.from(imageBase64.replace(/^data:[^,]+,/, ""), "base64");
  } catch {
    return { error: "Bad image data" };
  }
  if (buf.length < 100) return { error: "That image looks empty." };
  if (buf.length > MAX_BYTES) return { error: "Image is too large — try a smaller photo." };
  const kind = SNIFF.find((s) => s.match(buf));
  if (!kind) return { error: "Only JPEG, PNG, or WebP images work here." };

  const path = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString("base64url")}.${kind.ext}`;
  const { error } = await admin.storage.from("proof-photos").upload(path, buf, {
    contentType: kind.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) return { error: error.message };
  return { path };
}

/** Short-lived signed link for viewing a stored proof photo. */
export async function signProofPhoto(
  admin: SupabaseClient,
  path: string,
): Promise<string | null> {
  const { data } = await admin.storage.from("proof-photos").createSignedUrl(path, 60 * 15);
  return data?.signedUrl ?? null;
}
