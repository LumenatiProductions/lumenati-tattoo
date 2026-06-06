"use client";

// SCAFFOLD STUB — the Intake & Consent feature replaces this whole file (see
// STARTER-3-INTAKE-CONSENT.md). Expose `unsignedToday` for the Overview tile when built.
import { createContext, useContext } from "react";

const Ctx = createContext<{ loading: boolean }>({ loading: false });

export function IntakeProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ loading: false }}>{children}</Ctx.Provider>;
}

export const useIntake = () => useContext(Ctx);
