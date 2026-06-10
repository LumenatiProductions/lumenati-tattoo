import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSmsConfigured, looksLikePhone, normalizePhone, sendSms } from "@/lib/sms";
import { renderY2kEmail } from "@/lib/email/y2k";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["owner", "bookkeeper", "frontdesk"];

async function staff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("email", user.email!)
    .maybeSingle();
  return { supabase, user, role: profile?.role ?? null };
}

// Send a client the "your consent form is ready to sign" link — by email OR
// text. Owner / bookkeeper / front desk. Body: { id, to } where `to` is an
// email address or a mobile number. If the matching service isn't configured we
// don't fail — we hand the signing URL back so the desk can send it manually.
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { id, to } = (await req.json().catch(() => ({}))) as { id?: string; to?: string };
  if (!id) return NextResponse.json({ error: "Missing form id" }, { status: 400 });
  const recipient = (to ?? "").trim();
  const isPhone = looksLikePhone(recipient);
  if (!recipient || (!isPhone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))) {
    return NextResponse.json(
      { error: "Enter the client's email address or mobile number." },
      { status: 400 },
    );
  }
  if (isPhone && !normalizePhone(recipient)) {
    return NextResponse.json({ error: "That mobile number doesn't look right." }, { status: 400 });
  }

  const { data: form } = await supabase
    .from("consent_forms")
    .select("sign_token, signed_at, voided")
    .eq("id", id)
    .maybeSingle();
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  if (form.signed_at) return NextResponse.json({ error: "This form is already signed." }, { status: 409 });
  if (form.voided || !form.sign_token) {
    return NextResponse.json({ error: "This form has no active signing link." }, { status: 409 });
  }

  const signUrl = `${new URL(req.url).origin}/intake/${form.sign_token}`;

  // ── Text it ──
  if (isPhone) {
    if (!isSmsConfigured) {
      // Degrade gracefully: hand the link back for a manual text.
      return NextResponse.json({ ok: true, preview: true, signUrl });
    }
    const sms = await sendSms(
      recipient,
      `Lumenati Tattoo: your consent form is ready to sign before your appointment. It takes about two minutes: ${signUrl}`,
    );
    if (!sms.ok) {
      return NextResponse.json({ error: sms.error, signUrl }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sentTo: recipient, id: sms.sid, signUrl, channel: "sms" });
  }

  // ── Email it ──
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // Degrade gracefully: let the desk copy/text the link themselves.
    return NextResponse.json({ ok: true, preview: true, signUrl });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Lumenati Tattoo <onboarding@resend.dev>",
      to: [recipient],
      subject: "Lumenati — your consent form is ready to sign",
      html: emailHtml(signUrl),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: "Send failed", detail: body, signUrl }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: recipient, id: body.id, signUrl, channel: "email" });
}

function emailHtml(signUrl: string) {
  return renderY2kEmail({
    windowTitle: "consent_form.exe",
    headline: "You're booked. Let's get the paperwork done early.",
    paragraphs: [
      "Please fill out and sign your consent and aftercare form before your appointment. It takes about two minutes.",
      "We'll verify your ID in person when you arrive.",
      "This link is private to your appointment. Don't share it.",
    ],
    button: { label: "Open my consent form", url: signUrl },
    finePrint: signUrl,
  });
}
