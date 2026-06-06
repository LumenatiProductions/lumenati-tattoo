import "./pay.css";

// Pulls Tailwind into the public payment portal only. The root layout supplies
// <html>/<body>; this just scopes the stylesheet so /pay is styled without
// leaking Tailwind onto the Y2K front-of-house pages.
export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
