import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The marketing page. Lumenati is the business brain for a tattoo shop, sold
// to two buyers: the ARTIST (run your chair like a business — money, goals,
// taxes, coaching) and the SHOP OWNER (run the whole room without a front
// desk — revenue coaching, the books, retention). The page is those two
// benefit sections, each backed by real product screens from the demo tenant
// (scripts/marketing-shots*.mjs regenerate them). Icons match the app's
// Ionicons outline language.

// Ionicons-style outline icons (stroke, round caps) so the page speaks the
// product's visual language.
function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    cash: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    goal: (
      <>
        <path d="M3 16l5-5 4 4 8-8" />
        <path d="M15 7h6v6" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </>
    ),
    chat: (
      <>
        <path d="M4 5h16v10H8l-4 4z" />
        <path d="M8 9h8M8 12h5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="13" r="7" />
        <path d="M12 13V9M10 2.5h4M18.5 6l1.5-1.5" />
      </>
    ),
    ribbon: (
      <>
        <circle cx="12" cy="9" r="5" />
        <path d="M9 13l-2 8 5-3 5 3-2-8" />
      </>
    ),
    bars: (
      <>
        <path d="M5 20V11M12 20V5M19 20v-6" />
        <path d="M3.5 20h17" />
      </>
    ),
    bulb: (
      <>
        <path d="M9.5 18.5h5M10.5 21.5h3" />
        <path d="M12 3a6 6 0 0 0-4 10.4c.8.9 1 1.6 1 2.6h6c0-1 .2-1.7 1-2.6A6 6 0 0 0 12 3z" />
      </>
    ),
    book: (
      <>
        <path d="M12 5c-1-1-3-1.5-5-1.5S4 4 4 4v14s1-1 3-1 4 .5 5 1.5" />
        <path d="M12 5c1-1 3-1.5 5-1.5S20 4 20 4v14s-1-1-3-1-4 .5-5 1.5V5z" />
      </>
    ),
    flag: (
      <>
        <path d="M6 21V3.5" />
        <path d="M6 4h11l-2 3.2 2 3.2H6" />
      </>
    ),
    repeat: (
      <>
        <path d="M17 3l3 3-3 3" />
        <path d="M20 6H9a4.5 4.5 0 0 0-4.5 4.5" />
        <path d="M7 21l-3-3 3-3" />
        <path d="M4 18h11a4.5 4.5 0 0 0 4.5-4.5" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path d="M16 6a3 3 0 0 1 0 6M17.5 20c0-2.2-.6-3.8-1.7-5" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

const ARTIST_BENEFITS = [
  { icon: "cash", title: "See what you actually made", body: "Earnings, tips, and tickets for today, this week, this month. In your pocket, not a shoebox." },
  { icon: "goal", title: "A goal to chase", body: "Pick a number and a chart races you against it every day, with streaks when you beat it." },
  { icon: "shield", title: "Taxes, set aside for you", body: "A slice of every ticket held back automatically at your rate. No April surprise." },
  { icon: "chat", title: "Follow-ups on autopilot", body: "Aftercare and rebooking texts send themselves, so past clients keep coming back." },
  { icon: "clock", title: "Your real hourly rate", body: "Service divided by booked hours, finally a number you can see and grow." },
  { icon: "ribbon", title: "Rewards for hitting it", body: "Badges and milestones as you climb. Running your chair like a business, and enjoying it." },
] as const;

const SHOP_BENEFITS = [
  { icon: "bars", title: "Every dollar, every chair, live", body: "Service vs tips vs card vs cash, per artist, in real time. No spreadsheet to reconcile." },
  { icon: "bulb", title: "Revenue coaching", body: "Plain-English reads on what you can control: who's carrying the shop, which days are dead, what to do about it." },
  { icon: "book", title: "Keeps the books", body: "Registers, artist pay, booth rent, and a real P&L. The QuickBooks-and-shoebox job, done." },
  { icon: "flag", title: "One goal the room races", body: "Give the shop a number and every chair chases it on a live leaderboard." },
  { icon: "repeat", title: "Retention runs itself", body: "Follow-ups, review asks, and rebooking nudges go out across the shop, on schedule, over text." },
  { icon: "people", title: "No front desk", body: "Deposits and no-show defense, waitlist auto-fill, and text-code sign-in. Onboard an artist in thirty seconds." },
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
          <Link href="/start" className="rounded-xl bg-brand px-4 py-2 font-bold text-white hover:brightness-110">
            Set up your shop
          </Link>
        </nav>
      </header>

      {/* Hero. */}
      <section className="mkt-rise mx-auto max-w-3xl px-5 pb-10 pt-16 text-center sm:pt-20">
        <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.35em" }}>
          The business brain for tattoo shops
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Everything but
          <br />
          <span className="text-brand">the tattoo.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-zinc-300 sm:text-lg">
          Lumenati coaches the shop and every artist, keeps the books, texts the follow-ups, and
          runs goals and taxes for every chair. You bring the needle.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link href="/start" className="rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white hover:brightness-110">
            Set up your shop
          </Link>
          <a href="#artist" className="text-sm font-semibold text-zinc-300 hover:text-white">
            What&apos;s in it for me
          </a>
        </div>
      </section>

      {/* ── FOR EVERY ARTIST ── */}
      <section id="artist" className="mkt-rise-2 border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
            For every artist
          </div>
          <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
            Run your chair like your own business.
          </h2>
          <p className="mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
            The money app your crew will actually open. Their earnings, their goals, their taxes,
            handled, with a coach in their corner.
          </p>

          <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
            <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
              {ARTIST_BENEFITS.map((b) => (
                <li key={b.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-white/12 border-t-white/22 bg-white/5 text-brand">
                    <Icon name={b.icon} className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-[15px] font-bold">{b.title}</div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-400">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex justify-center gap-6">
              <div className="mkt-phone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marketing/app-artist-home.webp" alt="An artist's earnings this month with tips and tickets" />
              </div>
              <div className="mkt-phone hidden sm:block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marketing/app-artist-mid.webp" alt="An artist's goal chart, tax reserve, and reward badges" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOR THE SHOP ── */}
      <section id="shop" className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
            For the shop
          </div>
          <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
            Run the whole room without a front desk.
          </h2>
          <p className="mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
            One command center for the money, the coaching, and the retention. On a desk when you
            want the big picture, in your pocket when you don&apos;t.
          </p>

          <ul className="mt-12 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {SHOP_BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-white/12 border-t-white/22 bg-white/5 text-brand">
                  <Icon name={b.icon} className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[15px] font-bold">{b.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-400">{b.body}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* The desktop Command Center — the shop's home base. */}
          <figure className="mt-14">
            <div className="mkt-browser">
              <div className="mkt-browser-bar">
                <span />
                <span />
                <span />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/command-center.webp" alt="The Command Center overview: the week's money, coach reads, and what needs attention" />
            </div>
            <figcaption className="mt-4 text-center text-sm text-zinc-400">
              The overview. The week&apos;s money, the coach reads, and what needs a decision, live.
            </figcaption>
          </figure>

          {/* Reports — the books, per artist. */}
          <figure className="mt-10">
            <div className="mkt-browser">
              <div className="mkt-browser-bar">
                <span />
                <span />
                <span />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/reports.webp" alt="Reports: shop-wide financials, per-artist roll-ups, and 1099 prep" />
            </div>
            <figcaption className="mt-4 text-center text-sm text-zinc-400">
              Every number that used to live in QuickBooks and a shoebox, per artist, exportable.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Close. */}
      <section className="mx-auto max-w-3xl px-5 py-24 text-center">
        <div className="mkt-glass px-6 py-12">
          <h2 className="text-3xl font-black tracking-tight">
            Two minutes to a live shop<span className="text-brand">.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Name the shop, list the crew, and every artist gets their app and their page. Keep your
            own website; this is everything behind it.
          </p>
          <Link href="/start" className="mt-7 inline-block rounded-xl bg-brand px-8 py-4 text-lg font-bold text-white hover:brightness-110">
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
