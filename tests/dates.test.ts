import { describe, expect, it } from "vitest";
import { todayLocal } from "@/lib/dates";

// The local-day formula must agree with the JS engine's own idea of the local
// calendar date (en-CA formats as YYYY-MM-DD) for any instant — including the
// evening window where UTC has already rolled to tomorrow.
const oracle = (d: Date) => d.toLocaleDateString("en-CA");

describe("todayLocal", () => {
  it("matches the engine's local calendar date across day boundaries", () => {
    const instants = [
      new Date("2026-07-08T12:00:00Z"), // midday, no ambiguity
      new Date("2026-07-09T03:30:00Z"), // Denver 9:30pm Jul 8 — UTC says Jul 9
      new Date("2026-07-09T05:59:59Z"), // one second before Denver midnight
      new Date("2026-01-01T06:59:00Z"), // New Year's Eve evening in Denver (MST)
      new Date("2026-03-08T09:30:00Z"), // spring-forward morning
      new Date("2026-11-01T08:30:00Z"), // fall-back morning
    ];
    for (const d of instants) {
      expect(todayLocal(d)).toBe(oracle(d));
    }
  });

  it("never returns UTC-tomorrow for a late local evening", () => {
    // 11:59pm local on Jul 8, whatever this machine's timezone is.
    const local = new Date(2026, 6, 8, 23, 59, 0);
    expect(todayLocal(local)).toBe("2026-07-08");
  });
});
