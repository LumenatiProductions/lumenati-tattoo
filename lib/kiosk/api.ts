// Kiosk client helpers. Browser-only (uses localStorage for the device token).
// The token is provisioned once on the iPad via the /kiosk setup screen and sent
// as x-kiosk-token on every call; it equals the server's KIOSK_DEVICE_TOKEN.

const TOKEN_KEY = "lumenati_kiosk_token";

export type ConsentState = "signed" | "unsigned" | "none";

export type KioskBooking = {
  id: string;
  startsAt: string;
  status: string;
  serviceDesc: string;
  depositCents: number;
  depositStatus: string;
  checkedIn: boolean;
  clientId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  artistName: string;
  consent: { state: ConsentState; token: string | null };
};

export const getKioskToken = () =>
  typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
export const setKioskToken = (t: string) => window.localStorage.setItem(TOKEN_KEY, t.trim());
export const clearKioskToken = () => window.localStorage.removeItem(TOKEN_KEY);

const headers = () => {
  const t = getKioskToken();
  return { "Content-Type": "application/json", ...(t ? { "x-kiosk-token": t } : {}) };
};

// Today, in the iPad's own local date, so "today" is the shop's day.
const localDate = () => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

export type TodayResult =
  | { ok: true; date: string; stripe: boolean; bookings: KioskBooking[] }
  | { ok: false; status: number; error: string };

export async function fetchToday(): Promise<TodayResult> {
  const r = await fetch(`/api/kiosk?date=${localDate()}`, { headers: headers() });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, error: d.error || "Could not load." };
  return { ok: true, date: d.date, stripe: !!d.stripe, bookings: d.bookings || [] };
}

export async function checkIn(
  bookingId: string,
  details: { firstName?: string; lastName?: string; phone?: string },
): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch("/api/kiosk", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ action: "checkin", bookingId, ...details }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, error: d.error || "Check-in failed." };
}

export async function startDeposit(
  bookingId: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const r = await fetch("/api/kiosk", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ action: "deposit", bookingId }),
  });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, url: d.url } : { ok: false, error: d.error || "Could not start payment." };
}
