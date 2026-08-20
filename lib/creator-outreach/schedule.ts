/**
 * Deciding when each email actually goes out.
 *
 * The naive schedule — fixed spacing from the moment you press the button —
 * produces twenty sends inside five minutes at three in the morning. Two
 * separate problems with that:
 *
 *   - It doesn't look like a person. Real outbound mail from a human arrives
 *     irregularly across a working day, not on a metronome.
 *   - It wastes the send. A cold email that lands at 3am sits under everything
 *     that arrived overnight by the time the creator looks.
 *
 * So sends are scattered across a configured window in the recipient's part of
 * the world, with irregular gaps, spilling into following days when a batch is
 * larger than a day's window can hold.
 */

export type SendWindow = {
  /** Local hour the window opens, 0-23. */
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  timezone: string;
  /** Skip Saturday and Sunday entirely. */
  skipWeekends: boolean;
  /** Never place two sends closer together than this. */
  minGapSeconds: number;
};

export function sendWindowFromEnv(): SendWindow {
  // "09:00-17:00"
  const raw = (process.env.CREATOR_OUTREACH_SEND_WINDOW || '09:00-17:00').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);

  return {
    startHour: match ? Number(match[1]) : 9,
    startMinute: match ? Number(match[2]) : 0,
    endHour: match ? Number(match[3]) : 17,
    endMinute: match ? Number(match[4]) : 0,
    // Recipients are US-wide, so Central splits the difference: 9am Central is
    // 10am Eastern and 7am Pacific, and the window closes before Pacific
    // recipients have left for the day.
    timezone: process.env.CREATOR_OUTREACH_TIMEZONE || 'America/Chicago',
    skipWeekends: process.env.CREATOR_OUTREACH_SKIP_WEEKENDS !== 'false',
    minGapSeconds: parseInt(process.env.CREATOR_OUTREACH_MIN_GAP_SECONDS || '45', 10),
  };
}

/** How far the zone is from UTC at a given instant, in ms. Honours DST. */
function zoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant);

  const at: Record<string, string> = {};
  for (const part of parts) at[part.type] = part.value;

  const asUtc = Date.UTC(
    Number(at.year), Number(at.month) - 1, Number(at.day),
    Number(at.hour) % 24, Number(at.minute), Number(at.second)
  );
  return asUtc - instant.getTime();
}

/** The UTC instant of a given wall-clock time in the zone. */
function fromZoned(
  year: number, month: number, day: number,
  hour: number, minute: number, timezone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  // One correction pass, then a second in case the first crossed a DST
  // boundary and changed which offset applies.
  let instant = naive - zoneOffsetMs(new Date(naive), timezone);
  instant = naive - zoneOffsetMs(new Date(instant), timezone);
  return new Date(instant);
}

/** Calendar date, as seen in the zone. */
function zonedParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(instant);
  const at: Record<string, string> = {};
  for (const part of parts) at[part.type] = part.value;
  return {
    year: Number(at.year),
    month: Number(at.month),
    day: Number(at.day),
    weekday: at.weekday,
  };
}

const WEEKEND = new Set(['Sat', 'Sun']);

/** The window on a given calendar day, as a UTC instant pair. */
function windowFor(dayOffset: number, from: Date, window: SendWindow) {
  const base = new Date(from.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const { year, month, day, weekday } = zonedParts(base, window.timezone);
  return {
    weekday,
    opens: fromZoned(year, month, day, window.startHour, window.startMinute, window.timezone),
    closes: fromZoned(year, month, day, window.endHour, window.endMinute, window.timezone),
  };
}

/**
 * Picks `count` send times, scattered across as many days of window as needed.
 *
 * Within a day the times are stratified rather than uniformly random: the
 * window is cut into equal slots and one random moment is drawn inside each.
 * Pure randomness clumps — you get three sends in the same minute and then an
 * hour of nothing — which is both more suspicious and more wasteful than the
 * metronome it replaced. Stratifying keeps the gaps irregular but never
 * degenerate.
 */
export function planSendTimes(options: {
  count: number;
  now?: Date;
  window?: SendWindow;
  /** Most sends to place in any one day, i.e. the warmup cap. */
  perDay: number;
  /**
   * Slots still free today, when part of today's cap is already spent. Only
   * applies to the first day with an open window; later days get the full
   * `perDay`.
   */
  firstDayLimit?: number;
  random?: () => number;
}): Date[] {
  const window = options.window ?? sendWindowFromEnv();
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;
  const times: Date[] = [];

  let remaining = options.count;
  let dayOffset = 0;

  // 30 days of lookahead is far more than any warmup-capped batch needs; the
  // bound just stops a misconfigured window (opens after it closes) spinning.
  while (remaining > 0 && dayOffset < 30) {
    const { weekday, opens, closes } = windowFor(dayOffset, now, window);
    // Capture before advancing: `firstDayLimit` describes *today* specifically.
    const isToday = dayOffset === 0;
    dayOffset++;

    if (window.skipWeekends && WEEKEND.has(weekday)) continue;

    // Today's window may be partly gone. Start a minute out so the first send
    // isn't due before the batch finishes being written.
    const earliest = new Date(Math.max(opens.getTime(), now.getTime() + 60_000));
    if (earliest >= closes) continue;

    const span = closes.getTime() - earliest.getTime();
    // firstDayLimit is today's leftover allowance. If today's window has
    // already closed, the first day we place into is tomorrow — and tomorrow
    // starts fresh, so it must get the full cap rather than today's remainder.
    const dayCap = isToday ? (options.firstDayLimit ?? options.perDay) : options.perDay;
    const today = Math.min(remaining, dayCap);
    // Never pack a day tighter than the minimum gap allows.
    const capacity = Math.max(1, Math.floor(span / (window.minGapSeconds * 1000)));
    const placing = Math.min(today, capacity);

    const slot = span / placing;
    for (let i = 0; i < placing; i++) {
      const at = earliest.getTime() + i * slot + random() * slot;
      times.push(new Date(at));
    }

    remaining -= placing;
  }

  times.sort((a, b) => a.getTime() - b.getTime());

  // Enforce the floor on gaps. Stratifying makes collisions rare — the tail of
  // one slot meeting the head of the next — but not impossible.
  for (let i = 1; i < times.length; i++) {
    const gap = times[i].getTime() - times[i - 1].getTime();
    const minGap = window.minGapSeconds * 1000;
    if (gap < minGap) times[i] = new Date(times[i - 1].getTime() + minGap);
  }

  return times;
}

/** Human-readable summary of the window, for the UI. */
export function describeWindow(window: SendWindow): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const zone = window.timezone.split('/').pop()?.replace(/_/g, ' ') ?? window.timezone;
  return (
    `${pad(window.startHour)}:${pad(window.startMinute)}–${pad(window.endHour)}:${pad(window.endMinute)} ` +
    `${zone}${window.skipWeekends ? ', weekdays only' : ''}`
  );
}

/**
 * Midnight today, in the sending timezone.
 *
 * The daily cap is counted from here rather than over a rolling 24 hours: a
 * rolling window lets an afternoon's sends eat into the next morning's
 * allowance, which throttles the following day for no gain.
 */
export function startOfSendingDay(now?: Date): Date {
  const window = sendWindowFromEnv();
  const at = now ?? new Date();
  const { year, month, day } = zonedParts(at, window.timezone);
  return fromZoned(year, month, day, 0, 0, window.timezone);
}
