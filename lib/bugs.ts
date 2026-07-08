import type { SupabaseClient } from "@supabase/supabase-js";

// Bug-report intake, SERVER ONLY. Stores the report row + an optional screenshot
// (private `bug-reports` bucket), then best-effort pings the same ALERT_WEBHOOK_URL
// the error reporter uses. Deliberately tiny and infra-light — Supabase storage
// instead of a separate object store, Slack instead of a triage app. When the
// shop team outgrows a Slack ping, add an /admin page reading bug_reports.

const MAX_SHOT_BYTES = 4 * 1024 * 1024;

// Sniff the magic bytes; never trust the client's mediaType claim. Screenshots
// arrive downscaled from the client (web JPEG, app JPEG) so PNG is here only
// for the raw-capture case.
const SNIFF: { ext: string; type: string; match: (b: Buffer) => boolean }[] = [
  { ext: "jpg", type: "image/jpeg", match: (b) => b[0] === 0xff && b[1] === 0xd8 },
  {
    ext: "png",
    type: "image/png",
    match: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
];

export type BugInput = {
  note: string;
  url?: string | null;
  surface?: string | null; // web | ios | android
  screenshot?: string | null; // data URI or bare base64
  userAgent?: string | null;
  reporterEmail?: string | null;
  reporterRole?: string | null;
  shopId?: string | null;
  meta?: Record<string, unknown> | null;
};

export type BugResult = { id: string; screenshotSaved: boolean };

// Decode a data-URI or bare-base64 screenshot into bytes, or null if absent/bad.
function decodeShot(raw: string | null | undefined): Buffer | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const b = Buffer.from(raw.replace(/^data:[^,]+,/, ""), "base64");
    return b.length >= 100 && b.length <= MAX_SHOT_BYTES ? b : null;
  } catch {
    return null;
  }
}

export async function fileBug(admin: SupabaseClient, input: BugInput): Promise<BugResult> {
  const note = (input.note ?? "").trim().slice(0, 4000);
  const { data: row, error } = await admin
    .from("bug_reports")
    .insert({
      note,
      url: (input.url ?? null)?.toString().slice(0, 500) ?? null,
      surface: (input.surface ?? null)?.toString().slice(0, 20) ?? null,
      user_agent: (input.userAgent ?? null)?.toString().slice(0, 500) ?? null,
      reporter_email: input.reporterEmail ?? null,
      reporter_role: input.reporterRole ?? null,
      shop_id: input.shopId ?? null,
      meta: input.meta ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = row.id as string;

  // Screenshot is best-effort: a failed capture/upload never loses the report.
  let screenshotSaved = false;
  let screenshotPath: string | null = null;
  const shot = decodeShot(input.screenshot);
  if (shot) {
    const kind = SNIFF.find((s) => s.match(shot));
    if (kind) {
      const path = `${id}.${kind.ext}`;
      const { error: upErr } = await admin.storage.from("bug-reports").upload(path, shot, {
        contentType: kind.type,
        upsert: true,
      });
      if (!upErr) {
        screenshotPath = path;
        screenshotSaved = true;
        await admin.from("bug_reports").update({ screenshot_path: path }).eq("id", id);
      }
    }
  }

  await notifySlack(admin, { id, note, input, screenshotPath });
  return { id, screenshotSaved };
}

async function notifySlack(
  admin: SupabaseClient,
  args: { id: string; note: string; input: BugInput; screenshotPath: string | null },
) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  // A short-lived signed link so Scott can open the shot straight from Slack
  // without making the bucket public.
  let shotLink = "";
  if (args.screenshotPath) {
    const { data } = await admin.storage.from("bug-reports").createSignedUrl(args.screenshotPath, 60 * 60 * 24 * 7);
    if (data?.signedUrl) shotLink = `\nScreenshot: ${data.signedUrl}`;
  }
  const who = args.input.reporterEmail
    ? `${args.input.reporterEmail}${args.input.reporterRole ? ` (${args.input.reporterRole})` : ""}`
    : "anonymous";
  const where = args.input.surface ? `${args.input.surface} · ${args.input.url ?? "?"}` : (args.input.url ?? "?");
  const text = `Bug report · ${where}\nFrom: ${who}\n\n${args.note.slice(0, 1500)}${shotLink}`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    /* never let the reporter throw */
  }
}
