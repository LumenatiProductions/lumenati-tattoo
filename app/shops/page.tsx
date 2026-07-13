import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import { Icon } from "@/components/marketing/Icon";
import { DesktopSlider } from "@/components/marketing/DesktopSlider";

// The marketing page. Lumenati is the business brain for a tattoo shop, sold
// to two buyers: the ARTIST (run your chair like a business — money, goals,
// taxes, coaching) and the SHOP OWNER (run the whole room without a front
// desk — revenue coaching, the books, retention). The page is those two
// benefit sections, each backed by real product screens from the demo tenant
// (scripts/marketing-shots*.mjs regenerate them). Icons match the app's
// Ionicons outline language.

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

// The desktop back-office screens in the shop slider.
const DESKTOP_SCREENS = [
  { img: "/marketing/command-center.webp", title: "The overview", body: "The week's money, the coach reads, and what needs a decision, live.", alt: "The Command Center overview" },
  { img: "/marketing/reports.webp", title: "Reports", body: "Shop-wide financials, per-artist roll-ups, and 1099 prep, exportable.", alt: "Reports: financials and per-artist roll-ups" },
  { img: "/marketing/payouts.webp", title: "Pay", body: "Renter pass-through and Gusto payroll prep, per artist, every period.", alt: "Pay: renter pass-through and payroll prep" },
  { img: "/marketing/bookings.webp", title: "Bookings", body: "The day's calendar, deposits held, and no-show outcomes in one place.", alt: "Bookings: the day's calendar and deposits" },
  { img: "/marketing/followups.webp", title: "Follow-ups", body: "Aftercare, reviews, and rebooking nudges queued and texting on schedule.", alt: "Follow-ups queue" },
] as const;

// Plan comparison. Values are true (included), false (not), or a string.
const COMPARE: { label: string; artist: string | boolean; shop: string | boolean }[] = [
  { label: "Best for", artist: "Solo & booth-rent artists", shop: "Shops with a crew" },
  { label: "Card payments", artist: "4.9% flat", shop: "4.9% flat" },
  { label: "Booking, deposits & waivers", artist: true, shop: true },
  { label: "Texting, winbacks & reviews", artist: true, shop: true },
  { label: "The coach", artist: "Your chair", shop: "Shop + every artist" },
  { label: "Goals, taxes & 1099 pack", artist: true, shop: true },
  { label: "Splits, booth rent & payouts", artist: false, shop: true },
  { label: "P&L + Reports", artist: false, shop: true },
  { label: "Per-artist performance", artist: false, shop: true },
  { label: "Multi-artist roster", artist: false, shop: true },
];

function PlanCell({ value }: { value: string | boolean }) {
  if (typeof value === "string") return <span className="text-zinc-300">{value}</span>;
  if (value) return <Icon name="check" className="mx-auto h-5 w-5 text-brand" />;
  return <span className="text-zinc-600">—</span>;
}

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

      {/* Hero — headline left, the product on a laptop right. */}
      <section className="mkt-rise mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-16 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pt-24">
        <div className="text-center lg:text-left">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.35em" }}>
            The business brain for tattoo shops
          </div>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Everything but
            <br />
            <span className="text-brand">the tattoo.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-md text-base text-zinc-300 sm:text-lg lg:mx-0">
            Lumenati coaches the shop and every artist, keeps the books, texts the follow-ups, and
            runs goals and taxes for every chair. You bring the needle.
          </p>
          <div className="mt-9 flex items-center justify-center gap-4 lg:justify-start">
            <Link href="/start" className="rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white hover:brightness-110">
              Set up your shop
            </Link>
            <a href="#artist" className="text-sm font-semibold text-zinc-300 hover:text-white">
              What&apos;s in it for me
            </a>
          </div>
        </div>

        {/* The product: desktop Command Center in a laptop + the app phone. */}
        <div className="hero-stack">
          <div>
            <div className="mkt-laptop-screen">
              <div className="mkt-laptop-bar">
                <span />
                <span />
                <span />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/command-center.webp" alt="The Lumenati Command Center: the week's money, coach reads, and what needs attention" />
            </div>
            <div className="mkt-laptop-base" />
          </div>
          <div className="mkt-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/app-artist-home.webp" alt="The artist app: Sam's earnings this month" />
          </div>
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

          <ul className="mt-12 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
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

          <div className="mt-14 flex flex-wrap items-start justify-center gap-8">
            <figure>
              <div className="mkt-phone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marketing/app-artist-home.webp" alt="An artist's earnings this month with tips and tickets" />
              </div>
              <figcaption className="mt-3 text-center text-sm text-zinc-400">Their money, in their pocket.</figcaption>
            </figure>
            <figure>
              <div className="mkt-phone">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marketing/app-artist-mid.webp" alt="An artist's goal chart, tax reserve, and reward badges" />
              </div>
              <figcaption className="mt-3 text-center text-sm text-zinc-400">Goals, coaching, and taxes.</figcaption>
            </figure>
          </div>

          {/* Artist pricing. */}
          <div className="mkt-glass mt-16 flex flex-col items-start gap-6 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-zinc-400" style={{ letterSpacing: "0.2em" }}>
                Solo or booth-rent artist
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-5xl font-black tracking-tight">$99</span>
                <span className="text-lg font-semibold text-zinc-400">/mo</span>
              </div>
              <div className="mt-2 text-sm text-zinc-400">Card payments 4.9% flat. No shop needed.</div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-300">
              Booking, deposits, waivers, texting, winbacks, reviews, the tax &amp; 1099 pack, and the
              coach. Everything above, for one chair.
            </p>
            <Link href="/start" className="whitespace-nowrap rounded-xl bg-brand px-6 py-3 font-bold text-white hover:brightness-110">
              Get started
            </Link>
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

          {/* The desktop back office — a slider of real screens (arrows on lg). */}
          <DesktopSlider screens={DESKTOP_SCREENS} />
          <p className="mt-1 text-center text-xs text-zinc-500">Swipe, or use the arrows, to see more of the back office.</p>

          {/* Shop pricing. */}
          <div className="mkt-glass mt-14 flex flex-col items-start gap-6 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-zinc-400" style={{ letterSpacing: "0.2em" }}>
                For shops
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-5xl font-black tracking-tight">$199</span>
                <span className="text-lg font-semibold text-zinc-400">/mo</span>
                <span className="ml-1 text-3xl font-black text-brand">+ $79</span>
                <span className="text-sm font-semibold text-zinc-400">per artist</span>
              </div>
              <div className="mt-2 text-sm text-zinc-400">Card payments 4.9% flat.</div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-300">
              Everything in the artist plan, plus the shop finance layer: splits, booth rent,
              payouts, the P&amp;L, and per-artist performance.
            </p>
            <Link href="/start" className="whitespace-nowrap rounded-xl bg-brand px-6 py-3 font-bold text-white hover:brightness-110">
              Set up your shop
            </Link>
          </div>
        </div>
      </section>

      {/* Compare plans. */}
      <section id="pricing" className="mx-auto max-w-4xl border-t border-white/10 px-5 py-20">
        <div className="text-center">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
            Compare plans
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Two plans. One number each.</h2>
        </div>
        <div className="mkt-glass mt-10 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/12">
                <th className="p-5" />
                <th className="p-5 text-center align-bottom">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">Artist</div>
                  <div className="mt-1 text-2xl font-black">
                    $99<span className="text-sm font-semibold text-zinc-400">/mo</span>
                  </div>
                </th>
                <th className="rounded-t-xl bg-brand/[0.08] p-5 text-center align-bottom">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-brand">Shop</div>
                  <div className="mt-1 text-2xl font-black">
                    $199<span className="text-sm font-semibold text-zinc-400">/mo + $79/artist</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row) => (
                <tr key={row.label} className="border-b border-white/8 last:border-0">
                  <td className="p-5 font-semibold text-zinc-200">{row.label}</td>
                  <td className="p-5 text-center">
                    <PlanCell value={row.artist} />
                  </td>
                  <td className="bg-brand/[0.05] p-5 text-center">
                    <PlanCell value={row.shop} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-8 text-center">
          <Link href="/start" className="inline-block rounded-xl bg-brand px-8 py-3.5 text-base font-bold text-white hover:brightness-110">
            Set up your shop
          </Link>
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
            Founding shops lock <span className="font-semibold text-zinc-300">$49 per artist for life</span>. Invite-only while we onboard the first cohort, ask us for a code.
          </p>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-zinc-500">
        Lumenati · Denver, CO
      </footer>
    </div>
  );
}
