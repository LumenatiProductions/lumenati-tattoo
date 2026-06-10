import { describe, expect, it } from "vitest";
import { fillTokens, resolveTemplate, DEFAULT_TEMPLATES } from "@/lib/followups/templates";
import { normalizePhone, looksLikePhone } from "@/lib/sms";
import { computeAgeOk, summarizeMedicalFlags, MEDICAL_QUESTIONS } from "@/lib/intake/forms";

describe("fillTokens", () => {
  it("substitutes known tokens and leaves unknown ones visible", () => {
    expect(fillTokens("Hi {{first_name}} from {{shop_name}} {{bogus}}", { first_name: "Sam" })).toBe(
      "Hi Sam from Lumenati Tattoo {{bogus}}",
    );
  });

  it("falls back to 'there' for a missing first name", () => {
    expect(fillTokens("Hi {{first_name}}", {})).toBe("Hi there");
  });

  it("renders artist_with only when an artist is known", () => {
    expect(fillTokens("booked{{artist_with}}", { artist_name: "JD" })).toBe("booked with JD");
    expect(fillTokens("booked{{artist_with}}", {})).toBe("booked");
  });
});

describe("resolveTemplate", () => {
  it("DB row wins over the code default, blank fields fall back", () => {
    const t = resolveTemplate("aftercare", { subject: "Custom", body: "", enabled: false });
    expect(t.subject).toBe("Custom");
    expect(t.body).toBe(DEFAULT_TEMPLATES.aftercare.body);
    expect(t.enabled).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("US 10-digit formats normalize to E.164", () => {
    expect(normalizePhone("(303) 555-0123")).toBe("+13035550123");
    expect(normalizePhone("303.555.0123")).toBe("+13035550123");
    expect(normalizePhone("1-303-555-0123")).toBe("+13035550123");
    expect(normalizePhone("+13035550123")).toBe("+13035550123");
  });

  it("garbage is null, never a fake number", () => {
    expect(normalizePhone("555-0123")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("looksLikePhone", () => {
  it("routes by shape: digits = phone, @ = email", () => {
    expect(looksLikePhone("(303) 555-0123")).toBe(true);
    expect(looksLikePhone("sam@example.com")).toBe(false);
    expect(looksLikePhone("sam303555@example.com")).toBe(false);
  });
});

describe("computeAgeOk", () => {
  const asOf = new Date("2026-06-10T12:00:00Z");
  it("18 today clears; 18 tomorrow does not", () => {
    expect(computeAgeOk("2008-06-10", asOf)).toBe(true);
    expect(computeAgeOk("2008-06-11", asOf)).toBe(false);
  });
  it("missing/garbage dob is null (unknown), not a pass", () => {
    expect(computeAgeOk("", asOf)).toBeNull();
    expect(computeAgeOk("not-a-date", asOf)).toBeNull();
  });
});

describe("summarizeMedicalFlags", () => {
  it("rolls yes answers (with detail) into the artist-facing summary", () => {
    const key = MEDICAL_QUESTIONS[0].key;
    const out = summarizeMedicalFlags({ [key]: "yes", [`${key}_detail`]: "latex" });
    expect(out).toContain("latex");
    expect(out.length).toBeGreaterThan(0);
  });
  it("all-no is an empty summary", () => {
    expect(summarizeMedicalFlags({})).toBe("");
  });
});
