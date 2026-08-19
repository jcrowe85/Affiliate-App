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
import { discoverRecords, toCreator, toCreators, normalizeHandle } from '../lib/creator-outreach/trybe';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
