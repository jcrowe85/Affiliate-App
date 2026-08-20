/**
 * Self-test for the pure logic in the creator-outreach pipeline.
 *
 * Run: npm run creators:selftest
 *
 * Covers only the parts that decide whether the pipeline works at all and that
 * can be checked without the network: pulling an address out of a bio, reading
 * a captured cURL, and finding the creator list inside a response of unknown
 * shape. Two of these cases are regressions — "email me at jane at gmail dot
 * com" once yielded "me@jane", and "shop at fleur.com" once yielded
 * "shop@fleur.com". Both would have sent real email to an address nobody owns.
 */

import { extractEmailsFromText, chooseContactEmail, isPlausibleEmail } from '../lib/creator-outreach/email-extract';
import { parseCurl } from '../lib/creator-outreach/curl';
import { discoverRecords, toCreator, toCreators, normalizeHandle, extractMetrics, parseGmvBucket } from '../lib/creator-outreach/trybe';

let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

console.log('\n-- bio email extraction --');
eq('plain', extractEmailsFromText('collabs: hello@fleur.com dm for rates'), ['hello@fleur.com']);
eq('(at)/(dot)', extractEmailsFromText('mgmt (at) talent (dot) co'), ['mgmt@talent.co']);
eq('[at] spaced', extractEmailsFromText('books [at] agency [dot] com'), ['books@agency.com']);
eq('bare at/dot', extractEmailsFromText('reach me at jane dot doe at gmail dot com'), ['jane.doe@gmail.com']);
eq('emoji prefix', extractEmailsFromText('📩 press@brand.co.uk'), ['press@brand.co.uk']);
eq('trailing punct', extractEmailsFromText('Email: hi@brand.com.'), ['hi@brand.com']);
eq('two addresses, order kept', extractEmailsFromText('me@a.com | mgmt@b.com'), ['me@a.com', 'mgmt@b.com']);
eq('no false positive on filename', extractEmailsFromText('logo@2x.png in bio'), []);
eq('rejects example.com', extractEmailsFromText('e.g. name@example.com'), []);
eq('handles no email', extractEmailsFromText('just vibes ✨'), []);
eq('fullwidth @', extractEmailsFromText('contact＠brand.com'), ['contact@brand.com']);

eq('prose "at" with a time', extractEmailsFromText('catch me at 5pm every friday'), []);
eq('prose "shop at brand.com"', extractEmailsFromText('shop at fleur.com for 20% off'), []);
eq('url in bio is not an email', extractEmailsFromText('linktr.ee/janedoe'), []);
eq('at-form after prose', extractEmailsFromText('for collabs email me at janedoe at gmail dot com'), ['janedoe@gmail.com']);
eq('newline separated', extractEmailsFromText('Beauty creator\nmgmt@talent.co\nLA'), ['mgmt@talent.co']);

console.log('\n-- validity guard --');
eq('valid', isPlausibleEmail('a.b+c@sub.domain.io'), true);
eq('double dot', isPlausibleEmail('a..b@x.com'), false);
eq('numeric tld', isPlausibleEmail('a@b.123'), false);

console.log('\n-- contact preference --');
eq('declared wins', chooseContactEmail({ businessEmail: 'biz@x.com', bio: 'other@y.com' }), { email: 'biz@x.com', source: 'business_email' });
eq('bio fallback', chooseContactEmail({ businessEmail: null, bio: 'other@y.com' }), { email: 'other@y.com', source: 'bio' });
eq('bad declared falls back to bio', chooseContactEmail({ businessEmail: 'nope', bio: 'other@y.com' }), { email: 'other@y.com', source: 'bio' });
eq('none', chooseContactEmail({ businessEmail: null, bio: 'nothing here' }), null);

console.log('\n-- handle normalization --');
eq('at prefix', normalizeHandle('@Jane.Doe_'), 'jane.doe_');
eq('profile url', normalizeHandle('https://www.instagram.com/janedoe/?hl=en'), 'janedoe');
eq('tiktok url rejected', normalizeHandle('https://tiktok.com/@janedoe'), null);
eq('reserved path', normalizeHandle('https://instagram.com/p/Cabc123/'), null);
eq('too long', normalizeHandle('a'.repeat(31)), null);

console.log('\n-- curl parsing --');
const chrome = `curl 'https://api.jointrybe.com/v2/creators/search?page=2&limit=24' \\
  -H 'accept: application/json' \\
  -H 'content-type: application/json' \\
  -b 'session=abc123; other=1' \\
  --data-raw '{"filters":{"niche":"beauty"},"page":2}' \\
  --compressed`;
const spec = parseCurl(chrome);
eq('url', spec.url, 'https://api.jointrybe.com/v2/creators/search?page=2&limit=24');
eq('method inferred', spec.method, 'POST');
eq('cookie captured', spec.headers['Cookie'], 'session=abc123; other=1');
eq('body preserved', spec.body, '{"filters":{"niche":"beauty"},"page":2}');
eq('accept-encoding dropped', 'accept-encoding' in spec.headers, false);

console.log('\n-- record discovery on an unknown payload shape --');
const payload = {
  meta: { total: 240, featured: [{ id: 'x', instagram: '@promoted' }] },
  data: {
    results: [
      { id: 'c1', full_name: 'Jane Doe', follower_count: 12400, socials: { instagram: { username: 'janedoe' } } },
      { id: 'c2', full_name: 'Ann Lee', follower_count: 8800, socials: { instagram: { username: '@annlee' } } },
      { id: 'c3', full_name: 'No Social', follower_count: 100, socials: {} },
    ],
  },
};
const records = discoverRecords(payload);
eq('picked the bigger list', records.length, 3);
const creators = records.map((r) => toCreator(r)).filter(Boolean);
eq('mapped handles', creators.map((c) => c!.instagramHandle), ['janedoe', 'annlee']);
eq('mapped id', creators[0]!.trybeCreatorId, 'c1');
eq('mapped name', creators[0]!.fullName, 'Jane Doe');
eq('mapped followers', creators[0]!.followers, 12400);

console.log('\n-- Trybe record shape: instagram handle must beat platform username --');
// Real shape from jointrybe.com/backend/api/discovery/.../creators. On a live
// sample of 100, the top-level `username` (Trybe's own handle) disagreed with
// creatorProfile.instagramUrl for 54 creators. Taking the generic key would
// send us scraping accounts belonging to other people.
const trybeRecord = {
  id: '10fa7ffa-4ab4-4f67-8b3f-00977b89bc77',
  firstName: 'Nicole',
  lastName: 'Lovelace',
  username: 'mom_favorites',
  creatorProfile: { country: 'US', instagramUrl: 'https://instagram.com/nicole_mamapreneur', tiktokUrl: 'https://www.tiktok.com/@momfavorites' },
};
const viaHeuristic = toCreator(trybeRecord as any);
eq('auto-discovery prefers instagramUrl', viaHeuristic!.instagramHandle, 'nicole_mamapreneur');
eq('joins first + last name', viaHeuristic!.fullName, 'Nicole Lovelace');
eq('keeps trybe id', viaHeuristic!.trybeCreatorId, '10fa7ffa-4ab4-4f67-8b3f-00977b89bc77');
const viaPath = toCreator(trybeRecord as any, { handlePath: 'creatorProfile.instagramUrl', idPath: 'id' });
eq('explicit handlePath agrees', viaPath!.instagramHandle, 'nicole_mamapreneur');
eq('tiktok-only profile is not mistaken for instagram', toCreator({ username: 'x', creatorProfile: { tiktokUrl: 'https://www.tiktok.com/@x' } } as any), null);

// Set-level: 19 of every 100 live Trybe records carry no instagramUrl. Judged
// alone, such a record looks like an API that simply names its handle field
// `username`; judged beside siblings that do carry instagramUrl, it plainly
// has no Instagram and must be skipped rather than guessed.
const page = [
  trybeRecord,
  { id: 'c2', username: 'noinsta', creatorProfile: { country: 'US' } },
];
eq('page-level strictness skips the record with no instagram',
   toCreators(page as any).map((c) => c.instagramHandle), ['nicole_mamapreneur']);
eq('payload that models no socials still falls back to username',
   toCreators([{ id: 'c3', username: 'plainapi' }] as any).map((c) => c.instagramHandle), ['plainapi']);

console.log('\n-- Trybe performance snapshot --');
// The shape inside last30Days was never observed directly, so these check the
// tolerant reads AND that the raw block survives regardless.
const perfRecord = {
  id: 'c9',
  username: 'x',
  creatorProfile: { instagramUrl: 'https://instagram.com/x' },
  brandPartnershipCount: 7,
  sampleScore: 82.5,
  last30Days: { gmv: 1450.75, submissions: 12, approvalRate: 91 },
};
const m = extractMetrics(perfRecord as any);
eq('gmv', m.gmv30d, 1450.75);
eq('submissions', m.submissions30d, 12);
eq('approval rate', m.approvalRate, 91);
eq('brand partnerships', m.brandPartnerships, 7);
eq('sample score', m.sampleScore, 82.5);
eq('raw block kept verbatim', m.raw, { gmv: 1450.75, submissions: 12, approvalRate: 91 });

// Different spellings, because the real key names are still unconfirmed.
const alt = extractMetrics({ last30Days: { GMV: '2200', videoCount: 4, submissionApprovalRate: 75 } } as any);
eq('alt spellings', [alt.gmv30d, alt.submissions30d, alt.approvalRate], [2200, 4, 75]);

// A wrong guess must not lose the data.
const unknown = extractMetrics({ last30Days: { totallyUnexpectedKey: 99 } } as any);
eq('unknown keys -> nulls, not a crash', [unknown.gmv30d, unknown.submissions30d], [null, null]);
eq('unknown keys -> raw still stored', unknown.raw, { totallyUnexpectedKey: 99 });

// Trybe reports GMV as a band, not a figure — confirmed live as gmvBucket:"20k+".
eq('bucket "20k+" floors at 20000', parseGmvBucket('20k+'), 20000);
eq('range "5k-10k" floors at 5000', parseGmvBucket('5k-10k'), 5000);
eq('plain "$1,200"', parseGmvBucket('$1,200'), 1200);
eq('"1.5m"', parseGmvBucket('1.5m'), 1500000);
eq('already numeric passes through', parseGmvBucket(4200), 4200);
eq('nonsense -> null', parseGmvBucket('lots'), null);
eq('real record shape', extractMetrics({ last30Days: { gmvBucket: '20k+', submissions: 4, approvalRate: 100 } } as any).gmv30d, 20000);

eq('no performance block at all', extractMetrics({ id: 'z' } as any).gmv30d, null);
eq('metrics ride along on toCreator', toCreator(perfRecord as any)!.metrics.submissions30d, 12);

console.log('\n-- send-time scheduling --');
{
  const { planSendTimes } = require('../lib/creator-outreach/schedule');
  const win = {
    startHour: 9, startMinute: 0, endHour: 17, endMinute: 0,
    timezone: 'America/Chicago', skipWeekends: true, minGapSeconds: 45,
  };
  // Deterministic "random" so the assertions below are stable.
  let seed = 0;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const hourIn = (d: Date) =>
    Number(new Intl.DateTimeFormat('en-US', { timeZone: win.timezone, hour12: false, hour: '2-digit' }).format(d));
  const dayIn = (d: Date) =>
    new Intl.DateTimeFormat('en-US', { timeZone: win.timezone, weekday: 'short' }).format(d);

  // Queued at 3am Wednesday — nothing may go out before the window opens.
  const overnight = planSendTimes({ count: 20, perDay: 20, now: new Date('2026-08-19T08:00:00Z'), window: win, random: rnd });
  eq('all 20 placed', overnight.length, 20);
  eq('none before 09:00 local', overnight.every((d: Date) => hourIn(d) >= 9), true);
  eq('none at or after 17:00 local', overnight.every((d: Date) => hourIn(d) < 17), true);
  eq('strictly increasing', overnight.every((d: Date, i: number) => i === 0 || d > overnight[i - 1]), true);
  eq('min gap respected', overnight.every((d: Date, i: number) => i === 0 || +d - +overnight[i - 1] >= 45000), true);
  eq('spread over hours, not minutes', +overnight[19] - +overnight[0] > 4 * 3600_000, true);

  // Gaps must be irregular — a metronome is the thing this replaces.
  const gaps = overnight.slice(1).map((d: Date, i: number) => +d - +overnight[i]);
  eq('gaps vary', new Set(gaps.map((g: number) => Math.round(g / 60000))).size > 5, true);

  // A batch larger than a day's cap spills forward, skipping the weekend.
  const spill = planSendTimes({ count: 60, perDay: 20, now: new Date('2026-08-21T14:00:00Z'), window: win, random: rnd });
  eq('60 placed across days', spill.length, 60);
  eq('no weekend sends', spill.some((d: Date) => dayIn(d) === 'Sat' || dayIn(d) === 'Sun'), false);
  eq('uses three weekdays', new Set(spill.map((d: Date) => dayIn(d))).size, 3);

  // Multi-day batches must respect a partly-spent first day.
  const partial = planSendTimes({ count: 50, perDay: 20, firstDayLimit: 5, now: new Date('2026-08-19T14:00:00Z'), window: win, random: rnd });
  const perDay = new Map<string, number>();
  partial.forEach((d: Date) => {
    const k = new Intl.DateTimeFormat('en-US', { timeZone: win.timezone, month: 'short', day: 'numeric' }).format(d);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  });
  const counts = [...perDay.values()];
  eq('first day honours the partial limit', counts[0], 5);
  eq('later days get the full cap', counts.slice(1, 3), [20, 20]);
  eq('all 50 placed', partial.length, 50);

  // Regression: when today's window has already closed, the leftover-allowance
  // limit must NOT land on tomorrow — tomorrow starts fresh. This shipped
  // wrong once and silently ran the next day at a third of the cap.
  const afterHours = planSendTimes({ count: 50, perDay: 20, firstDayLimit: 3, now: new Date('2026-08-19T23:30:00Z'), window: win, random: rnd });
  const ahDays = new Map<string, number>();
  afterHours.forEach((d: Date) => {
    const k = new Intl.DateTimeFormat('en-US', { timeZone: win.timezone, month: 'short', day: 'numeric' }).format(d);
    ahDays.set(k, (ahDays.get(k) ?? 0) + 1);
  });
  eq('closed window -> next day gets the FULL cap, not the remainder', [...ahDays.values()][0], 20);

  // Regression: booking days ahead must use each day's own cap. Reusing
  // today's silently under-books every later day, so the warmup ramp never
  // reaches anything queued in advance — caught live with Friday booked at 30
  // when the ramp said 50.
  const ramp = (d: Date) => {
    const day = Math.floor((+d - +new Date('2026-08-20T00:00:00Z')) / 86400000);
    return day <= 0 ? 30 : day === 1 ? 50 : 75;
  };
  const ramped = planSendTimes({ count: 200, perDay: ramp, now: new Date('2026-08-20T13:00:00Z'), window: win, random: rnd });
  const rampDays = new Map<string, number>();
  ramped.forEach((d: Date) => {
    const k = new Intl.DateTimeFormat('en-US', { timeZone: win.timezone, month: 'short', day: 'numeric' }).format(d);
    rampDays.set(k, (rampDays.get(k) ?? 0) + 1);
  });
  eq('each day uses its own cap as the ramp climbs', [...rampDays.values()].slice(0, 3), [30, 50, 75]);

  // Queued after the window closes — rolls to the next day, not out tonight.
  const evening = planSendTimes({ count: 5, perDay: 20, now: new Date('2026-08-19T23:30:00Z'), window: win, random: rnd });
  eq('after-hours batch waits for the morning', hourIn(evening[0]) >= 9, true);
  eq('and lands the next weekday', dayIn(evening[0]), 'Thu');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
