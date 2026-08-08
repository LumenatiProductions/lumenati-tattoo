import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";
import { Icon } from "@/components/marketing/Icon";
import { DesktopSlider } from "@/components/marketing/DesktopSlider";
import { PhoneCarousel } from "@/components/marketing/PhoneCarousel";
import { Reveal } from "@/components/marketing/Reveal";
import { ScrollPhoneDemo } from "@/components/marketing/ScrollPhoneDemo";
import { RotatingWords } from "@/components/marketing/RotatingWords";
import { SpotlightCard } from "@/components/marketing/SpotlightCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { FOUNDING_SEAT_CAP, foundingSeatsUsed } from "@/lib/stripe/billing";

// The founding-seat counter re-counts every few minutes; the page is
// otherwise static.
export const revalidate = 300;

// The marketing page. Lumenati is the business brain for a tattoo shop, sold
// to two buyers: the ARTIST (run your chair like a business — money, goals,
// taxes, coaching) and the SHOP OWNER (run the whole room without a front
// desk — revenue coaching, the books, retention). The page is those two
// benefit sections, each backed by real product screens from the demo tenant
// (scripts/marketing-shots*.mjs regenerate them). Icons match the app's
// Ionicons outline language.

const ARTIST_BENEFITS = [
  { icon: "card", title: "Take the payment at the chair", body: "Tap their card on your phone or text them a pay link. Your cut lands in your bank, and you can get paid early." },
  { icon: "cash", title: "See what you actually made", body: "Earnings, tips, and tickets for today, this week, this month. In your pocket, not a shoebox." },
  { icon: "goal", title: "A goal to chase", body: "Pick a number and a chart races you against it every day, with streaks and badges when you beat it." },
  { icon: "shield", title: "Never get caught by taxes", body: "The app tells you exactly what to set aside from every ticket at your rate, so April is never a surprise." },
  { icon: "chat", title: "Follow-ups on autopilot", body: "Aftercare and rebooking texts send themselves, and clients text healed photos straight back for your portfolio." },
  { icon: "clock", title: "Your real hourly rate", body: "Service divided by booked hours, finally a number you can see and grow." },
] as const;

const SHOP_BENEFITS = [
  { icon: "cash", title: "Payments that split themselves", body: "Clients pay from their phone or a tap on the artist's. Splits, booth rent, and the shop's cut land in the right banks on their own." },
  { icon: "bulb", title: "Revenue coaching", body: "Plain-English reads on what you can control: who's carrying the shop, which days are dead, what to do about it." },
  { icon: "book", title: "Keeps the books", body: "Every dollar, every chair, live: registers, artist pay, booth rent, merch, refunds, and a real P&L. The QuickBooks-and-shoebox job, done." },
  { icon: "doc", title: "Inspection-ready", body: "Waivers and consent signed at the chair, licenses and BBP certs tracked with expiry warnings. The records an inspector asks for, already in order." },
  { icon: "tablet", title: "A kiosk, not a front desk", body: "Clients check themselves in on the kiosk and it pings the artist the moment they arrive. Deposits and no-show defense built in. Nobody works a counter." },
  { icon: "repeat", title: "Retention runs itself", body: "Follow-ups, review asks, and rebooking nudges text themselves, and one message can reach your whole client list, consent handled." },
] as const;

// The artist app screens (side by side on desktop, a carousel on mobile).
const ARTIST_PHONES = [
  { img: "/marketing/app-artist-home.webp", alt: "An artist's day and earnings this month", cap: "Your day and your money." },
  { img: "/marketing/app-artist-goals.webp", alt: "An artist's goal chart, tax reserve, and reward badges", cap: "Your goals, taxes set aside, rewards." },
  { img: "/marketing/app-artist-coach.webp", alt: "An artist's coach reads and tax summary", cap: "A coach in your corner." },
];

// The desktop back-office screens in the shop slider.
const DESKTOP_SCREENS = [
  { img: "/marketing/command-center.webp", title: "The overview", body: "The week's money, the coach reads, and what needs a decision, live.", alt: "The Command Center overview" },
  { img: "/marketing/reports.webp", title: "Reports", body: "Shop-wide financials, per-artist roll-ups, and 1099 prep, exportable.", alt: "Reports: financials and per-artist roll-ups" },
  { img: "/marketing/payouts.webp", title: "Pay", body: "Renter pass-through and payroll prep, per artist, every period.", alt: "Pay: renter pass-through and payroll prep" },
  { img: "/marketing/bookings.webp", title: "Bookings", body: "The day's calendar, deposits held, and cancelled slots offered to the waitlist by text.", alt: "Bookings: the day's calendar and deposits" },
  { img: "/marketing/followups.webp", title: "Follow-ups", body: "Aftercare, reviews, and rebooking nudges queued and texting on schedule.", alt: "Follow-ups queue" },
] as const;

// Plan comparison. Values are true (included), false (not), or a string.
const COMPARE: { label: string; artist: string | boolean; shop: string | boolean }[] = [
  { label: "Best for", artist: "Solo & booth-rent artists", shop: "Shops with a crew" },
  { label: "Card fee", artist: "On the client", shop: "On the client" },
  { label: "Keep 100% of your rate", artist: true, shop: true },
  { label: "Get paid early", artist: true, shop: true },
  { label: "Tap to Pay & pay links", artist: true, shop: true },
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
  return (
    <span className="mx-auto flex h-5 w-5 items-center justify-center rounded-full border border-white/10">
      <Icon name="close" className="h-3 w-3 text-zinc-600" />
    </span>
  );
}

// The hero's proof points. Every claim already lives elsewhere on the page.
const HERO_STATS = [
  { value: "100%", label: "Artists keep their rate" },
  { value: "2 min", label: "To a live shop" },
  { value: "30 days", label: "Free to start" },
] as const;

// The rotating verb line: what Lumenati actually does, one beat at a time.
const HERO_VERBS = [
  "takes the payments.",
  "books your clients.",
  "texts the aftercare.",
  "keeps the books.",
  "bills the booth rent.",
  "coaches every artist.",
] as const;

// The what-it-does ticker between the hero and the pitch. All real features.
const MARQUEE = [
  "Tap to Pay at the chair",
  "Pay links by text",
  "Deposits held automatically",
  "Waivers signed at the chair",
  "Aftercare texts itself",
  "Booth rent auto-billed",
  "Payroll prep per artist",
  "A real P&L, live",
  "Goals with tax set-aside",
  "Waitlist fills cancellations",
  "Review asks on autopilot",
  "Every artist gets their page",
] as const;

export default async function ShopsMarketingPage() {
  // Live "seats left" for the Founding 100 deal. Pure decoration on this page:
  // any hiccup and it just doesn't render.
  let foundingLeft: number | null = null;
  try {
    const admin = createAdminClient();
    if (admin) foundingLeft = Math.max(0, FOUNDING_SEAT_CAP - (await foundingSeatsUsed(admin)));
  } catch {
    foundingLeft = null;
  }
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

      {/* Hero — headline + CTA left, the product on a laptop right. On mobile
          the order is headline, phone, then CTA (phone above "Set up your shop"). */}
      <section className="mx-auto grid max-w-6xl gap-x-10 px-5 pb-16 pt-16 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:grid-rows-[auto_auto] lg:items-center lg:pt-24">
        <div className="order-1 text-center lg:col-start-1 lg:row-start-1 lg:self-end lg:text-left">
          <div className="mkt-rise text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.35em" }}>
            The business brain for tattoo shops
          </div>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            <span className="mkt-word" style={{ animationDelay: "0.1s" }}>Everything</span>{" "}
            <span className="mkt-word" style={{ animationDelay: "0.19s" }}>but</span>
            <br />
            <span className="mkt-word text-brand" style={{ animationDelay: "0.28s" }}>the tattoo.</span>
          </h1>
          <div className="mkt-rise mkt-rise-d2 mt-6 text-xl font-bold text-zinc-100 sm:text-2xl">
            It <RotatingWords words={HERO_VERBS} />
          </div>
          <p className="mkt-rise mkt-rise-d2 mx-auto mt-3 max-w-md text-base text-zinc-400 lg:mx-0">
            One system for the whole shop, front to back. You bring the needle.
          </p>
        </div>

        {/* The product: desktop Command Center in a laptop + the app phone. */}
        <div className="hero-stack mkt-rise mkt-rise-d2 order-2 mt-12 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center">
          <div>
            <div className="mkt-laptop-screen">
              <div className="mkt-laptop-bar">
                <span />
                <span />
                <span />
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marketing/command-center-full.webp" alt="The Lumenati Command Center: the week's money, coach reads, and what needs attention" />
            </div>
            <div className="mkt-laptop-base" />
          </div>
          <div className="mkt-phone">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marketing/app-artist-home.webp" alt="The artist app: Sam's day and earnings" />
          </div>
        </div>

        <div className="order-3 lg:col-start-1 lg:row-start-2 lg:self-start">
          <div className="mkt-rise mkt-rise-d3 mt-10 flex items-center justify-center gap-4 lg:mt-8 lg:justify-start">
            <Link href="/start" className="rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white hover:brightness-110">
              Set up your shop
            </Link>
            <a href="#artist" className="text-sm font-semibold text-zinc-300 hover:text-white">
              What&apos;s in it for me
            </a>
          </div>
          {/* Proof points, Bold-Studio style: big number, quiet label. */}
          <div className="mkt-rise mkt-rise-d4 mt-9 grid grid-cols-3 gap-x-4 lg:flex lg:gap-x-10">
            {HERO_STATS.map((s) => (
              <div key={s.value} className="text-center lg:text-left">
                <div className="text-2xl font-black tracking-tight sm:text-3xl">{s.value}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The what-it-does ticker. */}
      <div className="mkt-marquee" aria-hidden>
        <div className="mkt-marquee-track">
          {[...MARQUEE, ...MARQUEE].map((item, i) => (
            <span key={`${item}-${i}`} className="flex items-center gap-3 whitespace-nowrap text-xs font-semibold uppercase tracking-widest text-zinc-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand/60" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ── FOR EVERY ARTIST ── */}
      <section id="artist" className="py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
              For every artist
            </div>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">
              Run your chair like your own business.
            </h2>
            <p className="mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
              The money app you&apos;ll actually want to open. Your earnings, your goals, your taxes,
              handled, with a coach in your corner.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {ARTIST_BENEFITS.map((b) => (
              <li key={b.title} className="mkt-glass mkt-tile flex gap-3.5 p-6">
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
          </Reveal>

          {/* Mobile: swipeable auto-carousel. */}
          <Reveal className="mt-14 sm:hidden">
            <PhoneCarousel slides={ARTIST_PHONES} />
          </Reveal>
          {/* Desktop: the scroll takeover. The phone grows to own the screen
              and your scrolling scrolls the REAL app, one continuous
              full-height capture of the artist home. */}
          <div className="hidden sm:block">
            <ScrollPhoneDemo
              img={{ src: "/marketing/app-artist-scroll.webp", alt: "The artist app, top to bottom: your day, your money, your goals, the coach, and your whole business" }}
              stops={[
                { at: 0, cap: "Your day and your money." },
                { at: 0.2, cap: "Your goals, taxes set aside, rewards." },
                { at: 0.58, cap: "A coach in your corner." },
                { at: 0.85, cap: "Your whole business, one tap away." },
              ]}
              fallback={ARTIST_PHONES}
            />
          </div>

          {/* Artist pricing. */}
          <Reveal className="mt-16">
          <SpotlightCard className="mkt-lift flex flex-col items-start gap-6 p-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase text-zinc-400" style={{ letterSpacing: "0.2em" }}>
                Solo or booth-rent artist
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-5xl font-black tracking-tight">$99</span>
                <span className="text-lg font-semibold text-zinc-400">/mo</span>
              </div>
              <div className="mt-2 text-sm text-zinc-400">Clients cover the card fee, so you keep 100%. No shop needed.</div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-300">
              Booking, deposits, waivers, texting, winbacks, reviews, your own artist page, the tax
              &amp; 1099 pack, the coach, and get-paid-early. Everything above, for one chair.
            </p>
            <Link href="/start" className="whitespace-nowrap rounded-xl bg-brand px-6 py-3 font-bold text-white hover:brightness-110">
              Get started
            </Link>
          </SpotlightCard>
          </Reveal>
        </div>
      </section>

      {/* ── FOR THE SHOP ── */}
      <section id="shop" className="border-t border-white/10 py-20">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
              For the shop
            </div>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-5xl">
              Run the whole room without a front desk.
            </h2>
            <p className="mt-4 max-w-xl text-sm text-zinc-400 sm:text-base">
              One command center for the money, the coaching, and the retention. On a desk when you
              want the big picture, in your pocket when you don&apos;t.
            </p>
          </Reveal>

          <Reveal delay={0.08}>
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SHOP_BENEFITS.map((b) => (
              <li key={b.title} className="mkt-glass mkt-tile flex gap-3.5 p-6">
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
          </Reveal>

          {/* The desktop back office — a slider of real screens (arrows on lg). */}
          <Reveal>
            <DesktopSlider screens={DESKTOP_SCREENS} />
            <p className="mt-1 text-center text-xs text-zinc-500">Swipe, or use the arrows, to see more of the back office.</p>
          </Reveal>

          {/* Shop pricing. */}
          <Reveal className="mt-14">
          <SpotlightCard className="mkt-lift flex flex-col items-start gap-6 p-7 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="mt-2 text-sm text-zinc-400">Clients cover the card fee, so every artist keeps 100%.</div>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-zinc-300">
              Everything in the artist plan, plus the shop finance layer: splits, booth rent,
              payouts, the P&amp;L, and per-artist performance.
            </p>
            <Link href="/start" className="whitespace-nowrap rounded-xl bg-brand px-6 py-3 font-bold text-white hover:brightness-110">
              Set up your shop
            </Link>
          </SpotlightCard>
          </Reveal>
        </div>
      </section>

      {/* Compare plans. */}
      <section id="pricing" className="mx-auto max-w-4xl border-t border-white/10 px-5 py-20">
        <Reveal className="text-center">
          <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.3em" }}>
            Compare plans
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Two plans. One number each.</h2>
          {foundingLeft !== null && foundingLeft > 0 && (
            <div className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border border-brand/40 bg-brand/[0.08] px-5 py-2 text-sm">
              <span className="font-bold text-brand">Founding 100</span>
              <span className="text-zinc-300">$49 per artist, locked for life</span>
              <span className="font-semibold">{foundingLeft} of 100 seats left</span>
            </div>
          )}
        </Reveal>
        {/* Desktop: side-by-side table. */}
        <Reveal className="mt-10 hidden sm:block">
        <SpotlightCard>
          <table className="w-full text-left text-sm">
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
        </SpotlightCard>
        </Reveal>

        {/* Mobile: two stacked plan cards, no horizontal scroll. */}
        <Reveal className="mt-8 grid gap-5 sm:hidden">
          {([
            { name: "Artist", price: "$99", unit: "/mo", key: "artist" as const, accent: false },
            { name: "Shop", price: "$199", unit: "/mo + $79/artist", key: "shop" as const, accent: true },
          ]).map((plan) => (
            <div key={plan.name} className={`mkt-glass p-6 ${plan.accent ? "border-brand/40" : ""}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wide ${plan.accent ? "text-brand" : "text-zinc-400"}`}>
                {plan.name}
              </div>
              <div className="mt-1 text-3xl font-black">
                {plan.price}
                <span className="text-sm font-semibold text-zinc-400">{plan.unit}</span>
              </div>
              <ul className="mt-4 divide-y divide-white/8">
                {COMPARE.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="text-sm text-zinc-300">{row.label}</span>
                    <span className="flex-none text-sm font-semibold">
                      <PlanCell value={row[plan.key]} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
        <div className="mt-8 text-center">
          <Link href="/start" className="inline-block rounded-xl bg-brand px-8 py-3.5 text-base font-bold text-white hover:brightness-110">
            Set up your shop
          </Link>
        </div>
      </section>

      {/* Close. */}
      <section className="mx-auto max-w-3xl px-5 py-24 text-center">
        <Reveal>
        <SpotlightCard className="px-6 py-12">
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
            Founding shops lock <span className="font-semibold text-zinc-300">$49 per artist for life</span>
            {foundingLeft !== null && foundingLeft > 0 && <> ({foundingLeft} of 100 seats left)</>}. Invite-only
            while we onboard the first cohort, ask us for a code.
          </p>
        </SpotlightCard>
        </Reveal>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-zinc-500">
        Lumenati · Denver, CO
      </footer>
    </div>
  );
}
