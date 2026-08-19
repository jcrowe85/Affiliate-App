/**
 * Stage 1 — page through Trybe's filtered directory and store the creators.
 *
 * Run: npx tsx scripts/creators-source.ts [--pages 20] [--label beauty-us]
 */

import './_load-env';
import { PrismaClient } from '@prisma/client';
import { loadConfig, sourceCreators } from '../lib/creator-outreach/trybe';
import { ingestSourced, resolveShopId, statusCounts } from '../lib/creator-outreach/pipeline';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const pagesIndex = args.indexOf('--pages');
  const labelIndex = args.indexOf('--label');

  const config = loadConfig();
  if (pagesIndex >= 0) config.pagination.maxPages = parseInt(args[pagesIndex + 1], 10);
  const label = labelIndex >= 0 ? args[labelIndex + 1] : config.label ?? null;

  const shopId = await resolveShopId();
  console.log(`Sourcing for shop ${shopId}${label ? ` (filter: ${label})` : ''}`);

  // Every handle we already hold, so paging can tell "new creator" apart from
  // "one we sourced last week under a different filter" and wind down on its
  // own. This is why nobody has to remember which page they stopped on.
  const existing = await prisma.creatorLead.findMany({
    where: { shopify_shop_id: shopId },
    select: { instagram_handle: true },
  });
  const known = new Set(existing.map((lead) => lead.instagram_handle));
  console.log(`Already hold ${known.size} creators — paging until new ones dry up.\n`);

  const result = await sourceCreators(config, {
    known,
    onPage: (page, found, fresh) =>
      console.log(`  page ${page}: ${found} creators, ${fresh} new${fresh === 0 ? ' (all already known)' : ''}`),
  });

  if (result.error) console.error(`\n! ${result.error}`);
  console.log(`\nFetched ${result.pagesFetched} page(s), stopped: ${result.stoppedBecause}`);
  if (result.stoppedBecause === 'saturated') {
    console.log('  (this filter is exhausted — pages kept returning creators we already hold)');
  }
  console.log(`Found ${result.creators.length} distinct creators, ${result.newCount} of them new.`);

  const summary = await ingestSourced(shopId, result.creators, label);
  console.log(
    `Stored: ${summary.created} new, ${summary.alreadyKnown} already known` +
      `${summary.newFilterOverlap ? ` (${summary.newFilterOverlap} first seen under this filter)` : ''}` +
      `, ${summary.suppressed} suppressed.`
  );

  console.log('\nPipeline:', await statusCounts(shopId));
  console.log('Next: npx tsx scripts/creators-resolve.ts');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
