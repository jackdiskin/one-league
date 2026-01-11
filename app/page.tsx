// app/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Background accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-200/40 via-sky-200/30 to-indigo-200/20 blur-3xl" />
        <div className="absolute -bottom-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-sky-200/40 via-indigo-200/25 to-emerald-200/20 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
            <Image
              src={String(process.env.LOGO_URI)}
              alt="One League"
              fill
              className="object-contain p-1"
              priority
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">One League</span>
            <span className="text-xs text-slate-500">Fantasy meets a market</span>
          </div>
        </div>

        <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
          <a href="#how" className="hover:text-slate-900">
            How it works
          </a>
          <a href="#features" className="hover:text-slate-900">
            Features
          </a>
          <a href="#leagues" className="hover:text-slate-900">
            Leagues
          </a>
          <a href="#faq" className="hover:text-slate-900">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/signin"
            className="hidden rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 md:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-10 md:px-6 md:pb-28 md:pt-14">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              Salary-cap fantasy with weekly player pricing
            </div>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
              <span className="text-slate-900">Build a team.</span>
              <br />
              <span className="text-slate-900">Trade a market.</span>
              <br />
              <span className="relative inline-block">
                <span
                  className="gradient-text bg-gradient-to-br from-slate-900 via-slate-700 to-emerald-500 bg-clip-text text-transparent"
                  style={{ WebkitTextFillColor: "transparent" }} // ensures Safari behaves
                >
                  Climb the ranks.
                </span>
                <span className="pointer-events-none absolute inset-0 -skew-x-12 opacity-25 blur-[0.5px] [mask-image:linear-gradient(120deg,transparent,black,transparent)] bg-gradient-to-r from-white/0 via-white/70 to-white/0" />
              </span>
            </h1>


            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
              One League is an FPL-style fantasy platform for football: you draft within a
              budget, make limited weekly roster edits, and your players’ prices move like a stock
              based on performance and news.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Create account
              </Link>
              <a
                href="#how"
                className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                See how it works
              </a>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <Stat label="Weekly" value="Price updates" />
              <Stat label="Fixed" value="Transfers/week" />
              <Stat label="Global" value="Rankings" />
            </div>
          </div>

          {/* Right side mock */}
          <div className="relative">
            <div className="rounded-3xl bg-white/70 p-5 shadow-xl ring-1 ring-slate-200 backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold">Market Movers</span>
                </div>
                <span className="text-xs text-slate-500">Week 7</span>
              </div>

              <div className="mt-4 space-y-3">
                <MoverRow 
                  name="RB — S. Barkley"
                  team="PHL"
                  price="$12.4M"
                  delta="+$0.8M"
                  headshotSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/5e7d1fd2-6ad8-4e3f-2140-9c1141904000/public"
                  logoSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/dc752df7-6125-4dd9-53de-c90aa1f7e300/public"
                  up
                />
                <MoverRow
                  name="QB — M. Stafford"
                  team="LAR" price="$9.1M"
                  delta="+$0.6M"
                  headshotSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/f8b6c1ca-a0c1-4766-4cc8-b7256e07b500/public"
                  logoSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/00248a95-c1d5-40dd-378f-b241d312af00/public"
                  up
                />
                <MoverRow
                  name="WR — J. Jefferson"
                  team="MIN"
                  price="$8.1M"
                  delta="-$2.2M"
                  headshotSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/0d46ddcd-bf85-47da-b4cc-c1cd6618c700/public"
                  logoSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/50210e65-6a4f-4743-82eb-79f43a8e3500/public"
                  up={false}
                />
                <MoverRow
                  name="QB — J. Dart"
                  team="NYG"
                  price="$6.3M"
                  delta="-$0.3M"
                  headshotSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/6bd10987-cc1c-4241-4783-25a943a04f00/public"
                  logoSrc="https://imagedelivery.net/lTqxm5bcU25j65ZWROzf3Q/b944dc92-ce43-41fd-f881-0a2ce9f58000/public"
                  up={false}
                />
              </div>

              <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">My Team</span>
                  <span className="text-xs text-slate-500">Budget left: $3.2M</span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <CardTile title="Points (week)" value="112" sub="Projected 118" />
                  <CardTile title="Transfers left" value="2" sub="Reset on deadline" />
                  <CardTile title="League rank" value="3rd" sub="in “Friends”" />
                  <CardTile title="Global rank" value="12,481" sub="Top 8%" />
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-3xl bg-gradient-to-br from-emerald-400/25 to-sky-400/20 blur-xl" />
            <div className="pointer-events-none absolute -left-8 -bottom-10 h-28 w-28 rounded-3xl bg-gradient-to-br from-indigo-400/20 to-sky-400/20 blur-xl" />
          </div>
        </div>

        {/* Logos / trust row */}
        <div className="mt-14 rounded-3xl bg-white/60 p-6 ring-1 ring-slate-200 backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">Designed for:</p>
              <p className="text-sm text-slate-600">
                friends leagues, regional ladders, affinity groups, and global rankings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill>Leagues</Pill>
              <Pill>Salary cap</Pill>
              <Pill>Market pricing</Pill>
              <Pill>Watchlists</Pill>
              <Pill>Weekly settlement</Pill>
            </div>
          </div>
        </div>

        {/* How it works */}
        <section id="how" className="mt-16 md:mt-20">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">How it works</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Familiar fantasy rules, plus a market layer that rewards timing, news awareness,
            and long-term roster construction.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <StepCard
              step="01"
              title="Draft within a budget"
              body="Start the season with a salary cap. Buy players at their current market price."
            />
            <StepCard
              step="02"
              title="Score weekly points"
              body="Players earn fantasy points from real games. Your team total updates every week."
            />
            <StepCard
              step="03"
              title="Trade & climb rankings"
              body="Make limited weekly transfers. Player prices shift based on performance, injuries, and news."
            />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mt-16 md:mt-20">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Core features</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FeatureCard
              title="Player market with price history"
              body="See weekly price changes, movers, ownership trends, and a clean player detail view."
            />
            <FeatureCard
              title="Team management that feels premium"
              body="Roster UI, transfer confirmations, budget tracking, and deadline lock indicators."
            />
            <FeatureCard
              title="Leagues with friends"
              body="Private leagues with invite codes, standings, activity feed, and member team pages."
            />
            <FeatureCard
              title="Global, regional, and affinity leaderboards"
              body="Compete in multiple ladders at once—friends, city/region, school/work, and global."
            />
          </div>
        </section>

        {/* Leagues */}
        <section id="leagues" className="mt-16 md:mt-20">
          <div className="rounded-3xl bg-slate-900 p-8 text-white md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Make it competitive without making it complicated.
                </h2>
                <p className="mt-2 max-w-2xl text-white/80">
                  Limited weekly transfers, market prices that react to the league, and standings
                  that update cleanly after each week.
                </p>
              </div>
              <div className="flex gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100"
                >
                  Start a league
                </Link>
                <Link
                  href="/signin"
                  className="inline-flex items-center justify-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/15"
                >
                  Join with code
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mt-16 md:mt-20">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">FAQ</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Faq
              q="Is this like FanDuel?"
              a="Not exactly—One League is season-long like FPL, but adds market-style pricing that updates weekly."
            />
            <Faq
              q="How do roster edits work?"
              a="You get a fixed number of transfers per week. Moves are confirmed, budget-aware, and tracked."
            />
            <Faq
              q="How do player prices change?"
              a="Prices update on a schedule using performance, injuries, and news signals. The model can evolve over time."
            />
            <Faq
              q="Will there be mobile?"
              a="Yes—this web app is the first client. The API is designed so mobile can consume the same endpoints later."
            />
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-slate-200 pt-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-9 w-9 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                <Image
                  src={String(process.env.LOGO_URI)}
                  alt="One League"
                  fill
                  className="object-contain p-1"
                />
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">One League</span> © {new Date().getFullYear()}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <Link href="/how-it-works" className="hover:text-slate-900">
                How it works
              </Link>
              <Link href="/rules" className="hover:text-slate-900">
                Rules
              </Link>
              <Link href="/privacy" className="hover:text-slate-900">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-slate-900">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 ring-1 ring-slate-200 backdrop-blur">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
      {children}
    </span>
  );
}

function StepCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-white/70 p-6 ring-1 ring-slate-200 backdrop-blur">
      <div className="text-xs font-semibold text-slate-500">{step}</div>
      <div className="mt-2 text-lg font-semibold">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{body}</div>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl bg-white/70 p-6 ring-1 ring-slate-200 backdrop-blur">
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{body}</div>
      <div className="mt-4 h-1 w-16 rounded-full bg-slate-900/10" />
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-3xl bg-white/70 p-6 ring-1 ring-slate-200 backdrop-blur">
      <div className="text-base font-semibold">{q}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{a}</div>
    </div>
  );
}

function CardTile({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function MoverRow({
  name,
  team,
  price,
  delta,
  up,
  headshotSrc,
  logoSrc
}: {
  name: string;
  team: string;
  price: string;
  delta: string;
  up: boolean;
  headshotSrc: string;
  logoSrc: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex flex-row justify-start items-center gap-3">
        <div>
          <Image
            src={headshotSrc}
            alt={`${name} headshot`}
            width={72}
            height={72}
            className="h-14 w-14 object-cover border rounded-full"
          />
        </div>
        <div className="min-w-0 flex flex-col gap-2">
          <div className="truncate text-sm font-semibold text-slate-900">{name}</div>
          <div className="flex flex-row justify-start items-center gap-2">
            <div className="text-xs text-slate-500">{team}</div>
            <Image
              src={logoSrc}
              alt={`${team}'s logo`}
              width={16}
              height={16}
            />
          </div>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-900">{price}</div>
          <div className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
            {delta}
          </div>
        </div>
        <div
          className={`h-9 w-9 rounded-xl ring-1 ${
            up ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200"
          } flex items-center justify-center`}
          aria-hidden
        >
          <span className={`${up ? "text-emerald-700" : "text-rose-700"} text-sm`}>
            {up ? "↗" : "↘"}
          </span>
        </div>
      </div>
    </div>
  );
}