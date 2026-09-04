import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { LUMENATI_SHOP_ID } from "@/lib/shops/ids";
import { clientIp, hashOf, throttled } from "@/lib/site/guestbook";

// The site poll: one live question. GET returns it with the counts and
// whether this browser already voted; POST casts a vote. One vote per
// browser and address: a random voter cookie plus the IP, hashed together.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };
const VOTER_COOKIE = "lmn-voter";

type Option = { key: string; label: string };

function voterId(req: Request): { id: string; fresh: boolean } {
  const m = /(?:^|;\s*)lmn-voter=([A-Za-z0-9_-]{8,64})/.exec(req.headers.get("cookie") || "");
  if (m) return { id: m[1], fresh: false };
  return { id: crypto.randomUUID().replace(/-/g, ""), fresh: true };
}

async function readPoll(admin: NonNullable<ReturnType<typeof createAdminClient>>, voterHash: string) {
  const { data: poll } = await admin
    .from("site_polls")
    .select("id, question, options")
    .eq("shop_id", LUMENATI_SHOP_ID)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!poll) return null;
  const { data: votes } = await admin.from("site_poll_votes").select("option_key, voter_hash").eq("poll_id", poll.id);
  const counts: Record<string, number> = {};
  let mine: string | null = null;
  for (const o of (poll.options as Option[]) ?? []) counts[o.key] = 0;
  for (const v of (votes ?? []) as { option_key: string; voter_hash: string }[]) {
    counts[v.option_key] = (counts[v.option_key] ?? 0) + 1;
    if (v.voter_hash === voterHash) mine = v.option_key;
  }
  return { id: poll.id, question: poll.question, options: poll.options as Option[], counts, total: (votes ?? []).length, voted: mine };
}

function withCookie(res: NextResponse, voter: { id: string; fresh: boolean }) {
  if (voter.fresh) res.cookies.set(VOTER_COOKIE, voter.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ poll: null }, { headers: NO_STORE });
  const voter = voterId(req);
  const poll = await readPoll(admin, hashOf(voter.id + "|" + clientIp(req)));
  return withCookie(NextResponse.json({ poll }, { headers: NO_STORE }), voter);
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503, headers: NO_STORE });
  const ip = clientIp(req);
  if (throttled("poll:" + ip, 20, 60_000)) return NextResponse.json({ error: "Slow down a moment." }, { status: 429, headers: NO_STORE });
  const voter = voterId(req);
  const voterHash = hashOf(voter.id + "|" + ip);
  const b = (await req.json().catch(() => ({}))) as { pollId?: string; option?: string };
  const before = await readPoll(admin, voterHash);
  if (!before || before.id !== b.pollId) return NextResponse.json({ error: "That poll is closed." }, { status: 400, headers: NO_STORE });
  const option = before.options.find((o) => o.key === b.option);
  if (!option) return NextResponse.json({ error: "Pick one of the options." }, { status: 400, headers: NO_STORE });
  if (before.voted) return withCookie(NextResponse.json({ poll: before, already: true }, { headers: NO_STORE }), voter);
  const { error } = await admin.from("site_poll_votes").insert({ poll_id: before.id, option_key: option.key, voter_hash: voterHash });
  if (error && !/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: "Couldn't count that." }, { status: 500, headers: NO_STORE });
  const poll = await readPoll(admin, voterHash);
  return withCookie(NextResponse.json({ poll }, { headers: NO_STORE }), voter);
}
