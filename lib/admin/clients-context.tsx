"use client";

// SCAFFOLD STUB — the Clients feature replaces this whole file with the real
// provider (see STARTER-1-CLIENTS.md). Pre-wired into AdminShell so features never
// edit the shell. Expose an Overview aggregate here when built (e.g. `newThisMonth`).
import { createContext, useContext } from "react";

const Ctx = createContext<{ loading: boolean }>({ loading: false });

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ loading: false }}>{children}</Ctx.Provider>;
}

export const useClients = () => useContext(Ctx);
