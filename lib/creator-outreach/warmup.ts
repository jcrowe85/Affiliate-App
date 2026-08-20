/**
 * Sending-volume warmup.
 *
 * creators.tryfleur.com was verified with no sending history at all. To a
 * mailbox provider a brand-new domain that starts at 300/day is
 * indistinguishable from a domain bought that morning to spam from, and the
 * penalty — landing in Promotions or spam — is invisible from our side. Nothing
 * bounces. The sends just quietly stop working.
 *
 * So the cap ramps on a schedule instead of sitting at whatever number someone
 * last typed into an env var. Two things matter more than the ramp's speed:
 *
 *   - Consistency. 50 every day beats 0, 0, then 200. Providers read volume
 *     variance as a signal in itself.
 *   - Engagement. Cold outreach earns worse engagement than mail people asked
 *     for, which is exactly why this ramps slower than a newsletter would.
 *
 * Above roughly 50-75/day per sending address, the honest way to scale is more
 * addresses rather than a bigger number here. See WARMUP_NOTE below.
 */

export type WarmupTier = { throughDay: number; cap: number };

/**
 * Midnight of the given instant, in local terms.
 *
 * The tier must change at a day boundary, not at the clock time the ramp was
 * configured — otherwise the cap steps up mid-afternoon and a day gets a
 * mixture of two tiers.
 */
function midnight(at: Date): Date {
  const copy = new Date(at.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Days are 1-based from the first send. Each tier caps sends per rolling 24h
 * up to and including `throughDay`.
 *
 * Roughly a doubling every 4-5 days, which is the fastest ramp that still
 * reads as organic growth. Slower is always safer; faster is how domains get
 * filtered.
 */
export const WARMUP_TIERS: WarmupTier[] = [
  { throughDay: 2, cap: 20 },
  { throughDay: 4, cap: 30 },
  { throughDay: 7, cap: 50 },
  { throughDay: 10, cap: 75 },
  { throughDay: 14, cap: 100 },
  { throughDay: 18, cap: 150 },
  { throughDay: 22, cap: 200 },
  { throughDay: 28, cap: 250 },
];

/** The ceiling once warmup completes, unless a lower cap is configured. */
export const WARMUP_COMPLETE_CAP = 300;

export const WARMUP_NOTE =
  'Past ~50-75/day a single sending address is the bottleneck, not the domain. ' +
  'Scale by adding addresses (or subdomains) and splitting volume between them.';

export type WarmupState = {
  active: boolean;
  day: number | null;
  cap: number;
  /** The next step up, so the UI can say what changes and when. */
  nextCap: number | null;
  nextAt: Date | null;
  note: string;
};

/**
 * The cap in force right now.
 *
 * `configuredCap` always wins when it is lower — warmup raises the floor of
 * caution, it never overrides a deliberately conservative setting.
 */
export function warmupState(options: {
  startedAt: Date | null;
  configuredCap: number;
  now?: Date;
}): WarmupState {
  const { startedAt, configuredCap } = options;
  const now = options.now ?? new Date();

  if (!startedAt) {
    return {
      active: false,
      day: null,
      cap: configuredCap,
      nextCap: null,
      nextAt: null,
      note: 'No warmup start date set — using the configured cap as-is.',
    };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  // Counted in whole days from the start, so the tier steps up at midnight
  // rather than at whatever time of day the ramp happened to begin.
  const day =
    Math.floor((midnight(now).getTime() - midnight(startedAt).getTime()) / msPerDay) + 1;

  if (day < 1) {
    return {
      active: true,
      day,
      cap: 0,
      nextCap: WARMUP_TIERS[0].cap,
      nextAt: startedAt,
      note: `Warmup starts ${startedAt.toDateString()}.`,
    };
  }

  const tierIndex = WARMUP_TIERS.findIndex((tier) => day <= tier.throughDay);
  const tier = tierIndex >= 0 ? WARMUP_TIERS[tierIndex] : null;
  const cap = Math.min(configuredCap, tier ? tier.cap : WARMUP_COMPLETE_CAP);

  if (!tier) {
    return {
      active: false,
      day,
      cap,
      nextCap: null,
      nextAt: null,
      note: `Warmup complete (day ${day}). ${WARMUP_NOTE}`,
    };
  }

  const next = WARMUP_TIERS[tierIndex + 1];
  const nextCap = next ? Math.min(configuredCap, next.cap) : Math.min(configuredCap, WARMUP_COMPLETE_CAP);
  const nextAt = new Date(startedAt.getTime() + tier.throughDay * msPerDay);

  return {
    active: true,
    day,
    cap,
    nextCap: nextCap > cap ? nextCap : null,
    nextAt: nextCap > cap ? nextAt : null,
    note:
      `Day ${day} of warmup — sending is capped at ${cap}/day` +
      (nextCap > cap ? `, rising to ${nextCap} on ${nextAt.toDateString()}.` : '.'),
  };
}

/** Reads the warmup start from config. Unset means no ramp is enforced. */
export function warmupStartedAt(): Date | null {
  const raw = process.env.CREATOR_OUTREACH_WARMUP_START?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** The cap the pipeline should actually enforce. */
export function effectiveDailyCap(now?: Date): { cap: number; state: WarmupState } {
  const configuredCap = parseInt(process.env.CREATOR_OUTREACH_DAILY_CAP || '300', 10);
  const state = warmupState({ startedAt: warmupStartedAt(), configuredCap, now });
  return { cap: state.cap, state };
}

/** The cap that will be in force on a given future day. */
export function capForDay(day: Date): number {
  return effectiveDailyCap(day).cap;
}
