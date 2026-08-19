/**
 * Captures Trybe's creator-search request so the sourcing script can replay it.
 *
 * Usage:
 *   1. Open Trybe's creator search, apply the filters you want, open DevTools
 *      -> Network, and click through to page 2 of the results.
 *   2. Find the XHR/fetch request that returns the creator list as JSON.
 *      Right-click -> Copy -> Copy as cURL.
 *   3. Paste it into a file, then:
 *        npx tsx scripts/creators-capture-trybe.ts <file> --label beauty-us
 *
 * The captured request contains your Trybe session cookie, so it is written to
 * .trybe/ (gitignored) and never echoed back to the terminal in full.
 */

import './_load-env';
import fs from 'fs';
import path from 'path';
import { parseCurl, redactSpec } from '../lib/creator-outreach/curl';
import { CONFIG_DIR, CONFIG_PATH, discoverRecords, toCreator, type TrybeConfig } from '../lib/creator-outreach/trybe';

/**
 * Guesses how this endpoint paginates by looking for a page-ish parameter in
 * the URL or JSON body. A wrong guess is cheap to fix by hand — the value is
 * written into .trybe/request.json — but a right guess saves the round trip.
 */
function detectPagination(url: string, body: string | undefined): TrybeConfig['pagination'] {
  const PAGE_KEYS = ['page', 'pageNumber', 'page_number', 'p', 'pageIndex'];
  const OFFSET_KEYS = ['offset', 'skip', 'from', 'start'];

  const params = new URL(url).searchParams;
  for (const key of PAGE_KEYS) {
    const value = params.get(key);
    if (value !== null && /^\d+$/.test(value)) {
      return { mode: 'query', param: key, start: parseInt(value, 10), step: 1, maxPages: 20 };
    }
  }
  for (const key of OFFSET_KEYS) {
    const value = params.get(key);
    if (value !== null && /^\d+$/.test(value)) {
      const size = parseInt(params.get('limit') || params.get('pageSize') || params.get('per_page') || '24', 10);
      return { mode: 'offset', param: key, start: parseInt(value, 10), step: size, maxPages: 20 };
    }
  }

  if (body) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      for (const key of [...PAGE_KEYS, ...OFFSET_KEYS]) {
        if (typeof parsed[key] === 'number') {
          return { mode: 'body-json', param: key, start: parsed[key] as number, step: 1, maxPages: 20 };
        }
      }
    } catch {
      // Not JSON — fall through to 'none'.
    }
  }

  return { mode: 'none', param: 'page', start: 1, step: 1, maxPages: 1 };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  const labelIndex = args.indexOf('--label');
  const label = labelIndex >= 0 ? args[labelIndex + 1] : null;

  if (!file) {
    console.error('Usage: npx tsx scripts/creators-capture-trybe.ts <file-with-curl> [--label name]');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`No such file: ${file}`);
    process.exit(1);
  }

  const spec = parseCurl(fs.readFileSync(file, 'utf8'));
  const pagination = detectPagination(spec.url, spec.body);

  const config: TrybeConfig = { request: spec, pagination, label };

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);

  console.log('Captured request:');
  console.log(JSON.stringify(redactSpec(spec), null, 2));
  console.log(`\nPagination: ${pagination.mode}` + (pagination.mode !== 'none' ? ` on "${pagination.param}" from ${pagination.start}` : ''));
  if (pagination.mode === 'none') {
    console.log('  (no page parameter found — edit .trybe/request.json if this endpoint does paginate)');
  }

  // A live probe is worth the one request: it confirms the session is valid and
  // that the record-discovery heuristic actually finds creators, before anyone
  // builds a sourcing run on top of a request that returns an empty list.
  console.log('\nProbing the endpoint once...');
  try {
    const response = await fetch(spec.url, { method: spec.method, headers: spec.headers, body: spec.body });
    if (!response.ok) {
      console.log(`  Trybe returned ${response.status}. Re-copy the cURL after reloading the page.`);
      process.exit(1);
    }
    const payload = await response.json();
    const records = discoverRecords(payload);
    const creators = records.map((r) => toCreator(r)).filter(Boolean);

    console.log(`  Found ${records.length} records, ${creators.length} with an Instagram handle.`);
    if (creators.length > 0) {
      console.log('  Sample:');
      for (const creator of creators.slice(0, 5)) {
        console.log(`    @${creator!.instagramHandle}  ${creator!.fullName ?? ''}  ${creator!.followers ?? '?'} followers`);
      }
      console.log(`\nLooks good. Next: npx tsx scripts/creators-source.ts`);
    } else {
      console.log('\n  No handles found. Either this is the wrong request, or the handle');
      console.log('  lives somewhere the heuristic missed. Save the response and set');
      console.log('  fields.recordsPath / fields.handlePath in .trybe/request.json.');
      fs.writeFileSync(path.join(CONFIG_DIR, 'sample-response.json'), JSON.stringify(payload, null, 2));
      console.log('  Wrote .trybe/sample-response.json for inspection.');
    }
  } catch (err) {
    console.log(`  Probe failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
