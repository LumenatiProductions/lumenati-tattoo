import { createHash } from "node:crypto";

// Shared bits for the Y2K site's visitor-written pieces (guestbook, poll):
// who is writing (hashed), a small language filter, and the per-IP throttle.

export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

export const hashOf = (s: string) => createHash("sha256").update("lumenati-site:" + s).digest("hex").slice(0, 24);

const hits = new Map<string, number[]>();
export function throttled(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > limit;
}

// Words the shop wall never shows. Matched on word boundaries with common
// letter swaps folded (a/@, i/1, e/3, o/0, s/$).
const BAD = ["fuck", "shit", "cunt", "nigger", "nigga", "faggot", "fag", "retard", "bitch", "kike", "spic", "chink", "tranny", "whore", "slut", "rape", "kys", "cock", "dick", "pussy", "asshole"];
const fold = (s: string) =>
  s.toLowerCase().replace(/[@]/g, "a").replace(/[1!|]/g, "i").replace(/3/g, "e").replace(/0/g, "o").replace(/[$5]/g, "s").replace(/[^a-z\s]/g, "");
export function hasBadWords(s: string): boolean {
  const f = " " + fold(s).replace(/\s+/g, " ") + " ";
  return BAD.some((w) => f.includes(" " + w + " ") || f.includes(" " + w + "s ") || f.includes(" " + w + "ing "));
}

export const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
