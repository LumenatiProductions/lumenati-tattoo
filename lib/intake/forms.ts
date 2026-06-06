// Lumenati — Intake & Consent: the questionnaire + legal copy, in one place.
//
// IMPORTANT FOR SCOTT — REPLACE THE PLACEHOLDER LEGAL TEXT.
// Everything marked `PLACEHOLDER` below is filler so the form renders. Do NOT
// go live with it. Drop in the shop's real, lawyer-approved consent, medical
// questionnaire, and aftercare wording (and set MIN_AGE for your locale). The
// build does not invent legal language; it only lays out whatever lives here.
//
// This file is framework-agnostic (imported by both the public signer page and
// the server sign route), so keep it free of React / Next imports.

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

// PLACEHOLDER medical questionnaire — replace with the shop's real intake.
export const MEDICAL_QUESTIONS: MedicalQuestion[] = [
  { key: "allergies", label: "PLACEHOLDER — Do you have any allergies (latex, inks, metals, etc.)?" },
  { key: "skin_conditions", label: "PLACEHOLDER — Any skin conditions at or near the tattoo site (eczema, psoriasis, keloids)?" },
  { key: "blood_thinners", label: "PLACEHOLDER — Are you taking blood thinners or aspirin?" },
  { key: "diabetes", label: "PLACEHOLDER — Do you have diabetes?" },
  { key: "heart_condition", label: "PLACEHOLDER — Any heart condition or do you take heart medication?" },
  { key: "pregnant_nursing", label: "PLACEHOLDER — Are you pregnant or nursing?" },
  { key: "alcohol_drugs_24h", label: "PLACEHOLDER — Have you consumed alcohol or recreational drugs in the last 24 hours?" },
  { key: "fainting", label: "PLACEHOLDER — Do you have a history of fainting or seizures?" },
];

// Consent statements the signer must affirm (each a required checkbox).
// PLACEHOLDER — replace with the shop's lawyer-approved consent language.
export const CONSENT_STATEMENTS: string[] = [
  "PLACEHOLDER — I confirm I am of legal age and the information I have provided is true and complete.",
  "PLACEHOLDER — I understand a tattoo is permanent and carries risks including infection, allergic reaction, and scarring.",
  "PLACEHOLDER — I am not under the influence of alcohol or drugs and am consenting voluntarily.",
  "PLACEHOLDER — I release Lumenati Tattoo and its artists from liability arising from this procedure to the extent permitted by law.",
];

// Aftercare statements acknowledged as a single block (`aftercare_ack`).
// PLACEHOLDER — replace with the shop's real aftercare instructions.
export const AFTERCARE_STATEMENTS: string[] = [
  "PLACEHOLDER — Keep the bandage on for the time my artist specified.",
  "PLACEHOLDER — Wash gently with unscented soap and apply the recommended aftercare product.",
  "PLACEHOLDER — Avoid soaking, swimming, and direct sun on the healing tattoo.",
  "PLACEHOLDER — Do not pick or scratch; contact the shop if I see signs of infection.",
];

// Compute whether a date-of-birth clears MIN_AGE as of a reference instant
// (defaults to now). Returns null if the dob is missing/unparseable.
export function computeAgeOk(dob: string | null | undefined, asOf?: Date): boolean | null {
  if (!dob) return null;
  const born = new Date(dob);
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
