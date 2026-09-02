import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/api-auth";
import { salesSummary, fetchRentInvoices, isSquareConfigured, type RentInvoice } from "@/lib/square/client";
import { fmt } from "@/lib/admin/calc";
import { emailFrom } from "@/lib/email/from";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Weekly owner digest. Triggered by Vercel Cron (see vercel.json) or manually
// with the CRON_SECRET. Computes last-7-day sales + rent status from Square and
// emails it via Resend.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || !secretMatches(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSquareConfigured) {
    return NextResponse.json({ error: "Square not configured" }, { status: 400 });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [sales, rent] = await Promise.all([salesSummary(since), fetchRentInvoices()]);

  const rentOutstanding = rent.filter((r) => !r.paid).reduce((a, r) => a + r.amountCents, 0);
  const overdue = rent.filter((r) => r.overdue);

  const recipients = (process.env.DIGEST_RECIPIENTS || "lumenati@icloud.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const html = digestHtml({ sales, rentOutstanding, overdue });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not set", preview: html }, { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom(),
      to: recipients,
      subject: "Lumenati — this week at the shop",
      html,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: "Send failed", detail: body }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sentTo: recipients, id: body.id });
}

function digestHtml({
  sales,
  rentOutstanding,
  overdue,
}: {
  sales: { count: number; grossCents: number; serviceCents: number; tipCents: number; cardCents: number; cashCents: number };
  rentOutstanding: number;
  overdue: RentInvoice[];
}) {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:7px 0;font-size:14px;color:#52525b;">${label}</td><td style="padding:7px 0;font-size:14px;font-weight:700;color:#0e0e11;text-align:right;">${value}</td></tr>`;
  const overdueList = overdue.length
    ? `<p style="font-size:13px;color:#0e0e11;margin:18px 0 6px;font-weight:700;">Rent overdue (${overdue.length})</p>` +
      overdue
        .map(
          (r) =>
            `<div style="font-size:13px;color:#b91c1c;padding:3px 0;">• ${r.name} — ${fmt(r.amountCents)}${r.dueDate ? ` (due ${r.dueDate})` : ""}</div>`,
        )
        .join("")
    : `<p style="font-size:13px;color:#16a34a;margin:18px 0 0;">All rent collected.</p>`;

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">LUMENATI</span><span style="font-size:22px;font-weight:800;color:#FF1493;">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">This week at the shop</div>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <div style="font-size:17px;font-weight:700;color:#0e0e11;margin-bottom:4px;">Last 7 days</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${row("Gross sales", fmt(sales.grossCents))}
          ${row("Service", fmt(sales.serviceCents))}
          ${row("Tips", fmt(sales.tipCents))}
          ${row("Card", fmt(sales.cardCents))}
          ${row("Cash", fmt(sales.cashCents))}
          ${row("Tickets", String(sales.count))}
        </table>
        <div style="border-top:1px solid #ececef;margin:18px 0 0;padding-top:16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${row("Rent outstanding", fmt(rentOutstanding))}
          </table>
          ${overdueList}
        </div>
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">Lumenati Tattoo &nbsp;//&nbsp; figures pulled live from Square. Card sales reflect what runs through Square; cash collected off-Square isn't counted.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
