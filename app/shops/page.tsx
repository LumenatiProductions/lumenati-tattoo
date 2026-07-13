import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The marketing page: the whole product, shown the way it actually gets
// used — in phones, with zoomed-in highlights of the best moments instead
// of full-window screenshots. Pitch line is locked (Scott, 2026-07-12).
// Every image is the real product from the demo tenant
// (scripts/marketing-shots.mjs regenerates them); the first phone is LIVE.

const DEMO = "/s/apple-review/sam-rivera";

// The up-close bento: each card is a real element, captured 1:1.
const HIGHLIGHTS = [
  {
    img: "/marketing/hi-preview.webp",
    title: "Artists dress their own page",
    body: "Photos, flash, bio, the music. A live preview sits next to the controls and changes go out the moment they're made.",
  },
  {
    img: "/marketing/hi-flash.webp",
    title: "Flash sells itself",
    body: "Priced per piece, claimed right off the page. Claimed pieces get stamped and retired on their own.",
  },
  {
    img: "/marketing/hi-coach.webp",
    title: "A coach that reads your numbers",
    body: "Deterministic reads from your own money, never invented. It tells you where the quiet days are and what to do with them.",
  },
  {
    img: "/marketing/hi-signin.webp",
    title: "No passwords, ever",
    body: "Your crew signs in with a code texted to their phone. Onboarding an artist takes thirty seconds.",
  },
] as const;

const GRID = [
  {
    title: "Money in one place",
    body: "Registers, end-of-day books, artist pay, and booth rent in the Command Center instead of a spreadsheet and a shoebox.",
  },
  {
    title: "Deposits and no-show defense",
    body: "Deposits up front, applied or forfeited in one tap. When a slot frees up, the waitlist gets a claim text.",
  },
  {
    title: "Books that close cleanly",
    body: "When an artist closes their books, every Book button becomes a waitlist door. The page never goes dark.",
  },
  {
    title: "Intake and compliance",
    body: "Consent forms signed at the chair, licenses and certs tracked with expiry warnings before they become a problem.",
  },
  {
    title: "Aftercare built in",
    body: "Care instructions land on the client's phone; healed photos come back on their own. Nobody chases it.",
  },
  {
    title: "Three looks, one product",
    body: "Every shop picks its page style. Same booking, flash, and waitlist underneath.",
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

      {/* Hero — the locked pitch. */}
      <section className="mkt-rise mx-auto max-w-3xl px-5 pb-12 pt-16 text-center sm:pt-20">
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

      {/* The product, in phones. First one is live. */}
      <section className="mkt-rise-2 pb-6">
        <div className="flex snap-x items-start justify-start gap-7 overflow-x-auto px-8 pb-8 pt-4 xl:justify-center">
          <figure className="flex-none snap-center">
            <div className="mkt-phone">
              <iframe src={DEMO} title="Live artist page demo" loading="lazy" />
            </div>
            <figcaption className="mt-3 text-center text-sm text-zinc-400">
              The artist page. <span className="font-semibold text-brand">Live, scroll it.</span>
            </figcaption>
          </figure>
          <figure className="flex-none snap-center sm:mt-10">
            <div className="mkt-phone">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/pocket.webp" alt="The Command Center overview on a phone" />
            </div>
            <figcaption className="mt-3 text-center text-sm text-zinc-400">
              The whole shop, from a pocket.
            </figcaption>
          </figure>
          <figure className="flex-none snap-center sm:mt-20">
            <div className="mkt-phone">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/phone-bookings.webp" alt="Bookings on a phone: the day, deposits, one-tap complete or no-show" />
            </div>
            <figcaption className="mt-3 text-center text-sm text-zinc-400">
              The day runs itself: deposits, one-tap close-out.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* The good stuff, up close. */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            The good stuff, up close
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Real pieces of the product, not mockups.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {HIGHLIGHTS.map((h) => (
            <figure key={h.title} className="mkt-glass overflow-hidden">
              <div className="border-b border-white/8 bg-black/30 p-5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={h.img} alt={h.title} className="mx-auto max-h-105 w-auto max-w-full rounded-lg" />
              </div>
              <figcaption className="p-5">
                <div className="text-base font-bold">{h.title}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{h.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* The flywheel strip — real queue rows, full width. */}
        <figure className="mkt-glass mt-6 overflow-hidden">
          <div className="border-b border-white/8 bg-black/30 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/hi-followups.webp" alt="The follow-up queue: aftercare and reminders lined up to send" className="w-full rounded-lg" />
          </div>
          <figcaption className="p-5">
            <div className="text-base font-bold">Follow-ups send themselves</div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Aftercare, healed-photo check-ins, review asks, and rebooking nudges queue up and go
              out on schedule, in your shop&apos;s voice. The work that never got done at the desk
              now happens every time.
            </p>
          </figcaption>
        </figure>
      </section>

      {/* One wide shot: the back office exists and it's deep. */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="mx-auto max-w-2xl pb-8 text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            And a whole back office behind it
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Money, pay, rent, inventory, compliance, reports. On a desk when you want the big
            picture, in your pocket when you don&apos;t.
          </p>
        </div>
        <div className="mkt-browser">
          <div className="mkt-browser-bar">
            <span />
            <span />
            <span />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/command-center.webp" alt="The Lumenati Command Center: shop overview with the day, follow-ups due, coach reads, and the week's money" />
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
