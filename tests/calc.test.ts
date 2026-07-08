import { describe, expect, it } from "vitest";
import { statementFor, shopSummary, fmt, fmtPrecise } from "@/lib/admin/calc";
import type { Artist, Sale } from "@/lib/admin/types";

// The pay math is the money-critical core (2026-07-08 rebuild). Invariants:
// the shop cuts no checks and withholds nothing — renters get 100% of their
// card sales passed through (rent NEVER nets in), split artists' share is a
// Gusto payroll-prep number, and the salaried owner has no statement.

const splitArtist: Artist = {
  id: "a1",
  slug: "a1",
  name: "Split Artist",
  handle: "split",
  color: "#fff",
  active: true,
  pay: { type: "payroll_split", shopSplitPct: 0.3 },
  squareTeamMemberId: null,
};

const renter: Artist = {
  id: "a2",
  slug: "a2",
  name: "Booth Renter",
  handle: "rent",
  color: "#000",
  active: true,
  pay: { type: "booth_rent", rentCents: 80000 },
  squareTeamMemberId: null,
};

const ownerSalary: Artist = {
  id: "a3",
  slug: "a3",
  name: "Salaried Owner",
  handle: "owner",
  color: "#f0f",
  active: true,
  pay: { type: "payroll_salary" },
  squareTeamMemberId: null,
};

const sale = (artistId: string, serviceCents: number, tipCents: number, method: "card" | "cash"): Sale => ({
  id: `s-${artistId}-${serviceCents}-${method}`,
  artistId,
  date: "2026-06-01",
  serviceCents,
  tipCents,
  method,
  squarePaymentId: null,
  description: "",
});

describe("statementFor — payroll split", () => {
  it("computes the Gusto wages: artist share of service + all tips", () => {
    const st = statementFor(splitArtist, [sale("a1", 10000, 2000, "card")]);
    expect(st.shopCut).toBe(3000); // 30% of service
    expect(st.artistEarnings).toBe(7000 + 2000); // 70% + all tips
    expect(st.gustoWages).toBe(9000);
    expect(st.passThroughOwed).toBe(0); // nothing is "held" — Gusto pays
    expect(st.net).toBe(9000); // clears when marked entered into Gusto
  });

  it("cash tickets still land in the wages number — nothing nets against them", () => {
    const st = statementFor(splitArtist, [sale("a1", 10000, 2000, "cash")]);
    expect(st.shopCut).toBe(3000);
    expect(st.gustoWages).toBe(9000); // same wages basis as a card ticket
    expect(st.cashService).toBe(10000);
    expect(st.cashTips).toBe(2000);
  });
});

describe("statementFor — booth renter", () => {
  it("card sales are held 100% for the renter: full service + tips, no shop cut", () => {
    const st = statementFor(renter, [sale("a2", 50000, 5000, "card")]);
    expect(st.shopCut).toBe(0);
    expect(st.artistEarnings).toBe(55000); // all theirs
    expect(st.passThroughOwed).toBe(55000); // shop holds it until handed over
    expect(st.gustoWages).toBe(0);
    expect(st.net).toBe(55000);
  });

  it("cash never touches the shop — the renter already holds it", () => {
    const st = statementFor(renter, [sale("a2", 50000, 5000, "cash")]);
    expect(st.artistEarnings).toBe(55000); // still their money
    expect(st.passThroughOwed).toBe(0); // nothing for the shop to hand over
    expect(st.net).toBe(0);
  });

  it("rent NEVER appears in a statement — no netting, no owed-to-shop", () => {
    // renter.pay.rentCents is 80000 and unpaid; the statement must not care.
    const st = statementFor(renter, [sale("a2", 10000, 0, "card")]);
    expect(st.net).toBe(10000); // full pass-through, rent billed separately
  });
});

describe("statementFor — salaried owner", () => {
  it("his tickets are entirely shop money and his statement never owes anything", () => {
    const st = statementFor(ownerSalary, [
      sale("a3", 40000, 6000, "card"),
      sale("a3", 10000, 1000, "cash"),
    ]);
    expect(st.shopCut).toBe(57000); // all service + all tips
    expect(st.artistEarnings).toBe(0);
    expect(st.passThroughOwed).toBe(0);
    expect(st.gustoWages).toBe(0);
    expect(st.net).toBe(0); // nothing to settle, ever
  });
});

describe("statementFor — scoping", () => {
  it("ignores other artists' sales", () => {
    const st = statementFor(splitArtist, [sale("a2", 99999, 0, "card")]);
    expect(st.saleCount).toBe(0);
    expect(st.net).toBe(0);
  });
});

describe("shopSummary", () => {
  it("splits the money three ways: shop's take, renter pass-through, Gusto wages", () => {
    const sales = [
      sale("a1", 10000, 0, "card"), // split: 3000 shop / 7000 wages
      sale("a2", 20000, 2000, "card"), // renter: 22000 pass-through
      sale("a3", 5000, 500, "card"), // owner: 5500 shop
    ];
    const s = shopSummary([splitArtist, renter, ownerSalary], sales);
    expect(s.splitRevenue).toBe(3000 + 5500);
    expect(s.renterPassThrough).toBe(22000);
    expect(s.gustoWagesDue).toBe(7000);
    expect(s.grossSales).toBe(37500);
    expect(s.cardTotal).toBe(37500);
    expect(s.cashTotal).toBe(0);
  });
});

describe("formatters", () => {
  it("fmt rounds to whole dollars; fmtPrecise keeps cents", () => {
    expect(fmt(123456)).toBe("$1,235");
    expect(fmtPrecise(123456)).toBe("$1,234.56");
  });
});
