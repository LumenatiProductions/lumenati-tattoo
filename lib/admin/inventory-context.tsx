"use client";

// SCAFFOLD STUB — the Inventory feature replaces this whole file (see
// STARTER-INVENTORY.md). Expose `lowStock` for the Overview tile when built.
import { createContext, useContext } from "react";

const Ctx = createContext<{ loading: boolean }>({ loading: false });

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ loading: false }}>{children}</Ctx.Provider>;
}

export const useInventory = () => useContext(Ctx);
