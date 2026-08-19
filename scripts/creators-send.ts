/**
 * Stage 3 — send the outreach emails.
 *
 * Run: npx tsx scripts/creators-send.ts [--limit 25] [--dry-run]
 *
 * Designed to be run on a schedule in small slices rather than as one daily
 * burst: a cron entry sending ~25 every couple of hours looks far more like a
 * person than 300 emails in four minutes, and keeps the rolling cap honest
 * even if a run is missed.
 */

import './_load-env';
import { PrismaClient } from '@prisma/client';
import { sendBatch, sentInLast24h, resolveShopId, statusCounts } from '../lib/creator-outreach/pipeline';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const dryRun = args.includes('--dry-run');

  const shopId = await resolveShopId();
  const alreadySent = await sentInLast24h(shopId);
  const cap = parseInt(process.env.CREATOR_OUTREACH_DAILY_CAP || '100', 10);

  console.log(`Shop ${shopId} — ${alreadySent}/${cap} sent in the last 24h.`);
  if (dryRun) console.log('DRY RUN — nothing will actually be sent.\n');

  const summary = await sendBatch(shopId, {
    limit: limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : undefined,
    dryRun,
    // A dry run shouldn't sit there sleeping between imaginary sends.
    delayMs: dryRun ? 0 : undefined,
    onSend: (email, ok, reason) =>
      console.log(`  ${ok ? '->' : '!!'} ${email}${reason ? ` (${reason})` : ''}`),
  });

  console.log(
    `\nSent ${summary.sent}, failed ${summary.failed}, skipped ${summary.skipped}. ` +
      `Cap headroom at start of run: ${summary.capRemaining}.`
  );
  console.log('\nPipeline:', await statusCounts(shopId));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
