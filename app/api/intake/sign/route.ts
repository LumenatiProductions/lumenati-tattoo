import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONSENT_STATEMENTS,
  computeAgeOk,
  summarizeMedicalFlags,
} from "@/lib/intake/forms";

export const dynamic = "force-dynamic";

// The public signer has NO Supabase session, so this route uses the service-role
// client (bypasses RLS) and is gated entirely by the opaque sign_token. It only
// ever touches the single form that matches the token — never lists anything.

const MAX_SIGNATURE_LEN = 500_000; // guard against an oversized payload
// The signature is stored as SVG *path data* (the `d` attribute string), never
// full markup — so the staff view can render it with React, not
// dangerouslySetInnerHTML. Reject anything outside path-data characters; this is
// the line that keeps a malicious signer from storing <script> in the record.
const SIGNATURE_PATH_RE = /^[\sMLCQZmlcqz0-9.,+-]+$/;

type Status = "ready" | "signed" | "void" | "invalid";

async function loadByToken(token: string) {
  const admin = createAdminClient();
  if (!admin) return { admin: null, form: null as null };
  const { data } = await admin
    .from("consent_forms")
    .select("*")
    .eq("sign_token", token)
    .maybeSingle();
  return { admin, form: data };
}

// GET ?token=… — verify a link and return just enough context to render the
// form (client first name to greet, placement, artist, appointment time).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ status: "invalid" as Status }, { status: 400 });

  const { admin, form } = await loadByToken(token);
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  if (!form) return NextResponse.json({ status: "invalid" as Status }, { status: 404 });

  let status: Status = "ready";
  if (form.voided) status = "void";
  else if (form.signed_at) status = "signed";

  // Hydrate display context only (no sensitive fields leak to the public page).
  let clientFirstName: string | null = null;
  let artistName: string | null = null;
  let bookingStartsAt: string | null = null;
  if (form.client_id) {
    const { data: c } = await admin
      .from("clients")
      .select("first_name")
      .eq("id", form.client_id)
      .maybeSingle();
    clientFirstName = (c?.first_name as string) || null;
  }
  if (form.artist_id) {
    const { data: a } = await admin
      .from("artists")
      .select("name")
      .eq("id", form.artist_id)
      .maybeSingle();
    artistName = (a?.name as string) || null;
  }
  if (form.booking_id) {
    const { data: b } = await admin
      .from("bookings")
      .select("starts_at")
      .eq("id", form.booking_id)
      .maybeSingle();
    bookingStartsAt = (b?.starts_at as string) || null;
  }

  return NextResponse.json({
    status,
    context: { clientFirstName, artistName, bookingStartsAt, placement: form.placement },
  });
}

// POST — submit the signed form. Body:
// { token, signedName, dob, placement?, answers, aftercareAck }
// `answers` is the full questionnaire snapshot; consent acknowledgments live in
// answers.consent (one boolean per CONSENT_STATEMENTS index). We stamp signed_at,
// compute age_ok from dob, and summarize medical flags for the artist.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    signedName?: string;
    dob?: string;
    placement?: string;
    signatureSvg?: string;
    answers?: Record<string, unknown>;
    aftercareAck?: boolean;
  };

  if (!body.token) return NextResponse.json({ error: "Missing link token." }, { status: 400 });

  const { admin, form } = await loadByToken(body.token);
  if (!admin) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  if (!form) return NextResponse.json({ error: "This signing link is not valid." }, { status: 404 });
  if (form.voided) return NextResponse.json({ error: "This form has been voided. Please see the front desk." }, { status: 409 });
  if (form.signed_at) return NextResponse.json({ error: "This form has already been signed." }, { status: 409 });

  const signedName = (body.signedName ?? "").trim();
  const dob = (body.dob ?? "").trim();
  const signatureSvg = body.signatureSvg ?? "";
  const answers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, unknown>;

  if (!signedName) return NextResponse.json({ error: "Please type your full legal name." }, { status: 400 });
  if (!dob) return NextResponse.json({ error: "Please enter your date of birth." }, { status: 400 });
  if (!signatureSvg) return NextResponse.json({ error: "Please draw your signature." }, { status: 400 });
  if (signatureSvg.length > MAX_SIGNATURE_LEN) {
    return NextResponse.json({ error: "Signature data is too large." }, { status: 413 });
  }
  if (!SIGNATURE_PATH_RE.test(signatureSvg)) {
    return NextResponse.json({ error: "Signature data is malformed." }, { status: 400 });
  }
  if (body.aftercareAck !== true) {
    return NextResponse.json({ error: "Please acknowledge the aftercare instructions." }, { status: 400 });
  }

  // Every consent statement must be affirmed.
  const consent = Array.isArray((answers as { consent?: unknown }).consent)
    ? ((answers as { consent: unknown[] }).consent as unknown[])
    : [];
  const allConsented =
    consent.length >= CONSENT_STATEMENTS.length &&
    CONSENT_STATEMENTS.every((_, i) => consent[i] === true);
  if (!allConsented) {
    return NextResponse.json({ error: "Please confirm every consent statement." }, { status: 400 });
  }

  // Age gate: a minor cannot self-consent. Record the truth and block the
  // self-serve sign — the desk handles guardian-consent cases in person.
  const age_ok = computeAgeOk(dob);
  if (age_ok === false) {
    return NextResponse.json(
      { error: `You must be at least the minimum age to sign here. Please see the front desk.`, ageBlocked: true },
      { status: 403 },
    );
  }

  const patch = {
    signed_name: signedName,
    dob,
    age_ok,
    placement: (body.placement ?? form.placement ?? "").trim() || null,
    medical_flags: summarizeMedicalFlags(answers),
    aftercare_ack: true,
    signature_svg: signatureSvg,
    answers,
    signed_at: new Date().toISOString(),
  };

  const { error } = await admin.from("consent_forms").update(patch).eq("id", form.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
