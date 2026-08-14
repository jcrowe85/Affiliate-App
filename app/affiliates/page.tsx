import Image from 'next/image';
import Link from 'next/link';

/**
 * Public recruitment page for the affiliate programme.
 *
 * Styled against the Fleur brand kit rather than the generic indigo it inherited:
 * bone backdrop instead of white, charcoal ink, oxblood for action, copper as the
 * single accent. The brand bible calls for calm, assured and elevated, and rules
 * out loud, gimmicky and miracle-driven — so no urgency banners, no competitor
 * teardown, and no earnings promised that the programme cannot guarantee.
 */

export const metadata = {
  title: 'Fleur Affiliates — earn up to 20% on every sale',
  description:
    'Partner with Fleur, a copper-peptide haircare brand. Earn up to 20% commission per sale, with recurring commission available to qualifying creators.',
};

function Wordmark() {
  return (
    <Link href="/affiliates" className="inline-flex items-baseline gap-2">
      <span className="text-xl font-semibold tracking-[0.2em] uppercase text-fleur-ink dark:text-fleur-bone">
        Fleur
      </span>
      <span className="text-xs tracking-[0.18em] uppercase text-fleur-ink/50 dark:text-fleur-bone/50">
        Affiliates
      </span>
    </Link>
  );
}

function Rule() {
  return <span className="block h-px w-12 bg-fleur-copper/60" aria-hidden="true" />;
}

const COMMISSION = [
  {
    title: 'Up to 20% per sale',
    body: 'Commission on every order your audience places, paid on the full order value. Your rate is set when your account is approved and grows with your results.',
  },
  {
    title: 'Recurring, for those who qualify',
    body: 'Fleur is bought as a ritual, not a one-off. Creators who consistently drive volume may be offered commission on subscription rebills as well as first orders.',
  },
  {
    title: 'Paid how you prefer',
    body: 'Choose Venmo or PayPal when you apply. Commissions are approved on a Net-30 basis and paid to the destination you confirmed at signup.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Apply',
    body: 'Tell us who you are and how you reach your audience, and confirm where you would like to be paid. It takes a couple of minutes.',
  },
  {
    n: '02',
    title: 'Share',
    body: 'Once approved you get a referral link that tracks every visit and order back to you, plus a dashboard to watch it work.',
  },
  {
    n: '03',
    title: 'Earn',
    body: 'Commission is credited as orders come in. Track clicks, orders and payouts in one place — no spreadsheets, no chasing.',
  },
];

export default function AffiliateMarketingPage() {
  return (
    <div className="min-h-screen bg-fleur-bone text-fleur-ink dark:bg-[#1B2124] dark:text-fleur-bone antialiased">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-fleur-ink/10 dark:border-fleur-bone/10 bg-fleur-bone/85 dark:bg-[#1B2124]/85 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-6">
            <Link
              href="/affiliates/login"
              className="text-sm text-fleur-ink/70 hover:text-fleur-ink dark:text-fleur-bone/70 dark:hover:text-fleur-bone transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/apply"
              className="rounded-sm bg-fleur-oxblood px-5 py-2.5 text-sm font-medium tracking-wide text-fleur-bone hover:bg-[#6d1c1b] transition-colors"
            >
              Apply
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-24 sm:pt-28 sm:pb-32">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="mb-6 text-xs uppercase tracking-[0.22em] text-fleur-ink/50 dark:text-fleur-bone/50">
              The Fleur affiliate programme
            </p>
            <h1 className="text-[2.75rem] leading-[1.08] sm:text-6xl font-semibold tracking-tight text-fleur-ink dark:text-fleur-bone">
              Up to 20% commission
              <span className="block text-fleur-ink/60 dark:text-fleur-bone/60">
                on every sale
              </span>
            </h1>

            <div className="mt-8 mb-8">
              <Rule />
            </div>

            <p className="max-w-xl text-lg leading-relaxed text-fleur-ink/75 dark:text-fleur-bone/75">
              Partner with a copper-peptide haircare brand your audience will keep
              coming back to. Commission is paid on the full order value, and
              creators who qualify may also earn on subscription rebills — the
              customers you send tend to stay.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/apply"
                className="inline-flex items-center justify-center rounded-sm bg-fleur-oxblood px-8 py-4 text-base font-medium tracking-wide text-fleur-bone hover:bg-[#6d1c1b] transition-colors"
              >
                Apply to join
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center rounded-sm border border-fleur-ink/25 dark:border-fleur-bone/25 px-8 py-4 text-base font-medium tracking-wide text-fleur-ink dark:text-fleur-bone hover:border-fleur-ink/50 dark:hover:border-fleur-bone/50 transition-colors"
              >
                How it works
              </a>
            </div>

            <p className="mt-6 text-sm text-fleur-ink/50 dark:text-fleur-bone/50">
              Applications are reviewed by our team — we&apos;ll be in touch either way.
            </p>
          </div>

          {/* The store's brand film. Kept at its native 16:9 so nothing is
              cropped out — the sequence moves between the bottle and the scalp,
              and a square crop would cut the bottle in half.

              muted + playsInline are what make autoplay permitted at all; the
              poster covers the gap before the first frame decodes, and the
              whole thing is decorative, so it is hidden from assistive tech and
              suppressed for anyone who asks for reduced motion. */}
          <div className="relative">
            <div className="relative aspect-video w-full overflow-hidden rounded-sm bg-[#EADFCE] dark:bg-[#242b2e]">
              <video
                src="/brand/bloom-hero.mp4"
                poster="/brand/bloom-hero-poster.webp"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
              />
              {/* Shown instead of the film when reduced motion is preferred. */}
              <Image
                src="/brand/bloom-hero-poster.webp"
                alt="A bottle of Bloom peptide hair and scalp serum turning slowly against a warm backdrop."
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="hidden object-cover motion-reduce:block"
              />
            </div>
            <p className="mt-4 text-sm italic tracking-wide text-fleur-ink/50 dark:text-fleur-bone/50">
              nourish. strengthen. fleurish.
            </p>
          </div>
        </div>
      </section>

      {/* ── Commission ── */}
      <section className="border-y border-fleur-ink/10 dark:border-fleur-bone/10 bg-fleur-bonedeep/50 dark:bg-[#20262a]">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="max-w-2xl text-3xl sm:text-4xl font-semibold tracking-tight">
            What you earn
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-3">
            {COMMISSION.map((item) => (
              <div key={item.title}>
                <Rule />
                <h3 className="mt-6 text-xl font-medium tracking-tight">{item.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-fleur-ink/70 dark:text-fleur-bone/70">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Fleur ── */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Why it converts
            </h2>
            <div className="mt-8">
              <Rule />
            </div>
            <p className="mt-8 text-lg leading-relaxed text-fleur-ink/75 dark:text-fleur-bone/75">
              Hair growth is a considered purchase. Fleur sits in the credible
              middle — more scientifically serious than a drugstore botanical,
              warmer and less clinical than a prescription route. That is a
              proposition an audience trusts a recommendation on.
            </p>
            <p className="mt-5 text-lg leading-relaxed text-fleur-ink/75 dark:text-fleur-bone/75">
              It is also a ritual rather than a single purchase, with volume
              economics built around multi-bottle packs and subscriptions. The
              customer you introduce is one who tends to reorder.
            </p>
          </div>
          <div className="space-y-10">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm bg-[#F1EFEC] dark:bg-[#242b2e]">
              <Image
                src="/brand/bloom-single.webp"
                alt="A single bottle of Bloom peptide hair and scalp serum beside its oxblood carton."
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
              />
            </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-10">
            {[
              ['Hero product', 'Bloom peptide serum'],
              ['Category', 'Copper-peptide haircare'],
              ['Audience', 'Women with thinning or shedding hair'],
              ['Model', 'Single bottles, multipacks, subscriptions'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-[0.18em] text-fleur-ink/45 dark:text-fleur-bone/45">
                  {label}
                </dt>
                <dd className="mt-2 text-[15px] leading-relaxed text-fleur-ink/80 dark:text-fleur-bone/80">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section
        id="how-it-works"
        className="border-y border-fleur-ink/10 dark:border-fleur-bone/10 bg-fleur-bonedeep/50 dark:bg-[#20262a]"
      >
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-14 grid grid-cols-1 gap-12 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n}>
                <span className="text-sm tracking-[0.2em] text-fleur-copper">{step.n}</span>
                <h3 className="mt-4 text-xl font-medium tracking-tight">{step.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-fleur-ink/70 dark:text-fleur-bone/70">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ── */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center sm:py-32">
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
          From seed to bloom
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-fleur-ink/75 dark:text-fleur-bone/75">
          If your audience trusts you on what they put on their hair, we would like
          to work with you. Tell us about yourself and we&apos;ll take it from there.
        </p>
        <div className="mt-10 flex justify-center">
          <Link
            href="/apply"
            className="inline-flex items-center justify-center rounded-sm bg-fleur-oxblood px-10 py-4 text-base font-medium tracking-wide text-fleur-bone hover:bg-[#6d1c1b] transition-colors"
          >
            Apply to join
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-fleur-ink/10 dark:border-fleur-bone/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <div className="flex items-center gap-6 text-sm text-fleur-ink/60 dark:text-fleur-bone/60">
            <Link href="/affiliates/login" className="hover:text-fleur-ink dark:hover:text-fleur-bone transition-colors">
              Sign in
            </Link>
            <Link href="/apply" className="hover:text-fleur-ink dark:hover:text-fleur-bone transition-colors">
              Apply
            </Link>
            <a
              href="https://tryfleur.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-fleur-ink dark:hover:text-fleur-bone transition-colors"
            >
              tryfleur.com
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-6 pb-10">
          <p className="text-xs leading-relaxed text-fleur-ink/45 dark:text-fleur-bone/45">
            Commission rates are set per affiliate on approval and may vary.
            Recurring commission on subscription rebills is offered at Fleur&apos;s
            discretion to qualifying creators and is not part of the standard
            programme.
          </p>
        </div>
      </footer>
    </div>
  );
}
