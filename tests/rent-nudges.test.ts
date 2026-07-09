import { describe, expect, it } from "vitest";
import { rentNudgeDue } from "@/lib/rent/job";

// The nudge ladder: invoice ready (mint), due today, past due (+3d), then a
// firmer weekly repeat. One message per rung, only the latest owed rung, and
// dry-run/no-delivery never advances anything (that's the caller's job — the
// function only answers "what is owed given how many were delivered").

describe("rentNudgeDue", () => {
  const created = "2026-07-01";
  const due = "2026-07-05";

  it("owes the first notice on mint day", () => {
    expect(rentNudgeDue(created, due, "2026-07-01", 0)).toEqual({ rung: 1, tone: "ready" });
  });

  it("owes nothing the day after the first notice was delivered", () => {
    expect(rentNudgeDue(created, due, "2026-07-02", 1)).toBeNull();
  });

  it("owes the due-today rung on the due date", () => {
    expect(rentNudgeDue(created, due, "2026-07-05", 1)).toEqual({ rung: 2, tone: "due" });
  });

  it("owes the past-due rung three days after due", () => {
    expect(rentNudgeDue(created, due, "2026-07-08", 2)).toEqual({ rung: 3, tone: "late" });
  });

  it("escalates to firm weekly after a week late", () => {
    expect(rentNudgeDue(created, due, "2026-07-12", 3)).toEqual({ rung: 4, tone: "firm" });
    expect(rentNudgeDue(created, due, "2026-07-19", 4)).toEqual({ rung: 5, tone: "firm" });
  });

  it("collapses missed rungs into ONE message at the latest tone", () => {
    // Nothing ever delivered, it's already 10 days past due: one firm/late
    // message, not four catch-up texts.
    const n = rentNudgeDue(created, due, "2026-07-15", 0);
    expect(n?.tone).toBe("firm");
    expect(rentNudgeDue(created, due, "2026-07-15", n!.rung)).toBeNull();
  });

  it("stops escalating after the ladder tops out (six weeks)", () => {
    const top = rentNudgeDue(created, due, "2026-12-01", 0);
    expect(top?.tone).toBe("firm");
    expect(rentNudgeDue(created, due, "2026-12-25", top!.rung)).toBeNull();
  });

  it("handles an invoice minted after its own due date (late generation)", () => {
    // Minted on the 10th with a due date of the 5th: mint + due + late rungs
    // have all passed — one message owed, at the late tone.
    const n = rentNudgeDue("2026-07-10", due, "2026-07-10", 0);
    expect(n).not.toBeNull();
    expect(["late", "firm"]).toContain(n!.tone);
  });
});
