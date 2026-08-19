/**
 * Stage 2 — resolve sourced handles to contact emails.
 *
 * Run: npx tsx scripts/creators-resolve.ts [--limit 200] [--batch 50]
 *
 * Costs money per profile, so it reports the hit rate: that number is what
 * sourcing volume should be planned against.
 */

import './_load-env';
import { PrismaClient } from '@prisma/client';
import { resolvePending, resolveShopId, statusCounts } from '../lib/creator-outreach/pipeline';
import { apifyToken } from '../lib/creator-outreach/instagram';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const batchIndex = args.indexOf('--batch');

  if (!apifyToken()) {
    console.error('No Apify credential found. Set APIFY_TOKEN (or APIFY_API_KEY) in .env.local.');
    process.exit(1);
  }

  const shopId = await resolveShopId();
  const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : 200;
  const batchSize = batchIndex >= 0 ? parseInt(args[batchIndex + 1], 10) : 50;

  console.log(`Resolving up to ${limit} handles for shop ${shopId}...`);

  const summary = await resolvePending(shopId, {
    limit,
    batchSize,
    onBatch: (done, total) => console.log(`  ${done}/${total} profiles fetched`),
  });

  const hitRate = summary.attempted > 0 ? Math.round((summary.withEmail / summary.attempted) * 100) : 0;
  console.log(
    `\nAttempted ${summary.attempted}: ${summary.withEmail} with an email, ` +
      `${summary.withoutEmail} without, ${summary.failed} failed.`
  );
  console.log(`Hit rate: ${hitRate}%`);

  console.log('\nPipeline:', await statusCounts(shopId));
  console.log('Next: npx tsx scripts/creators-send.ts --dry-run');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
