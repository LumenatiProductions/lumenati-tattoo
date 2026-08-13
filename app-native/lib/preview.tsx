import { createContext, useContext, useEffect, useState } from "react";

// Owner "view as artist" — global, so EVERY screen scopes itself to the
// previewed artist (home, bookings, payouts, rooms, POS), not just the home.
// null = not previewing. Only the home offers the controls; only owners see
// them.

export type Preview = { artistId: string; name: string } | null;

const Ctx = createContext<{ preview: Preview; setPreview: (p: Preview) => void }>({
  preview: null,
  setPreview: () => {},
});

// On native, navigation is in-app so the in-memory state is enough. On web a
// full reload would drop it (the reviewer/QA lands back on the owner home mid-
// walk); persist to the tab there so preview survives a refresh. sessionStorage
// only exists on web, so the guards make this a no-op on device.
const KEY = "lum-app-preview";
const readStored = (): Preview => {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Preview) : null;
  } catch {
    return null;
  }
};

export function PreviewProvider({ children }: { children: React.ReactNode }) {
  const [preview, setPreviewState] = useState<Preview>(null);

  // Rehydrate after mount (not in the initial state) so server/first render agree.
  useEffect(() => {
    const stored = readStored();
    if (stored) setPreviewState(stored);
  }, []);

  const setPreview = (p: Preview) => {
    setPreviewState(p);
    try {
      if (typeof sessionStorage === "undefined") return;
      if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };

  return <Ctx.Provider value={{ preview, setPreview }}>{children}</Ctx.Provider>;
}

export const usePreview = () => useContext(Ctx);
