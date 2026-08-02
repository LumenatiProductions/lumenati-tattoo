import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Lumenati",
  description: "What Lumenati collects, why, and how to remove it.",
};

// Plain document page — App Store metadata points here, and the app links to
// it from sign-in. Self-styled so it inherits nothing from the Y2K site.
const S = {
  page: { background: "#0e0e11", color: "#e8e8ee", minHeight: "100vh", padding: "48px 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", lineHeight: 1.65 } as const,
  wrap: { maxWidth: 680, margin: "0 auto" } as const,
  h1: { fontSize: 28, marginBottom: 4 } as const,
  date: { color: "#9a9aa6", fontSize: 14, marginBottom: 32 } as const,
  h2: { fontSize: 19, marginTop: 32, marginBottom: 8 } as const,
  p: { margin: "0 0 14px", color: "#c9c9d4" } as const,
  a: { color: "#22d3ee" } as const,
};

export default function PrivacyPage() {
  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>Privacy Policy</h1>
        <p style={S.date}>Lumenati — last updated July 11, 2026</p>

        <p style={S.p}>
          Lumenati is shop-management software for tattoo studios. This policy covers the
          Lumenati app and website, whether you are a shop admin, an artist, or a client
          of a shop that runs on Lumenati.
        </p>

        <h2 style={S.h2}>What we collect</h2>
        <p style={S.p}>
          <strong>Accounts (admins and artists).</strong> Your name, email address, and
          phone number, used to sign you in and route your shop&apos;s work to you. Sign-in
          codes are one-time and expire quickly. If you turn on notifications, we store a
          push token for your device.
        </p>
        <p style={S.p}>
          <strong>Shop records.</strong> Bookings, client contact details, consent and
          intake forms, payments, and related records your shop creates while running its
          business. This data belongs to the shop; Lumenati processes it on the shop&apos;s
          behalf.
        </p>
        <p style={S.p}>
          <strong>Photos.</strong> Portfolio and page photos artists choose to publish,
          healed-tattoo photos clients choose to share, and photos of supplies or receipts
          taken for the shop&apos;s own bookkeeping. The app only accesses your camera or
          photo library when you tap to use them.
        </p>
        <p style={S.p}>
          <strong>Payments.</strong> Card payments are processed by Stripe. Card numbers
          never touch Lumenati&apos;s servers. Tap to Pay uses your device location while
          taking a payment, as Stripe requires for fraud prevention.
        </p>

        <h2 style={S.h2}>What we don&apos;t do</h2>
        <p style={S.p}>
          No ads, no selling or sharing data with data brokers, no third-party analytics or
          tracking SDKs, and no tracking you across other apps or websites. Your phone
          number and your consent to receive texts are never shared with third parties or
          affiliates for their marketing.
        </p>

        <h2 style={S.h2}>Who we share with</h2>
        <p style={S.p}>
          Only the services that make the product work: Supabase (database and sign-in),
          Stripe (payments), and our hosting providers. Each receives only what it needs to
          do its job.
        </p>

        <h2 style={S.h2}>Deleting your data</h2>
        <p style={S.p}>
          Admins and artists can delete their account from inside the app (Home, &quot;Delete
          my account&quot;) — this removes your login and personal data. Records that belong to
          the shop&apos;s business history (bookings, sales) stay with the shop. Clients of a
          shop should ask that shop to remove their records, or write to us and we&apos;ll help.
        </p>

        <h2 style={S.h2}>Contact</h2>
        <p style={S.p}>
          Questions or requests: <a style={S.a} href="mailto:lumenati@icloud.com">lumenati@icloud.com</a>
        </p>
      </div>
    </main>
  );
}
