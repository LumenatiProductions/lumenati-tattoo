"use client";

// SCAFFOLD STUB — the Bookings feature replaces this whole file (see
// STARTER-2-BOOKINGS.md). Expose `today` / `depositsHeld` for the Overview tile when built.
import { createContext, useContext } from "react";

const Ctx = createContext<{ loading: boolean }>({ loading: false });

export function BookingsProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ loading: false }}>{children}</Ctx.Provider>;
}

export const useBookings = () => useContext(Ctx);
