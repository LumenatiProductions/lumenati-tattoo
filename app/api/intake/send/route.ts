import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

// Email a client the "your consent form is ready to sign" link. Owner /
// bookkeeper / front desk. Body: { id, to }. If RESEND_API_KEY isn't set we
// don't fail — we hand the signing URL back so the desk can text it manually.
export async function POST(req: Request) {
  const { supabase, user, role } = await staff();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!role || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  const { id, to } = (await req.json().catch(() => ({}))) as { id?: string; to?: string };
  if (!id) return NextResponse.json({ error: "Missing form id" }, { status: 400 });
  if (!to || !to.includes("@")) {
    return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
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
      to: [to],
      subject: "Lumenati — your consent form is ready to sign",
      html: emailHtml(signUrl),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: "Send failed", detail: body, signUrl }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: to, id: body.id, signUrl });
}

function emailHtml(signUrl: string) {
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">LUMENATI</span><span style="font-size:22px;font-weight:800;color:#FF1493;">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">Consent form</div>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <div style="font-size:17px;font-weight:700;color:#0e0e11;margin-bottom:6px;">You're booked — let's get the paperwork done early.</div>
        <p style="font-size:14px;line-height:1.55;color:#52525b;margin:0 0 20px;">Please fill out and sign your consent &amp; aftercare form before your appointment. It takes about two minutes. We'll verify your ID in person when you arrive.</p>
        <a href="${signUrl}" style="display:inline-block;background:#FF1493;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;">Open my consent form</a>
        <p style="font-size:12px;color:#a1a1aa;margin:20px 0 0;">If the button doesn't work, paste this link into your browser:<br><span style="color:#71717a;word-break:break-all;">${signUrl}</span></p>
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">Lumenati Tattoo &nbsp;//&nbsp; this link is private to your appointment. Don't share it.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
