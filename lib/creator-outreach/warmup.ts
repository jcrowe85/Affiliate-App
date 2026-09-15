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
    const cap = Math.min(configuredCap, UNKNOWN_START_CAP);
    return {
      active: true,
      day: null,
      cap,
      nextCap: null,
      nextAt: null,
      note:
        `No active warmup run — nothing sent yet, or sending paused for ${WARMUP_RESET_GAP_DAYS}+ days — ` +
        `so sending is held at ${cap}/day until the next send restarts the ramp.`,
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

/** Reads the warmup start from config, if configured. */
export function warmupStartedAt(): Date | null {
  const raw = process.env.CREATOR_OUTREACH_WARMUP_START?.trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A pause long enough that the domain has to warm up again.
 *
 * Mailbox providers judge a sender on recent history, not lifetime history. A
 * domain that sent for a week and then went quiet for two is, to them, close to
 * new again — resuming at the calendar's cap reads as the 0, 0, then 200 pattern
 * the ramp exists to prevent. This happened: sending stopped Sep 1, and the
 * calendar alone would have resumed at 250/day on Sep 15.
 */
export const WARMUP_RESET_GAP_DAYS = 7;

/**
 * Where the ramp should count from, given the configured start and the days
 * mail actually went out.
 *
 * The ramp restarts after any gap of `gapDays` or more, including the gap
 * between the last send and now — in which case this returns null, holding
 * sending at UNKNOWN_START_CAP until the next send starts a fresh run. A start
 * configured after the last send is a deliberate restart and wins; one
 * configured before the first real send can't be used to skip the ramp.
 */
export function effectiveWarmupStart(options: {
  configured: Date | null;
  /** Any instant within each day mail went out. */
  sendDays: Date[];
  now?: Date;
  gapDays?: number;
}): Date | null {
  const now = options.now ?? new Date();
  const gapMs = (options.gapDays ?? WARMUP_RESET_GAP_DAYS) * 24 * 60 * 60 * 1000;
  const { configured } = options;
  const sends = options.sendDays
    .filter((d) => d.getTime() <= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

  if (sends.length === 0) return configured;

  const last = sends[sends.length - 1];
  if (configured && configured.getTime() > last.getTime()) return configured;
  if (now.getTime() - last.getTime() >= gapMs) return null;

  let runStart = sends[0];
  for (let i = 1; i < sends.length; i++) {
    if (sends[i].getTime() - sends[i - 1].getTime() >= gapMs) runStart = sends[i];
  }
  return configured && configured.getTime() > runStart.getTime() ? configured : runStart;
}

/**
 * Cap used when no warmup start is configured and none can be inferred.
 *
 * A missing environment variable must never read as "no limit". This shipped
 * to production without CREATOR_OUTREACH_WARMUP_START set, and the deployed
 * worker read the ceiling — 300/day — as the cap in force, ten times the
 * intended pace on a domain four days old. Absent config now fails closed.
 */
export const UNKNOWN_START_CAP = 20;

/**
 * The cap the pipeline should actually enforce.
 *
 * `startedAt` overrides the configured start — callers that can reach the
 * database pass the first send date, so the ramp survives a missing env var
 * rather than silently disappearing.
 */
export function effectiveDailyCap(
  now?: Date,
  startedAt?: Date | null
): { cap: number; state: WarmupState } {
  const configuredCap = parseInt(process.env.CREATOR_OUTREACH_DAILY_CAP || '300', 10);
  const state = warmupState({
    // Only an omitted start falls back to config. An explicit null is a
    // decision — "no active run" — and must not quietly become the old date.
    startedAt: startedAt === undefined ? warmupStartedAt() : startedAt,
    configuredCap,
    now,
  });
  return { cap: state.cap, state };
}

/** The cap that will be in force on a given future day. */
export function capForDay(day: Date, startedAt?: Date | null): number {
  return effectiveDailyCap(day, startedAt).cap;
}
