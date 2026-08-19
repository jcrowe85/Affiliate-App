/**
 * Copy experiments: assigning variants and reading the results honestly.
 *
 * The hard part of a copy test is not running it, it is not being fooled by it.
 * Reply counts are small and noisy — 3/20 against 6/20 looks like B is twice as
 * good and is entirely consistent with the two being identical. So this module
 * reports a confidence level alongside every comparison, and says plainly when
 * there isn't enough data yet rather than leaving a suggestive number sitting
 * there uncontested.
 */

/**
 * Standard normal CDF, via the Abramowitz–Stegun 7.1.26 approximation of erf.
 * Accurate to ~1e-7, which is far beyond what sample sizes like these justify.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

export type VariantStats = {
  variant: string;
  sent: number;
  replied: number;
  joined: number;
  /** Replies as a share of sends. The headline number. */
  replyRate: number;
  joinRate: number;
};

export type Comparison = {
  leader: string | null;
  /** Probability the observed gap would appear if the variants were identical. */
  pValue: number;
  significant: boolean;
  /** Plain-language read, safe to show a non-statistician. */
  verdict: string;
  /** Roughly how many more sends per variant before a call is possible. */
  moreSendsNeeded: number | null;
};

/**
 * Two-proportion z-test on reply rates.
 *
 * Two-sided: we are asking "do these differ", not "is B better", because the
 * variant that happens to lead early is not a hypothesis chosen in advance.
 */
export function compareVariants(stats: VariantStats[]): Comparison {
  const ranked = [...stats].sort((a, b) => b.replyRate - a.replyRate);
  const [top, second] = ranked;

  if (!top || !second || top.sent === 0 || second.sent === 0) {
    return {
      leader: null,
      pValue: 1,
      significant: false,
      verdict: 'Not enough sends yet — both variants need results before anything can be compared.',
      moreSendsNeeded: null,
    };
  }

  const pooled = (top.replied + second.replied) / (top.sent + second.sent);
  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / top.sent + 1 / second.sent));

  if (standardError === 0 || pooled === 0) {
    return {
      leader: null,
      pValue: 1,
      significant: false,
      verdict:
        top.replied + second.replied === 0
          ? 'No replies yet on either variant.'
          : 'Too few replies to compare.',
      moreSendsNeeded: null,
    };
  }

  const z = (top.replyRate - second.replyRate) / standardError;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const significant = pValue < 0.05;

  // Sends per arm needed to detect the currently-observed gap at 95%/80%
  // power. A rough guide, not a promise — the observed gap is itself noisy.
  const gap = Math.abs(top.replyRate - second.replyRate);
  const perArm =
    gap > 0
      ? Math.ceil((2 * Math.pow(1.96 + 0.84, 2) * pooled * (1 - pooled)) / (gap * gap))
      : null;
  const moreSendsNeeded =
    !significant && perArm ? Math.max(0, perArm - Math.min(top.sent, second.sent)) : null;

  const pct = (rate: number) => `${(rate * 100).toFixed(1)}%`;

  const verdict = significant
    ? `${top.variant} is ahead — ${pct(top.replyRate)} vs ${pct(second.replyRate)}. ` +
      `That gap is unlikely to be chance (p=${pValue.toFixed(3)}).`
    : `${top.variant} leads on ${pct(top.replyRate)} vs ${pct(second.replyRate)}, but that is ` +
      `within noise (p=${pValue.toFixed(2)}). ` +
      (moreSendsNeeded
        ? `Roughly ${moreSendsNeeded} more sends per variant would settle it.`
        : 'Keep sending before drawing a conclusion.');

  return { leader: significant ? top.variant : null, pValue, significant, verdict, moreSendsNeeded };
}

/**
 * Balanced assignment across a batch.
 *
 * Deliberately round-robin rather than random. Coin-flipping 20 leads lands on
 * a 13/7 split often enough to matter, and an uneven split costs power in
 * exactly the situation where there is least to spare.
 */
export function assignVariants(count: number, variants: string[], offset = 0): string[] {
  return Array.from({ length: count }, (_, i) => variants[(i + offset) % variants.length]);
}
