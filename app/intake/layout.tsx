import "./intake.css";

// Pulls Tailwind into the public consent-signer route only. The root layout
// supplies <html>/<body>; this just scopes the stylesheet so /intake is styled
// without leaking Tailwind onto the Y2K front-of-house pages.
export default function IntakeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
