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

  const result = await sourceCreators(config, {
    onPage: (page, found) => console.log(`  page ${page}: ${found} new creators`),
  });

  if (result.error) console.error(`\n! ${result.error}`);
  console.log(`\nFetched ${result.pagesFetched} page(s), stopped: ${result.stoppedBecause}`);
  console.log(`Found ${result.creators.length} distinct creators.`);

  const summary = await ingestSourced(shopId, result.creators, label);
  console.log(
    `Stored: ${summary.created} new, ${summary.alreadyKnown} already known, ${summary.suppressed} suppressed.`
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
