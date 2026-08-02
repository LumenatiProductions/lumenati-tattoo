import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Lumenati",
  description: "The terms for using Lumenati, including our text messaging program.",
};

// Plain document page, sibling of /privacy — carrier (A2P) registration points
// here, so the Text Messaging section keeps the required program details:
// frequency, rates, HELP/STOP, support contact. Self-styled like /privacy.
const S = {
  page: { background: "#0e0e11", color: "#e8e8ee", minHeight: "100vh", padding: "48px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", lineHeight: 1.65 } as const,
  wrap: { maxWidth: 680, margin: "0 auto" } as const,
  h1: { fontSize: 28, marginBottom: 4 } as const,
  date: { color: "#9a9aa6", fontSize: 14, marginBottom: 32 } as const,
  h2: { fontSize: 19, marginTop: 32, marginBottom: 8 } as const,
  p: { margin: "0 0 14px", color: "#c9c9d4" } as const,
  a: { color: "#22d3ee" } as const,
};

export default function TermsPage() {
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>Terms of Service</h1>
        <p style={S.date}>Lumenati — last updated August 1, 2026</p>

        <p style={S.p}>
          Lumenati is shop-management software for tattoo studios. These terms cover the
          Lumenati app and website, whether you are a shop admin, an artist, or a client
          of a shop that runs on Lumenati. By using Lumenati you agree to them.
        </p>

        <h2 style={S.h2}>Using Lumenati</h2>
        <p style={S.p}>
          Shops use Lumenati to run their business: bookings, client intake and consent,
          payments, follow-ups, and shop records. Shop data belongs to the shop. Use the
          product lawfully and only for running or working with a tattoo studio.
        </p>

        <h2 style={S.h2}>Payments</h2>
        <p style={S.p}>
          Card payments are processed by Stripe under Stripe&apos;s own terms. Card
          processing fees are disclosed at checkout before you pay.
        </p>

        <h2 style={S.h2}>Text messaging program</h2>
        <p style={S.p}>
          Shops on Lumenati send appointment and customer-care texts: appointment
          reminders, consent form links, aftercare and healing check-ins, open-slot
          offers for the waitlist, and shop notices to artists such as rent invoices.
          You receive these only if you gave the shop your mobile number and agreed to
          be texted.
        </p>
        <p style={S.p}>
          Message frequency varies with your bookings. Message and data rates may apply.
          <strong> Reply STOP to cancel at any time. Reply HELP for help</strong>, or
          contact <a style={S.a} href="mailto:lumenati@icloud.com">lumenati@icloud.com</a>.
          Carriers are not liable for delayed or undelivered messages. Your number and
          your consent to be texted are never shared with third parties or used for
          third-party marketing; see the{" "}
          <a style={S.a} href="/privacy">Privacy Policy</a>.
        </p>

        <h2 style={S.h2}>Accounts</h2>
        <p style={S.p}>
          Keep your sign-in to yourself; you are responsible for what happens under your
          account. Admins and artists can delete their account from inside the app.
        </p>

        <h2 style={S.h2}>Changes</h2>
        <p style={S.p}>
          If these terms change in a way that matters, we&apos;ll post the update here
          with a new date.
        </p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>
          Questions: <a style={S.a} href="mailto:lumenati@icloud.com">lumenati@icloud.com</a>
        </p>
      </div>
    </main>
  );
}
