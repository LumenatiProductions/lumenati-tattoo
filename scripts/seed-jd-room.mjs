// One-shot: build JD's room through the SAME pipeline every artist uses
// (bug ccc842e4). Uploads his skate edit (pulled from his Vimeo) into the
// room-photos bucket and writes his room_content row: the four classic wall
// posters as real poster rows, the uploaded video with
// its title. His public page renders identically — but now the app's My Room
// editor shows the real content, editable like anyone else's.
//
// Run: node scripts/seed-jd-room.mjs /path/to/jd_skate_edit.mp4
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://humjddiwzzanvvqztypy.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? readEnvLocal();
const videoPath = process.argv[2];
if (!videoPath) throw new Error("Usage: node scripts/seed-jd-room.mjs <path-to-mp4>");
if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not found");

function readEnvLocal() {
  try {
    const m = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(
      /SUPABASE_SERVICE_ROLE_KEY="?([^"\n]+)"?/,
    );
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// The four classic posters JD's baked-in page shows today, as explicit rows.
const CLASSIC_POSTERS = [
  "https://images.squarespace-cdn.com/content/60007bfc3f491826496124f4/1baed3f4-49f8-4ea7-9f2b-c74bcfbbe11f/2020-shof-chad-muska-7.jpg?content-type=image%2Fjpeg",
  "https://images.squarespace-cdn.com/content/60007bfc3f491826496124f4/00b460b5-ddc9-4665-907e-61f3e2435883/5ce32701d9308a7a9fe6d804ebde8159.jpg?content-type=image%2Fjpeg",
  "https://images.squarespace-cdn.com/content/60007bfc3f491826496124f4/b8c4c7ae-9332-4eaa-a638-ea973619ef2e/LovePark.jpg?content-type=image%2Fjpeg",
  "https://images.squarespace-cdn.com/content/60007bfc3f491826496124f4/3c3e28d8-8e66-488e-b612-fdeb451fe974/7-jeron-wilson-ortiz-tws-june-94-12-6-119559.jpg?content-type=image%2Fjpeg",
].map((src, i) => ({ id: `wp-classic-${i + 1}`, src }));

const db = createClient(url, key);

const video = readFileSync(videoPath);
if (video.length > 60 * 1024 * 1024) throw new Error("Video is over the 60MB room cap");
const path = `jd/video-${Date.now()}.mp4`;
const { error: upErr } = await db.storage
  .from("room-photos")
  .upload(path, video, { contentType: "video/mp4" });
if (upErr) throw new Error(`upload: ${upErr.message}`);
const { data: pub } = db.storage.from("room-photos").getPublicUrl(path);
console.log("uploaded", pub.publicUrl, `(${(video.length / 1e6).toFixed(1)}MB)`);

const { error: rowErr } = await db
  .from("room_content")
  .update({
    posters: CLASSIC_POSTERS,
    video_url: pub.publicUrl,
    video_title: "jd skate edit",
  })
  .eq("artist_id", "jd");
if (rowErr) throw new Error(`room row: ${rowErr.message}`);
console.log("JD's room seeded — posters, Ink or Die, and his skate edit are real room data now.");
