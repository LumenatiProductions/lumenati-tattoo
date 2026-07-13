import Link from "next/link";
import { LumenatiLogo } from "@/components/brand/LumenatiLogo";

// The marketing page: sells hosted artist pages + the Command Center to
// other shops. The pitch line is locked (Scott, 2026-07-12): "keep your
// website, we take over everything behind it." The skin demos are the REAL
// demo tenant in phone-width iframes — live product, not screenshots.

const DEMO = "/s/apple-review/sam-rivera";

const SKINS = [
  {
    key: "standard",
    name: "Standard",
    blurb: "The clean look. The work leads, booking is one tap.",
  },
  {
    key: "dark",
    name: "Dark ink",
    blurb: "Smoke and hairlines, built for blackwork and fine line.",
  },
  {
    key: "flash",
    name: "Flash sheet",
    blurb: "The sheet is the page. Priced per piece, claimed right off it.",
  },
] as const;

const FEATURES = [
  {
    title: "Requests land with the artist",
    body: "Every booking request arrives with the idea, placement, and reference photos attached, already routed to the right artist. Nobody plays phone tag at a counter.",
  },
  {
    title: "Flash that sells itself",
    body: "Post a sheet, price each piece, and clients claim them straight off the page. Claimed pieces get stamped and retired on their own.",
  },
  {
    title: "Books that close cleanly",
    body: "When an artist closes their books, every Book button becomes a waitlist door. The page never goes dark and the list is waiting when they reopen.",
  },
  {
    title: "Money in one place",
    body: "Registers, end-of-day books, and who-gets-what live in the Command Center instead of a spreadsheet and a shoebox.",
  },
  {
    title: "Aftercare built in",
    body: "Clients leave with care instructions on their phone and check back in with healed photos. The follow-up happens without anyone chasing it.",
  },
  {
    title: "An app your crew will use",
    body: "Artists run their page, requests, and day from a pocket. Owners carry the whole shop on theirs.",
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

      {/* Hero — the locked pitch. The accent phrase's period rides the pink. */}
      <section className="mkt-rise mx-auto max-w-3xl px-5 pb-16 pt-20 text-center sm:pt-28">
        <div className="text-[11px] font-bold uppercase text-brand" style={{ letterSpacing: "0.35em" }}>
          For tattoo shops
        </div>
        <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Keep your website.
          <br />
          <span className="text-brand">We take over everything behind it.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-zinc-300 sm:text-lg">
          Every artist in your shop gets a page built to get them booked. You get a command
          center that runs the whole back office. No front desk required.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link
            href="/start"
            className="rounded-xl bg-brand px-7 py-3.5 text-base font-bold text-white hover:brightness-110"
          >
            Set up your shop
          </Link>
          <a href={`${DEMO}?skin=standard`} className="text-sm font-semibold text-zinc-300 hover:text-white">
            See a live page
          </a>
        </div>
      </section>

      {/* The three skins — live product in phone frames, not screenshots. */}
      <section className="mkt-rise-2 pb-20">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-center text-2xl font-black tracking-tight sm:text-3xl">
            Three looks. One tap to book on all of them.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-400">
            These are live pages, not mockups. Scroll them. Each artist picks their look and
            everything underneath stays the same: portfolio, flash, socials, booking.
          </p>
        </div>
        <div className="mt-10 flex snap-x gap-8 overflow-x-auto px-8 pb-6 xl:justify-center">
          {SKINS.map((s) => (
            <figure key={s.key} className="w-[360px] flex-none snap-center">
              <div className="mkt-phone">
                <iframe src={`${DEMO}?skin=${s.key}`} title={`${s.name} skin, live demo`} loading="lazy" />
              </div>
              <figcaption className="mt-4 text-center">
                <div className="text-base font-bold">{s.name}</div>
                <p className="mt-1 text-sm text-zinc-400">{s.blurb}</p>
                <a
                  href={`${DEMO}?skin=${s.key}`}
                  className="mt-2 inline-block text-sm font-semibold text-brand hover:brightness-110"
                >
                  Open it live
                </a>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* No front desk, on purpose. */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            No front desk. On purpose.
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Great shops run on great artists, not a counter. Lumenati points everything at the
            artist and keeps the owner in the loop.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-white/10 border-t-white/20 bg-white/[0.04] p-6"
            >
              <h3 className="text-base font-bold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close — same door as the hero. */}
      <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
        <div className="rounded-3xl border border-white/10 border-t-white/20 bg-white/[0.04] px-6 py-12">
          <h2 className="text-3xl font-black tracking-tight">
            Two minutes to a live shop<span className="text-brand">.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-zinc-400">
            Name the shop, list the crew, pick a color. Your pages go live and your sign-in
            invite is in your inbox before the machine warms up.
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
