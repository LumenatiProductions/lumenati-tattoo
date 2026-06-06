"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type BookingStatus = "scheduled" | "completed" | "no_show" | "cancelled";
export type DepositStatus = "none" | "held" | "applied" | "forfeited" | "refunded";

// Mirrors the DB row shape (snake_case) so the page reads it directly.
export type Booking = {
  id: string;
  square_appointment_id: string | null;
  client_id: string | null;
  artist_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: BookingStatus;
  service_desc: string;
  est_price_cents: number;
  deposit_cents: number;
  deposit_status: DepositStatus;
  deposit_payment_id: string | null;
  sale_id: string | null;
  notes: string;
  source: "manual" | "square" | "web_request";
  created_at: string;
  synced_at: string;
  checked_in_at: string | null; // kiosk self check-in (POS-STARTER-2); null = not arrived
};

export type NewBooking = {
  startsAt: string;
  endsAt?: string;
  clientId?: string | null;
  artistId?: string | null;
  serviceDesc?: string;
  estPriceCents?: number;
  depositCents?: number;
  notes?: string;
};

// A patch may carry plain field edits and/or a status transition; the API
// cascades the deposit when `status` changes (held -> applied/forfeited/refunded).
export type BookingPatch = {
  clientId?: string | null;
  artistId?: string | null;
  startsAt?: string;
  endsAt?: string | null;
  serviceDesc?: string;
  estPriceCents?: number;
  depositCents?: number;
  depositStatus?: DepositStatus;
  depositPaymentId?: string | null;
  saleId?: string | null;
  notes?: string;
  status?: BookingStatus;
};

type BookingsCtx = {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  // Overview aggregates surfaced for the integration pass.
  today: number;
  depositsHeld: number; // cents currently held across all bookings
  refresh: () => Promise<void>;
  addBooking: (input: NewBooking) => Promise<{ ok: boolean; error?: string; booking?: Booking }>;
  updateBooking: (id: string, patch: BookingPatch) => Promise<{ ok: boolean; error?: string }>;
  syncFromSquare: () => Promise<{ ok: boolean; error?: string; mirrored?: number; autoFlaggedNoShow?: number }>;
};

const Ctx = createContext<BookingsCtx>({
  bookings: [],
  loading: true,
  error: null,
  today: 0,
  depositsHeld: 0,
  refresh: async () => {},
  addBooking: async () => ({ ok: false }),
  updateBooking: async () => ({ ok: false }),
  syncFromSquare: async () => ({ ok: false }),
});

const isToday = (iso: string) => {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
};

export function BookingsProvider({ children }: { children: React.ReactNode }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/bookings");
      const d = await r.json();
      if (r.ok) {
        setBookings(d.bookings || []);
        setError(null);
      } else {
        setError(d.error || "Could not load bookings.");
      }
    } catch {
      setError("Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addBooking: BookingsCtx["addBooking"] = useCallback(
    async (input) => {
      const r = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: d.error || "Could not create that booking." };
      await refresh();
      return { ok: true, booking: d.booking };
    },
    [refresh],
  );

  const updateBooking: BookingsCtx["updateBooking"] = useCallback(
    async (id, patch) => {
      const r = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const d = await r.json().catch(() => ({}));
      await refresh();
      if (!r.ok) return { ok: false, error: d.error || "Could not save." };
      return { ok: true };
    },
    [refresh],
  );

  const syncFromSquare: BookingsCtx["syncFromSquare"] = useCallback(async () => {
    const r = await fetch("/api/bookings/sync", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) {
      return { ok: false, error: d.error || "Sync failed." };
    }
    await refresh();
    return { ok: true, mirrored: d.mirrored, autoFlaggedNoShow: d.autoFlaggedNoShow };
  }, [refresh]);

  const { today, depositsHeld } = useMemo(() => {
    return {
      today: bookings.filter((b) => b.status !== "cancelled" && isToday(b.starts_at)).length,
      depositsHeld: bookings
        .filter((b) => b.deposit_status === "held")
        .reduce((sum, b) => sum + b.deposit_cents, 0),
    };
  }, [bookings]);

  return (
    <Ctx.Provider
      value={{
        bookings,
        loading,
        error,
        today,
        depositsHeld,
        refresh,
        addBooking,
        updateBooking,
        syncFromSquare,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useBookings = () => useContext(Ctx);
