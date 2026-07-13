import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The marketing page: sells the WHOLE product to other shops — the Command
// Center, the artist pages, the phone story. The pitch line is locked
// (Scott, 2026-07-12): "keep your website, we take over everything behind
// it." Every screen on this page is the real product shot from the demo
// tenant (scripts/marketing-shots.mjs regenerates them); the phone in the
// artist-page row is a LIVE page, not an image.

const DEMO = "/s/apple-review/sam-rivera";

// Alternating product rows: real screen + the claim it proves.
const ROWS = [
  {
    img: "/marketing/bookings.webp",
    kicker: "Front of house",
    title: "Every request lands with the right artist",
    body: "A client books from the artist's page and it shows up here: idea, placement, reference photos, deposit. Deposits get applied or forfeited on the same screen. Nobody plays phone tag at a counter.",
    flip: false,
  },
  {
    img: "/marketing/page-editor.webp",
    kicker: "Their page, their rules",
    title: "Artists dress their own page",
    body: "Photos, flash, bio, even the music. Changes go live the moment they make them, with a live preview right next to the controls. You never touch it, and it never looks stale.",
    flip: true,
  },
  {
    img: "/marketing/followups.webp",
    kicker: "The flywheel",
    title: "Follow-ups send themselves",
    body: "Aftercare instructions, healed-photo check-ins, review asks, and rebooking nudges go out on schedule, in your shop's voice. The work that never got done at the desk now happens every time.",
    flip: false,
  },
] as const;

const GRID = [
  {
    title: "Money in one place",
    body: "Registers, end-of-day books, artist pay, and booth rent in the Command Center instead of a spreadsheet and a shoebox.",
  },
  {
    title: "Flash that sells itself",
    body: "Artists post a sheet, price each piece, and clients claim them straight off the page. Claimed pieces get stamped and retired.",
  },
  {
    title: "Books that close cleanly",
    body: "When an artist closes their books, every Book button becomes a waitlist door. The page never goes dark.",
  },
  {
    title: "No-show defense",
    body: "Deposits up front, and when a slot frees up the waitlist gets a claim text. First tap books it, the chair stays warm.",
  },
  {
    title: "Intake and compliance",
    body: "Consent forms signed at the chair, licenses and certs tracked with expiry warnings before they become a problem.",
  },
  {
    title: "Text-code sign-in",
    body: "Nobody remembers a password. Your crew signs in with a code texted to their phone, from day one.",
  },
] as const;

export default function ShopsMarketingPage() {
  return (
    <div className="mkt-wash min-h-screen text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-6">
        <LumenatiLogo bg="dark" className="w-24" />
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/admin/login" className="font-semibold text-zinc-300 hover:text-white">
            Sign in
          </Link>
          <Link
            href="/start"
            className="rounded-xl bg-brand px-4 py-2 font-bold text-white hover:brightness-110"
          >
            Set up your shop
          </Link>
        </nav>
      </header>

      {/* Hero — the locked pitch, then the product itself. */}
      <section className="mkt-rise mx-auto max-w-3xl px-5 pb-14 pt-16 text-center sm:pt-24">
        <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.35em" }}>
          For tattoo shops
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Keep your website.
          <br />
          <span className="text-brand">We take over everything behind it.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-zinc-300 sm:text-lg">
          Every artist gets a page built to get them booked. You get a command center that runs
          the whole back office. No front desk required.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link
            href="/start"
            className="rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white hover:brightness-110"
          >
            Set up your shop
          </Link>
          <a href={DEMO} className="text-sm font-semibold text-zinc-300 hover:text-white">
            See a live artist page
          </a>
        </div>
      </section>

      {/* The reveal: the real Command Center. */}
      <section className="mkt-rise-2 mx-auto max-w-6xl px-5 pb-24">
        <div className="mkt-browser">
          <div className="mkt-browser-bar">
            <span />
            <span />
            <span />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/command-center.webp" alt="The Lumenati Command Center: shop overview with the day, follow-ups due, coach reads, and the week's money" />
        </div>
        <p className="mx-auto mt-5 max-w-xl text-center text-sm text-zinc-400">
          The Command Center. Your day, your money, what needs attention, and a coach that reads
          from your own numbers. This is a real screen, demo shop data.
        </p>
      </section>

      {/* Product rows — each claim shows the screen that proves it. */}
      <section className="mx-auto max-w-6xl space-y-24 px-5 pb-24">
        {ROWS.map((r) => (
          <div key={r.title} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className={r.flip ? "md:order-2" : ""}>
              <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
                {r.kicker}
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">{r.title}</h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">{r.body}</p>
            </div>
            <div className={r.flip ? "md:order-1" : ""}>
              <div className="mkt-browser">
                <div className="mkt-browser-bar">
                  <span />
                  <span />
                  <span />
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.img} alt={r.title} />
              </div>
            </div>
          </div>
        ))}

        {/* The two phones: the live artist page + the shop in a pocket. */}
        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div>
            <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
              The hosted page
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              Built to get artists booked
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
              The work leads, socials sit with the name, and Book is one tap from anywhere on the
              page. Flash is priced and claimable. When books close, the waitlist takes over. The
              phone on the right is live, scroll it.
            </p>
            <p className="mt-4 text-sm text-zinc-400">
              Comes in three looks, every shop picks its own:{" "}
              <a href={`${DEMO}?skin=standard`} className="font-semibold text-brand hover:brightness-110">standard</a>
              {", "}
              <a href={`${DEMO}?skin=dark`} className="font-semibold text-brand hover:brightness-110">dark ink</a>
              {", or "}
              <a href={`${DEMO}?skin=flash`} className="font-semibold text-brand hover:brightness-110">flash sheet</a>.
            </p>
            <h2 className="mt-10 text-2xl font-black tracking-tight sm:text-3xl">
              And the whole shop in your pocket
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
              The Command Center works from a phone, and your crew runs their day, their page,
              and their money from the app. Nobody has to sit behind a desk.
            </p>
          </div>
          <div className="flex flex-wrap items-start justify-center gap-6">
            <div className="mkt-phone">
              <iframe src={DEMO} title="Live artist page demo" loading="lazy" />
            </div>
            <div className="mkt-phone">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/pocket.webp" alt="The Command Center on a phone" />
            </div>
          </div>
        </div>
      </section>

      {/* Everything else, glass grid. */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            No front desk. On purpose.
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Great shops run on great artists, not a counter. Everything a desk used to do,
            handled.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GRID.map((f) => (
            <div key={f.title} className="mkt-glass p-6">
              <h3 className="text-base font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close — same door as the hero. */}
      <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
        <div className="mkt-glass px-6 py-12">
          <h2 className="text-3xl font-black tracking-tight">
            Two minutes to a live shop<span className="text-brand">.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Name the shop, list the crew, pick a look. Your pages go live and your sign-in invite
            is in your inbox before the machine warms up.
          </p>
          <Link
            href="/start"
            className="mt-7 inline-block rounded-xl bg-brand px-8 py-4 text-lg font-bold text-white hover:brightness-110"
          >
            Set up your shop
          </Link>
          <p className="mt-4 text-xs text-zinc-500">
            Invite-only while we onboard the first shops. Ask us for a code.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-zinc-500">
        Lumenati · Denver, CO
      </footer>
    </div>
  );
}
