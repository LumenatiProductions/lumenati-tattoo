// Follow-up templates: the wording the shop sends after a visit. Code holds the
// defaults; the `followup_templates` table holds the desk's edits (subject, body,
// lead time, on/off). Both the daily job and the manual-send route resolve a
// kind through `resolveTemplate` so they always agree.
//
// Bodies are PLAIN TEXT with {{tokens}} — on-brand, no emojis (Scott's rule).
// `renderEmail` substitutes tokens and wraps the text in the Y2K window shell
// (lib/email/y2k.ts) — client mail matches the public site, not the console.

import { renderY2kEmail } from "@/lib/email/y2k";

export type FollowupKind =
  | "aftercare"
  | "review_request"
  | "rebook_nudge"
  | "birthday"
  | "reminder_48h"
  | "reminder_24h"
  | "healed_photo";

export const FOLLOWUP_KINDS: FollowupKind[] = [
  "reminder_48h",
  "reminder_24h",
  "aftercare",
  "review_request",
  "healed_photo",
  "rebook_nudge",
  "birthday",
];

export const KIND_LABEL: Record<FollowupKind, string> = {
  aftercare: "Aftercare",
  review_request: "Review request",
  rebook_nudge: "Rebook nudge",
  birthday: "Birthday",
  reminder_48h: "Reminder (48h)",
  reminder_24h: "Reminder (24h)",
  healed_photo: "Healed photo",
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

Your day-by-day care timeline lives here — it follows along as it heals: {{care_link}}

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
  // Reminders are written SMS-length on purpose — they go out as texts when
  // Twilio is configured, email otherwise. lead_days = days BEFORE the visit.
  reminder_48h: {
    kind: "reminder_48h",
    subject: "Your appointment at {{shop_name}} is in two days",
    lead_days: 2,
    enabled: true,
    body: `Hi {{first_name}}, this is {{shop_name}}. You are booked {{appointment_time}}{{artist_with}}. Reply C to confirm, or call the shop if you need to move it. Heads up: deposits are forfeited on no-shows.`,
  },
  reminder_24h: {
    kind: "reminder_24h",
    subject: "See you tomorrow at {{shop_name}}",
    lead_days: 1,
    enabled: true,
    body: `Hi {{first_name}}, see you {{appointment_time}}{{artist_with}} at {{shop_name}}. Eat beforehand, stay hydrated, and bring your ID. Reply C to confirm.`,
  },
  healed_photo: {
    kind: "healed_photo",
    subject: "How did it heal? We would love a photo",
    lead_days: 14, // after the visit, once it's healed enough to show off
    enabled: true,
    body: `Hi {{first_name}},

Your tattoo from {{shop_name}} should be just about healed by now. If you are happy with how it settled in, we would love a quick photo for the artist's portfolio. Upload it here, it takes ten seconds: {{healed_link}}

If anything about the healing does not look right, reply and we will take a look.

Thank you,
{{shop_name}}`,
  },
};

export const SHOP_NAME = "Lumenati Tattoo";

type Tokens = {
  first_name?: string | null;
  shop_name?: string;
  review_link?: string;
  /** "Tue Jun 16 at 2:00 PM" — for reminders. */
  appointment_time?: string | null;
  /** Artist display name — for reminders. */
  artist_name?: string | null;
  /** Upload URL — for healed_photo. */
  healed_link?: string | null;
  /** Aftercare timeline URL — for aftercare. */
  care_link?: string | null;
};

// Replace {{token}} occurrences. Unknown tokens are left intact so a typo is
// visible rather than silently blanked. {{artist_with}} renders " with NAME"
// only when an artist is known, so copy never reads "with ".
export function fillTokens(text: string, tokens: Tokens): string {
  const map: Record<string, string> = {
    first_name: (tokens.first_name || "there").trim() || "there",
    shop_name: tokens.shop_name || SHOP_NAME,
    review_link: tokens.review_link || "",
    appointment_time: tokens.appointment_time || "at your scheduled time",
    artist_name: tokens.artist_name || "",
    artist_with: tokens.artist_name ? ` with ${tokens.artist_name}` : "",
    healed_link: tokens.healed_link || "",
    care_link: tokens.care_link || "",
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) =>
    key in map ? map[key] : whole,
  );
}

// Render the resolved body as a plain SMS (no HTML shell, no subject).
export function renderSms(tpl: Template, tokens: Tokens): string {
  return fillTokens(tpl.body, tokens);
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
// for Resend. Client mail wears the Y2K shell (matches the public site); the
// body's first line becomes the headline, links become the gel button.
export function renderEmail(
  tpl: Template,
  tokens: Tokens,
): { subject: string; html: string; text: string } {
  const subject = fillTokens(tpl.subject, tokens);
  const text = fillTokens(tpl.body, tokens);

  // Pull the button out of the body: review link, healed-photo upload link,
  // or the aftercare timeline.
  const buttonUrl =
    tpl.kind === "review_request" && tokens.review_link?.trim()
      ? tokens.review_link.trim()
      : tpl.kind === "healed_photo" && tokens.healed_link?.trim()
        ? tokens.healed_link.trim()
        : tpl.kind === "aftercare" && tokens.care_link?.trim()
          ? tokens.care_link.trim()
          : undefined;
  const buttonLabel =
    tpl.kind === "review_request"
      ? "Leave a review"
      : tpl.kind === "healed_photo"
        ? "Upload your photo"
        : tpl.kind === "aftercare"
          ? "Open your care timeline"
          : "";

  const WINDOW_TITLE: Record<FollowupKind, string> = {
    aftercare: "aftercare.txt",
    review_request: "how_did_we_do.exe",
    rebook_nudge: "next_piece.exe",
    birthday: "happy_bday.exe",
    reminder_48h: "see_you_soon.exe",
    reminder_24h: "tomorrow.exe",
    healed_photo: "show_us.exe",
  };

  // Body paragraphs: strip the raw URL line when it became the button.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => (buttonUrl ? p.replace(buttonUrl, "").trim() : p))
    .map((p) => p.replace(/(Leave a review here:|Upload it here, it takes ten seconds:)\s*$/i, "").trim())
    .filter(Boolean);

  const html = renderY2kEmail({
    windowTitle: WINDOW_TITLE[tpl.kind],
    headline: subject,
    paragraphs,
    button: buttonUrl ? { label: buttonLabel, url: buttonUrl } : undefined,
    finePrint: buttonUrl,
  });
  return { subject, html, text };
}
