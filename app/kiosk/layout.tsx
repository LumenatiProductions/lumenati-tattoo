import "./kiosk.css";

// Scopes Tailwind to the kiosk and gives it a full-screen, no-chrome shell. The
// root layout supplies <html>/<body>; the iPad runs this route in Guided Access
// (single-app mode), so there is intentionally no admin nav and no way out.
export const metadata = {
  title: "Lumenati — Check in",
};

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#0e0e11] font-sans text-white">{children}</div>;
}
