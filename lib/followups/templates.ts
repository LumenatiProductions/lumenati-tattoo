// Follow-up templates: the wording the shop sends after a visit. Code holds the
// defaults; the `followup_templates` table holds the desk's edits (subject, body,
// lead time, on/off). Both the daily job and the manual-send route resolve a
// kind through `resolveTemplate` so they always agree.
//
// Bodies are PLAIN TEXT with {{tokens}} — on-brand, no emojis (Scott's rule).
// `renderEmail` substitutes tokens and wraps the text in the same branded
// Lumenati shell the digest / consent emails use.

export type FollowupKind = "aftercare" | "review_request" | "rebook_nudge" | "birthday";

export const FOLLOWUP_KINDS: FollowupKind[] = [
  "aftercare",
  "review_request",
  "rebook_nudge",
  "birthday",
];

export const KIND_LABEL: Record<FollowupKind, string> = {
  aftercare: "Aftercare",
  review_request: "Review request",
  rebook_nudge: "Rebook nudge",
  birthday: "Birthday",
};

export type Template = {
  kind: FollowupKind;
  subject: string;
  body: string;
  lead_days: number;
  enabled: boolean;
};

// PLACEHOLDER COPY — Scott supplies the shop's real aftercare wording and the
// Google review link (see STARTER-4-FOLLOWUPS.md "External needs"). These read
// cleanly in the meantime and are fully editable from the Follow-ups page.
export const DEFAULT_TEMPLATES: Record<FollowupKind, Template> = {
  aftercare: {
    kind: "aftercare",
    subject: "Caring for your new tattoo",
    lead_days: 0, // sent immediately after the visit
    enabled: true,
    body: `Hi {{first_name}},

Thank you for getting tattooed at {{shop_name}}. Here is how to take care of it while it heals:

- Leave the bandage on for the first few hours, then wash gently with clean hands and unscented soap.
- Pat dry and apply a thin layer of unscented lotion two to three times a day.
- Keep it out of direct sun, pools, and soaking water until it is fully healed.
- Do not pick or scratch as it peels.

If anything looks off or you have questions, just reply to this email and we will help.

See you next time,
{{shop_name}}`,
  },
  review_request: {
    kind: "review_request",
    subject: "How did we do?",
    lead_days: 4, // a few days after the visit, once the excitement has settled
    enabled: true,
    body: `Hi {{first_name}},

We hope your new tattoo is healing well. If you had a good experience at {{shop_name}}, a quick review means the world to us and helps other people find the shop.

Leave a review here: {{review_link}}

Thank you,
{{shop_name}}`,
  },
  rebook_nudge: {
    kind: "rebook_nudge",
    subject: "Ready for your next piece?",
    lead_days: 90, // lapsed = no visit in this many days
    enabled: false, // off until the desk wants proactive rebooking
    body: `Hi {{first_name}},

It has been a while since we saw you at {{shop_name}}. If you have been thinking about your next piece or finishing something we started, we would love to get you back in the chair.

Just reply to this email and we will find a time.

Talk soon,
{{shop_name}}`,
  },
  birthday: {
    kind: "birthday",
    subject: "Happy birthday from {{shop_name}}",
    lead_days: 0, // sent on / just before the birthday
    enabled: false, // off until the desk wants birthday outreach
    body: `Hi {{first_name}},

Happy birthday from everyone at {{shop_name}}. If you are thinking about marking the year with some new ink, reply to this email and we will get you on the books.

Have a great one,
{{shop_name}}`,
  },
};

export const SHOP_NAME = "Lumenati Tattoo";

type Tokens = {
  first_name?: string | null;
  shop_name?: string;
  review_link?: string;
};

// Replace {{token}} occurrences. Unknown tokens are left intact so a typo is
// visible rather than silently blanked.
export function fillTokens(text: string, tokens: Tokens): string {
  const map: Record<string, string> = {
    first_name: (tokens.first_name || "there").trim() || "there",
    shop_name: tokens.shop_name || SHOP_NAME,
    review_link: tokens.review_link || "",
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    key in map ? map[key] : whole,
  );
}

// Merge a DB row (if any) over the code default for a kind.
export function resolveTemplate(
  kind: FollowupKind,
  row?: Partial<Template> | null,
): Template {
  const base = DEFAULT_TEMPLATES[kind];
  if (!row) return base;
  return {
    kind,
    subject: row.subject?.trim() ? row.subject : base.subject,
    body: row.body?.trim() ? row.body : base.body,
    lead_days: typeof row.lead_days === "number" ? row.lead_days : base.lead_days,
    enabled: typeof row.enabled === "boolean" ? row.enabled : base.enabled,
  };
}

// Render the resolved subject + plain-text body to (subject, html, text) ready
// for Resend. The HTML wraps the text in the branded shell; a review_request
// with a link also gets a button.
export function renderEmail(
  tpl: Template,
  tokens: Tokens,
): { subject: string; html: string; text: string } {
  const subject = fillTokens(tpl.subject, tokens);
  const text = fillTokens(tpl.body, tokens);
  const reviewLink = tpl.kind === "review_request" ? tokens.review_link : undefined;
  return { subject, html: wrapHtml(KIND_LABEL[tpl.kind], text, reviewLink), text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapHtml(eyebrow: string, body: string, reviewLink?: string): string {
  // Turn the plain text into paragraphs/line breaks for HTML mail.
  const paras = body
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 14px;">${escapeHtml(
          p,
        ).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const button =
    reviewLink && reviewLink.trim()
      ? `<a href="${escapeHtml(reviewLink.trim())}" style="display:inline-block;background:#FF1493;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:10px;margin:4px 0 8px;">Leave a review</a>`
      : "";

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;margin:0;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
      <tr><td style="background:#0e0e11;padding:22px 28px;">
        <span style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">LUMENATI</span><span style="font-size:22px;font-weight:800;color:#FF1493;">.</span>
        <div style="font-size:10px;letter-spacing:3px;color:#8a8a92;margin-top:2px;text-transform:uppercase;">${escapeHtml(eyebrow)}</div>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        ${paras}
        ${button}
      </td></tr>
      <tr><td style="padding:0 28px 24px;">
        <div style="font-size:11px;color:#a1a1aa;border-top:1px solid #ececef;padding-top:14px;">${escapeHtml(
          SHOP_NAME,
        )} &nbsp;//&nbsp; you're receiving this because you visited the shop. Reply to opt out.</div>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}
