"use client";

// SCAFFOLD STUB — the Compliance feature replaces this whole file (see
// STARTER-COMPLIANCE.md). Expose `expiringSoon` for the Overview tile when built.
import { createContext, useContext } from "react";

const Ctx = createContext<{ loading: boolean }>({ loading: false });

export function ComplianceProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ loading: false }}>{children}</Ctx.Provider>;
}

export const useCompliance = () => useContext(Ctx);
