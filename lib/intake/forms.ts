// Lumenati — Intake & Consent: the questionnaire + legal copy, in one place.
//
// IMPORTANT FOR SCOTT — HAVE COUNSEL REVIEW, THEN FLIP THE FLAG.
// The wording below is complete, industry-standard tattoo consent / medical /
// aftercare language, but it has NOT been reviewed by the shop's attorney for
// Colorado body-art requirements. Until LEGAL_COPY_REVIEWED is set to true the
// signer shows a "pending final legal review" notice. One line to flip once
// counsel signs off; edit any wording they change right here.
//
// This file is framework-agnostic (imported by both the public signer page and
// the server sign route), so keep it free of React / Next imports.

// Flip to true after the shop's attorney approves the language below.
export const LEGAL_COPY_REVIEWED = false;

// Local minimum age to be tattooed without a guardian. Default 18; override per
// jurisdiction. `age_ok` is computed server-side from `dob` against this number.
export const MIN_AGE = 18;

// Fixed coordinate space the draw-to-sign pad records in, so the stored path
// data renders identically wherever it's shown (signer page + staff view).
export const SIGNATURE_VIEWBOX = { w: 600, h: 200 };

export type IdType = "drivers_license" | "passport" | "state_id";

export const ID_TYPES: { value: IdType; label: string }[] = [
  { value: "drivers_license", label: "Driver's license" },
  { value: "passport", label: "Passport" },
  { value: "state_id", label: "State ID" },
];

// A yes/no medical question. A "yes" gets rolled into `medical_flags` so the
// artist sees it at a glance; the full set is snapshotted into `answers`.
export type MedicalQuestion = {
  key: string;
  label: string;
  // When true, answering "yes" is the noteworthy/flagged case (the default).
  flagOnYes?: boolean;
};

// Medical questionnaire. A "yes" answer flags the artist; none of these block
// the procedure by themselves (that judgment stays with the artist and shop).
export const MEDICAL_QUESTIONS: MedicalQuestion[] = [
  { key: "allergies", label: "Do you have any allergies, including to latex, adhesives, pigments or inks, metals, soaps, or antibiotic ointments?" },
  { key: "skin_conditions", label: "Do you have any skin conditions at or near the tattoo site, such as eczema, psoriasis, acne, rashes, moles, or a history of keloid scarring?" },
  { key: "blood_thinners", label: "Are you currently taking blood-thinning medication (including daily aspirin) or do you have a bleeding or clotting disorder?" },
  { key: "diabetes", label: "Do you have diabetes or another condition that affects healing?" },
  { key: "heart_condition", label: "Do you have a heart condition, high blood pressure, or take heart medication?" },
  { key: "immune_compromised", label: "Are you immunocompromised or currently taking medication that suppresses your immune system (including steroids or chemotherapy)?" },
  { key: "pregnant_nursing", label: "Are you pregnant or nursing?" },
  { key: "alcohol_drugs_24h", label: "Have you consumed alcohol or recreational drugs in the last 24 hours?" },
  { key: "fainting", label: "Do you have a history of fainting, seizures, epilepsy, or hemophilia?" },
  { key: "recent_procedures", label: "Have you had surgery, laser treatment, or another tattoo or piercing at or near this site in the last 6 months?" },
];

// Consent statements the signer must affirm (each a required checkbox).
// Standard tattoo consent and release language; pending the shop attorney's
// review (LEGAL_COPY_REVIEWED above).
export const CONSENT_STATEMENTS: string[] = [
  "I confirm that I am at least 18 years of age (or am accompanied by a parent or legal guardian who is co-signing this form), that the identification I will present is valid and mine, and that all information I have provided on this form is true, accurate, and complete.",
  "I understand that a tattoo is a permanent change to my appearance and that no guarantee has been made to me about my ability to later remove or modify it. Touch-ups, fading, and variation in healed color are normal and not the artist's fault.",
  "I understand the procedure involves needles and carries inherent risks, including but not limited to: pain, bleeding, swelling, bruising, infection, allergic reaction to pigments or aftercare products, scarring, keloid formation, and the transmission of bloodborne pathogens if aftercare instructions are not followed.",
  "I have answered the health questions on this form honestly and have disclosed all conditions, medications, and allergies that could affect this procedure or its healing. I understand the shop relies on my answers.",
  "I am not under the influence of alcohol or drugs, I am consenting to this procedure freely and voluntarily, and I acknowledge that I have had the opportunity to ask my artist any questions about the procedure, the design, and its placement before signing.",
  "I have reviewed and approved the design, spelling, and placement of my tattoo. I accept full responsibility for the design and placement choices reflected in my approval.",
  "I agree to follow the written aftercare instructions provided to me, and I understand that the shop and artist are not responsible for complications, infection, or poor healing that result from my failure to follow them.",
  "To the fullest extent permitted by law, I release and hold harmless Lumenati Tattoo, its owners, employees, and artists from all claims, damages, and causes of action arising from this procedure, except those caused by gross negligence or willful misconduct. I consent to receive the tattoo described on this form.",
];

// Aftercare statements acknowledged as a single block (`aftercare_ack`).
export const AFTERCARE_STATEMENTS: string[] = [
  "Leave the bandage or second-skin film on for as long as your artist instructed before removing it with clean hands.",
  "Wash the tattoo gently with lukewarm water and unscented antibacterial soap, then pat dry with a clean paper towel. Do not scrub.",
  "Apply a thin layer of the recommended aftercare product 2 to 3 times a day. More is not better; the tattoo needs to breathe.",
  "Keep the healing tattoo out of pools, hot tubs, baths, lakes, and ocean water. Quick showers are fine.",
  "Keep it out of direct sunlight and tanning beds until fully healed; after that, use sunscreen to protect the color.",
  "Do not pick, scratch, or peel flaking skin. Let it shed on its own.",
  "Wear clean, loose clothing over the area and sleep on clean sheets while it heals.",
  "Some redness, tenderness, and light scabbing is normal for the first days. If you see spreading redness, swelling, hot skin, pus, red streaks, or run a fever, contact the shop and seek medical care right away.",
];

// Compute whether a date-of-birth clears MIN_AGE as of a reference instant
// (defaults to now). Returns null if the dob is missing/unparseable.
export function computeAgeOk(dob: string | null | undefined, asOf?: Date): boolean | null {
  if (!dob) return null;
  // Anchor a date-only DOB to LOCAL midnight: bare YYYY-MM-DD parses as UTC,
  // and comparing that against local date components shifted birthdays a day
  // early for anyone west of UTC (a minor could pass the gate on the eve of
  // their 18th). Caught by tests/messaging.test.ts.
  const born = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dob) ? `${dob}T00:00:00` : dob);
  if (Number.isNaN(born.getTime())) return null;
  const ref = asOf ?? new Date();
  let age = ref.getFullYear() - born.getFullYear();
  const m = ref.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < born.getDate())) age--;
  return age >= MIN_AGE;
}

// Roll the "yes" medical answers into the short `medical_flags` summary string
// the artist reads. `answers` maps question key -> "yes" | "no" (+ optional
// free-text detail under `${key}_detail`).
export function summarizeMedicalFlags(answers: Record<string, unknown>): string {
  const flagged: string[] = [];
  for (const q of MEDICAL_QUESTIONS) {
    const yes = String(answers[q.key] ?? "").toLowerCase() === "yes";
    if ((q.flagOnYes ?? true) === yes && yes) {
      const detail = String(answers[`${q.key}_detail`] ?? "").trim();
      // Use the human label minus the PLACEHOLDER prefix for readability.
      const label = q.label.replace(/^PLACEHOLDER —\s*/, "").replace(/\?$/, "");
      flagged.push(detail ? `${label}: ${detail}` : label);
    }
  }
  return flagged.join(" · ");
}
