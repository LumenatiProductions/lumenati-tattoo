// "Today" for humans in the shop. new Date().toISOString() is UTC — from
// 5-6pm in Denver that's already TOMORROW, so date defaults, "due today"
// checks, and day filters must use the device's local calendar instead.
export const todayLocal = (now: Date = new Date()): string =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

// The same idea for SERVER code, where the device clock is UTC (Vercel): the
// calendar day of an instant on the SHOP's wall clock, as YYYY-MM-DD (en-CA
// formats ISO-shaped). Evening bookings must not slide to tomorrow's date, or
// every day-granular rail (reminders, aftercare, due-today math) runs a day
// off for the shop's own evenings.
export const shopDay = (
  at: Date | string = new Date(),
  tz: string = process.env.SHOP_TIMEZONE || "America/Denver",
): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);

// What the shop's wall clock reads at a given instant, expressed as a UTC
// offset in ms (Denver: -6h in summer, -7h in winter).
const tzOffsetMs = (instant: number, tz: string): number => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - instant;
};

// The UTC instant when a shop-calendar day begins / ends. Report and P&L
// windows must cut at the SHOP's midnights — a naive `<day>T00:00:00` string
// compares as UTC midnight, which is the previous evening in Denver, so sales
// after ~6pm on a range's last day would fall into the wrong period.
export const shopDayStartUtc = (
  day: string,
  tz: string = process.env.SHOP_TIMEZONE || "America/Denver",
): string => {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  // Shift by the offset, then re-read the offset at the shifted instant so a
  // DST changeover on that very night still lands on the true wall midnight.
  let t = utcMidnight - tzOffsetMs(utcMidnight, tz);
  t = utcMidnight - tzOffsetMs(t, tz);
  return new Date(t).toISOString();
};

export const shopDayEndUtc = (
  day: string,
  tz: string = process.env.SHOP_TIMEZONE || "America/Denver",
): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const nextStart = Date.parse(shopDayStartUtc(d.toISOString().slice(0, 10), tz));
  return new Date(nextStart - 1).toISOString();
};

// The shop-calendar day a LEDGER row belongs to. Two write conventions live
// in `occurred_at`: cash rows carry a bare shop date (stored as UTC midnight,
// meaning that literal day) while Stripe rows carry the real settle instant
// (which must convert through the shop clock, or a 7pm Denver sale buckets to
// tomorrow). Exactly-midnight-UTC is the tell for a date-only write.
export const ledgerShopDay = (
  occurredAt: string,
  tz: string = process.env.SHOP_TIMEZONE || "America/Denver",
): string =>
  /T00:00:00(\.0+)?(\+00:?0?0?|Z)?$/.test(occurredAt)
    ? occurredAt.slice(0, 10)
    : shopDay(occurredAt, tz);
