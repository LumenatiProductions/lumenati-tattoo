import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Public upload for /request reference images. The browser downscales before
// sending (so a phone photo arrives well under Vercel's body limit); this route
// still enforces its own caps and sniffs the magic bytes — the client's
// mediaType claim is never trusted. Files land in the public-read
// `request-refs` bucket under an unguessable name via the service role.

const MAX_BYTES = 4 * 1024 * 1024; // post-downscale this is generous

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

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { imageBase64?: string };
  if (!b.imageBase64) return NextResponse.json({ error: "Missing image" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = Buffer.from(b.imageBase64.replace(/^data:[^,]+,/, ""), "base64");
  } catch {
    return NextResponse.json({ error: "Bad image data" }, { status: 400 });
  }
  if (buf.length < 100) return NextResponse.json({ error: "That image looks empty." }, { status: 400 });
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large — try a smaller photo." }, { status: 413 });
  }

  const kind = SNIFF.find((s) => s.match(buf));
  if (!kind) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images work here." }, { status: 415 });
  }

  const path = `${new Date().toISOString().slice(0, 10)}/${randomBytes(12).toString("base64url")}.${kind.ext}`;
  const { error } = await admin.storage.from("request-refs").upload(path, buf, {
    contentType: kind.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    if (/bucket.*not found/i.test(error.message)) {
      return NextResponse.json(
        { error: "Reference uploads aren't open yet — submit without photos and mention them in your idea." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Upload failed — try again." }, { status: 500 });
  }

  const { data } = admin.storage.from("request-refs").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
