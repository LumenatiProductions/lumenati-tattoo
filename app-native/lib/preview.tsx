import { createContext, useContext, useState } from "react";

// Owner "view as artist" — global, so EVERY screen scopes itself to the
// previewed artist (home, bookings, payouts, rooms, POS), not just the home.
// null = not previewing. Only the home offers the controls; only owners see
// them.

export type Preview = { artistId: string; name: string } | null;

const Ctx = createContext<{ preview: Preview; setPreview: (p: Preview) => void }>({
  preview: null,
  setPreview: () => {},
});

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [preview, setPreview] = useState<Preview>(null);
  return <Ctx.Provider value={{ preview, setPreview }}>{children}</Ctx.Provider>;
}

export const usePreview = () => useContext(Ctx);
