/**
 * Imports Instagram handles harvested from Meta's Creator Marketing Hub.
 *
 * Run: npx tsx scripts/creators-import-meta-hub.ts <file.csv> [--label meta-hub] [--dry]
 *
 * Takes what scripts/meta-hub-harvest.js downloads: a `handle` column plus a
 * best-effort `context` column, which this deliberately drops. Stage 2 (Apify)
 * fills full_name, followers, bio and profile_url from Instagram itself, so
 * the scraped card text would only ever be a worse copy of them.
 *
 * Goes through ingestSourced rather than writing rows directly, so these leads
 * inherit the never-contact suppression list, the one-row-per-handle dedupe
 * that stops a creator already sourced from Trybe being contacted twice, and
 * the same unguessable unsubscribe token the outreach emails verify against.
 */
import './_load-env';
import { readFileSync } from 'fs';
import { ingestSourced, resolveShopId } from '../lib/creator-outreach/pipeline';
import type { SourcedCreator } from '../lib/creator-outreach/trybe';

/** Instagram's own rule: letters, digits, periods, underscores. */
const HANDLE = /^[a-z0-9._]{2,30}$/;

/**
 * Hub chrome that is shaped exactly like a handle.
 *
 * The harvester reads `role="heading"` nodes, and Meta uses that role for
 * section labels as well as for creator names — "Followers" survives the
 * regex above perfectly well. Caught here too, not just in the browser, so a
 * hand-assembled list or an older CSV can't quietly seed a lead called
 * @followers and later email it.
 */
const NOT_A_HANDLE = new Set([
  'followers', 'following', 'follow', 'posts', 'reels', 'creators', 'creator',
  'results', 'filters', 'filter', 'search', 'explore', 'home', 'saved',
  'sponsored', 'partnerships', 'audience', 'engagement', 'overview', 'all',
  'none', 'name', 'handle', 'username', 'profile', 'contact', 'email',
]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Accepts a bare handle, an @handle, or a pasted profile URL — the three
 * shapes that turn up when a list is assembled by hand as well as by console.
 */
function normalize(raw: string): string | null {
  const h = raw
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
  return HANDLE.test(h) && !NOT_A_HANDLE.has(h) ? h : null;
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dry = args.includes('--dry');
  const labelAt = args.indexOf('--label');
  const label = labelAt >= 0 ? args[labelAt + 1] : 'meta-hub';

  if (!file) {
    console.error('usage: npx tsx scripts/creators-import-meta-hub.ts <file.csv> [--label meta-hub] [--dry]');
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(file, 'utf8'));
  const header = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const col = header.indexOf('handle');
  // A headerless file (a plain paste of handles) is just as welcome.
  const body = col >= 0 ? rows.slice(1) : rows;
  const idx = col >= 0 ? col : 0;

  const seen = new Set<string>();
  const rejected: string[] = [];
  const creators: SourcedCreator[] = [];

  for (const r of body) {
    const cell = (r[idx] ?? '').trim();
    const handle = normalize(cell);
    if (!handle) { if (cell) rejected.push(cell); continue; }
    if (seen.has(handle)) continue;
    seen.add(handle);
    creators.push({
      instagramHandle: handle,
      trybeCreatorId: null,
      fullName: null,
      followers: null,
      // Meta's hub publishes no performance block, and these columns mean
      // "Trybe's numbers" specifically — leaving them null keeps that honest.
      metrics: {
        raw: null,
        gmv30d: null,
        submissions30d: null,
        approvalRate: null,
        brandPartnerships: null,
        sampleScore: null,
      },
      raw: { source: 'meta-creator-hub', row: r },
    });
  }

  console.log(`file            ${file}`);
  console.log(`rows            ${body.length}`);
  console.log(`valid handles   ${creators.length}`);
  if (rejected.length) {
    const sample = rejected.slice(0, 5).join(', ');
    console.log(`not handles     ${rejected.length}  (${sample}${rejected.length > 5 ? ', …' : ''})`);
  }

  if (dry) {
    console.log('\n--dry: nothing written. First 10:');
    console.log(creators.slice(0, 10).map((c) => `  @${c.instagramHandle}`).join('\n'));
    return;
  }

  const shopId = await resolveShopId();
  const summary = await ingestSourced(shopId, creators, label);

  console.log(`\nshop            ${shopId}`);
  console.log(`label           ${label}`);
  console.log(`created         ${summary.created}`);
  console.log(`already known   ${summary.alreadyKnown}  (already in the pool, Trybe included — not contacted twice)`);
  console.log(`overlap logged  ${summary.newFilterOverlap}`);
  console.log(`suppressed      ${summary.suppressed}  (never-contact list)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
