import { NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";

// Client-side error funnel: the error boundaries POST here; we forward to the
// alert webhook (if configured). Clipped hard so it can't be abused as a relay.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { where?: string; message?: string };
  const where = String(b.where ?? "client").slice(0, 100);
  const message = String(b.message ?? "").slice(0, 800);
  if (message) await reportError(where, new Error(message));
  return NextResponse.json({ ok: true });
}
