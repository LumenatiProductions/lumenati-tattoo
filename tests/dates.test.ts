import { describe, expect, it } from "vitest";
import { todayLocal, shopDay, shopDayStartUtc, shopDayEndUtc, ledgerShopDay } from "@/lib/dates";

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

describe("shopDay", () => {
  const DENVER = "America/Denver";

  it("keeps an evening Denver booking on the Denver date, not UTC-tomorrow", () => {
    // 7pm Jul 8 in Denver = 01:00 Jul 9 UTC. The reminder/aftercare rails
    // must see Jul 8.
    expect(shopDay("2026-07-09T01:00:00Z", DENVER)).toBe("2026-07-08");
  });

  it("handles midday with no ambiguity", () => {
    expect(shopDay("2026-07-08T18:00:00Z", DENVER)).toBe("2026-07-08");
  });

  it("holds the month boundary on the shop clock", () => {
    // Jan 31 9pm Denver = Feb 1 04:00 UTC — still January for the shop, so
    // rent generation must not mint February's invoice yet.
    expect(shopDay("2026-02-01T04:00:00Z", DENVER)).toBe("2026-01-31");
    expect(shopDay("2026-02-01T04:00:00Z", DENVER).slice(0, 7)).toBe("2026-01");
  });

  it("is stable across the DST transitions", () => {
    // Spring forward (Mar 8 2026, 2am MST -> 3am MDT) and fall back (Nov 1).
    expect(shopDay("2026-03-08T08:59:00Z", DENVER)).toBe("2026-03-08"); // 1:59am MST
    expect(shopDay("2026-03-08T09:01:00Z", DENVER)).toBe("2026-03-08"); // 3:01am MDT
    expect(shopDay("2026-11-01T07:30:00Z", DENVER)).toBe("2026-11-01"); // 1:30am (first pass)
    expect(shopDay("2026-11-01T08:30:00Z", DENVER)).toBe("2026-11-01"); // 1:30am (second pass)
  });

  it("accepts Date instances too", () => {
    expect(shopDay(new Date("2026-07-09T01:00:00Z"), DENVER)).toBe("2026-07-08");
  });
});

describe("shop day bounds (UTC instants of the shop's midnights)", () => {
  const DENVER = "America/Denver";

  it("summer (MDT, UTC-6) and winter (MST, UTC-7) starts", () => {
    expect(shopDayStartUtc("2026-08-02", DENVER)).toBe("2026-08-02T06:00:00.000Z");
    expect(shopDayStartUtc("2026-01-15", DENVER)).toBe("2026-01-15T07:00:00.000Z");
  });

  it("end of day is one ms before the next shop midnight", () => {
    expect(shopDayEndUtc("2026-08-02", DENVER)).toBe("2026-08-03T05:59:59.999Z");
    // Fall-back day is 25 hours long; the end still lands cleanly.
    expect(shopDayEndUtc("2026-11-01", DENVER)).toBe("2026-11-02T06:59:59.999Z");
  });
});

describe("ledgerShopDay — the two occurred_at conventions", () => {
  const DENVER = "America/Denver";

  it("a bare-date cash row (midnight UTC) means that literal day", () => {
    expect(ledgerShopDay("2026-08-02T00:00:00+00:00", DENVER)).toBe("2026-08-02");
    expect(ledgerShopDay("2026-08-02T00:00:00Z", DENVER)).toBe("2026-08-02");
  });

  it("a real Stripe instant converts through the shop clock", () => {
    // 7:30pm Denver on Aug 2 = 01:30 UTC Aug 3 — still Aug 2 for the books.
    expect(ledgerShopDay("2026-08-03T01:30:00Z", DENVER)).toBe("2026-08-02");
  });
});
