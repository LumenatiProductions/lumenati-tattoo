"use client";

// SCAFFOLD STUB — the Follow-ups feature replaces this whole file (see
// STARTER-4-FOLLOWUPS.md). Expose `dueToday` for the Overview tile when built.
import { createContext, useContext } from "react";

const Ctx = createContext<{ loading: boolean }>({ loading: false });

export function FollowupsProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={{ loading: false }}>{children}</Ctx.Provider>;
}

export const useFollowups = () => useContext(Ctx);
