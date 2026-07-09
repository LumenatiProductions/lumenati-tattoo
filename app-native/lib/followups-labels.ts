// Human names for followup kinds — mirrors the web's KIND_LABEL
// (lib/followups/templates.ts); the app can't import across the boundary.
export const KIND_LABEL: Record<string, string> = {
  aftercare: "aftercare",
  review_request: "review ask",
  rebook_nudge: "rebook nudge",
  birthday: "birthday",
  reminder_48h: "48h reminder",
  reminder_24h: "24h reminder",
  healed_photo: "healed-photo ask",
};
