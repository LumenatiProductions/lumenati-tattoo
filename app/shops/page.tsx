import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The marketing page. Lumenati isn't a booking widget — it's the business
// brain for a tattoo shop: it coaches the shop and each artist, keeps the
// books, sends the follow-ups (and texts them), and runs goals + taxes for
// every chair. That's what this page sells. Pitch line is locked
// (Scott, 2026-07-12). Every image is the real product from the demo tenant
// (scripts/marketing-shots*.mjs regenerate them).

// The phone trio: the money app itself.
const PHONES = [
  {
    img: "/marketing/app-shop-home.webp",
    title: "The shop, live",
    body: "Every dollar, every chair, service vs tips vs card vs cash. No spreadsheet, no shoebox.",
  },
  {
    img: "/marketing/app-artist-home.webp",
    title: "What each artist made",
    body: "Their earnings, their day, their next client. Glanceable, honest, theirs.",
  },
  {
    img: "/marketing/app-artist-mid.webp",
    title: "Goals and taxes, handled",
    body: "A number to chase, tax set aside automatically, an hourly rate they can actually see.",
  },
] as const;

// Business-management capabilities, reframed off the front desk.
const GRID = [
  {
    title: "Keeps the books",
    body: "Registers, end-of-day, artist pay, booth rent, a real P&L. The QuickBooks-and-shoebox job, done in one place.",
  },
  {
    title: "Sets aside taxes",
    body: "Each artist picks their percentage once; the app reserves it out of every ticket so April is never a surprise.",
  },
  {
    title: "Goals and streaks",
    body: "Shop and artist both get a number to race, a live chart, and rewards for hitting it. It makes running the business fun.",
  },
  {
    title: "Books and texts follow-ups",
    body: "Aftercare, healed-photo check-ins, review asks, rebooking nudges — queued and texted on schedule, in your voice.",
  },
  {
    title: "Deposits and no-show defense",
    body: "Deposits up front, applied or forfeited in a tap. Free a slot and the waitlist gets a claim text automatically.",
  },
  {
    title: "Runs on text codes",
    body: "No passwords. Your crew signs in with a code texted to their phone, and onboarding an artist takes thirty seconds.",
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

      {/* Hero — the locked pitch, reframed toward running the business. */}
      <section className="mkt-rise mx-auto max-w-3xl px-5 pb-10 pt-16 text-center sm:pt-20">
        <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.35em" }}>
          The business brain for tattoo shops
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Keep your website.
          <br />
          <span className="text-brand">We take over everything behind it.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-zinc-300 sm:text-lg">
          It coaches the shop and every artist, keeps the books, sends the follow-ups, and runs
          goals and taxes for each chair. The whole back office, in a phone.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link
            href="/start"
            className="rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white hover:brightness-110"
          >
            Set up your shop
          </Link>
          <a href="#coach" className="text-sm font-semibold text-zinc-300 hover:text-white">
            See how it coaches
          </a>
        </div>
      </section>

      {/* The money app, in phones. */}
      <section className="mkt-rise-2 pb-8">
        <div className="flex snap-x items-start justify-start gap-7 overflow-x-auto px-8 pb-6 pt-4 xl:justify-center">
          {PHONES.map((p, i) => (
            <figure key={p.title} className={`flex-none snap-center ${i === 1 ? "sm:mt-10" : i === 2 ? "sm:mt-20" : ""}`}>
              <div className="mkt-phone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.img} alt={p.title} />
              </div>
              <figcaption className="mx-auto mt-4 max-w-64 text-center">
                <div className="text-base font-bold">{p.title}</div>
                <p className="mt-1 text-sm text-zinc-400">{p.body}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* The differentiator: it coaches, it doesn't just track. */}
      <section id="coach" className="mx-auto max-w-5xl px-5 pb-24 pt-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
            It coaches, it doesn&apos;t just track
          </div>
          <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
            A read on what you can actually control
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Plain-English coaching from your own numbers, never invented. It tells the owner where
            the revenue risk is and what to do about it, and it does the same for every artist.
          </p>
        </div>
        <figure className="mkt-glass mx-auto mt-10 max-w-2xl overflow-hidden">
          <div className="bg-black/30 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/hi-shop-coach.webp" alt="The coach: 'Sam Rivera is 66% of the shop — great for them, fragile for you,' and 'Mondays run at 19% of a Saturday'" className="w-full rounded-lg" />
          </div>
        </figure>
      </section>

      {/* Keeps the books — the desktop revenue overview. */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="mx-auto max-w-2xl pb-8 text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Keeps the books</h2>
          <p className="mt-3 text-sm text-zinc-400">
            The money, the week, what needs a decision, all in one overview. On a desk when you
            want the big picture, in your pocket when you don&apos;t.
          </p>
        </div>
        <div className="mkt-browser">
          <div className="mkt-browser-bar">
            <span />
            <span />
            <span />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/command-center.webp" alt="The Lumenati Command Center overview: the week's money, coach reads, and what needs attention" />
        </div>
      </section>

      {/* Follow-ups + goals/tax, two glass beats. */}
      <section className="mx-auto max-w-6xl space-y-8 px-5 pb-24">
        <figure className="mkt-glass overflow-hidden">
          <div className="border-b border-white/8 bg-black/30 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/hi-followups.webp" alt="The follow-up queue: aftercare and reminders lined up to text automatically" className="w-full rounded-lg" />
          </div>
          <figcaption className="p-5">
            <div className="text-base font-bold">Follow-ups send themselves, and text automatically</div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Aftercare, healed-photo check-ins, review asks, and rebooking nudges queue up and go
              out on schedule over text, in your shop&apos;s voice. The retention work that never
              got done at the desk now happens every time.
            </p>
          </figcaption>
        </figure>

        <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
          <div>
            <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
              The self-business layer
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              Goals, taxes, and the whole business
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300 sm:text-base">
              Every artist gets a number to chase and a chart that races them against it, a tax
              reserve that sets money aside out of each ticket, an hourly rate they can finally
              see, and rewards for hitting milestones. It turns each chair into a solopreneur who
              actually runs their money, not a name on a schedule.
            </p>
          </div>
          <figure className="mkt-glass overflow-hidden">
            <div className="bg-black/30 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/hi-goals-tax.webp" alt="An artist's goals: tax reserve, reward badges, and a goal chart racing upward" className="mx-auto max-h-125 w-auto rounded-lg" />
            </div>
          </figure>
        </div>
      </section>

      {/* Everything else, glass grid. */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            No front desk. On purpose.
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Great shops run on great artists, not a counter. Everything a back office does,
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
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-zinc-500">
          And yes, every artist gets a public page built to get them booked, in{" "}
          <a href="/s/apple-review/sam-rivera" className="font-semibold text-brand hover:brightness-110">three looks</a>.
          It&apos;s the front of the business. This is everything behind it.
        </p>
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
