import { describe, expect, it } from "vitest";
import { statementFor, shopSummary, fmt, fmtPrecise } from "@/lib/admin/calc";
import type { Artist, Sale, RentCharge } from "@/lib/admin/types";

// The settlement math is the money-critical core: card money the shop holds vs
// cash the artist collected vs rent. These tests pin the invariants.

const splitArtist: Artist = {
  id: "a1",
  slug: "a1",
  name: "Split Artist",
  handle: "split",
  color: "#fff",
  active: true,
  pay: { type: "split", shopSplitPct: 0.3 },
  squareTeamMemberId: null,
};

const rentArtist: Artist = {
  id: "a2",
  slug: "a2",
  name: "Rent Artist",
  handle: "rent",
  color: "#000",
  active: true,
  pay: { type: "rent", rentCents: 80000 },
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

describe("statementFor", () => {
  it("splits a card ticket: shop holds card money, owes artist their share + tips", () => {
    const st = statementFor(splitArtist, [sale("a1", 10000, 2000, "card")], []);
    expect(st.shopCut).toBe(3000); // 30% of service
    expect(st.shopOwesArtist).toBe(7000 + 2000); // 70% + all tips
    expect(st.artistOwesShop).toBe(0);
    expect(st.net).toBe(9000); // shop pays artist
  });

  it("cash ticket flips the flow: artist holds the cash, owes the shop its cut", () => {
    const st = statementFor(splitArtist, [sale("a1", 10000, 2000, "cash")], []);
    expect(st.shopOwesArtist).toBe(0);
    expect(st.artistOwesShop).toBe(3000);
    expect(st.net).toBe(-3000); // artist pays shop
  });

  it("rent artist keeps 100% of tickets; unpaid rent is what they owe", () => {
    const rent: RentCharge[] = [
      { id: "r1", artistId: "a2", periodLabel: "Jun", amountCents: 80000, dueDate: "2026-06-05", paid: false },
    ];
    const st = statementFor(rentArtist, [sale("a2", 50000, 5000, "card")], rent);
    expect(st.shopCut).toBe(0);
    expect(st.rentOwed).toBe(80000);
    expect(st.shopOwesArtist).toBe(55000); // full card service + tips
    expect(st.artistOwesShop).toBe(80000); // just the rent
    expect(st.net).toBe(-25000);
  });

  it("paid rent drops out of the statement", () => {
    const rent: RentCharge[] = [
      { id: "r1", artistId: "a2", periodLabel: "Jun", amountCents: 80000, dueDate: "2026-06-05", paid: true },
    ];
    const st = statementFor(rentArtist, [], rent);
    expect(st.rentOwed).toBe(0);
    expect(st.net).toBe(0);
  });

  it("ignores other artists' sales and rent", () => {
    const st = statementFor(splitArtist, [sale("a2", 99999, 0, "card")], [
      { id: "r", artistId: "a2", periodLabel: "Jun", amountCents: 1, dueDate: "", paid: false },
    ]);
    expect(st.saleCount).toBe(0);
    expect(st.net).toBe(0);
  });
});

describe("shopSummary", () => {
  it("payouts owed + collect-from-artists mirror the per-artist nets", () => {
    const sales = [sale("a1", 10000, 0, "card"), sale("a1", 10000, 0, "cash")];
    const s = shopSummary([splitArtist], sales, []);
    // card: shop owes 7000; cash: artist owes 3000 -> net +4000 to artist
    expect(s.payoutsOwed).toBe(4000);
    expect(s.collectFromArtists).toBe(0);
    expect(s.cardTotal).toBe(10000);
    expect(s.cashTotal).toBe(10000);
  });
});

describe("formatters", () => {
  it("fmt rounds to whole dollars; fmtPrecise keeps cents", () => {
    expect(fmt(123456)).toBe("$1,235");
    expect(fmtPrecise(123456)).toBe("$1,234.56");
  });
});
