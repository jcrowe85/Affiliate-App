/**
 * Find webhook log entries that called tryfleur.com and show which affiliate they used.
 * Run: npx tsx scripts/find-tryfleur-webhook-logs.ts
 * Use this to verify whether the wrong URL was used for affiliate 30485 or a different affiliate.
 */
import { prisma } from '../lib/db';

async function main() {
  const logs = await prisma.affiliateWebhookLog.findMany({
    where: {
      webhook_url: { contains: 'tryfleur.com' },
    },
    orderBy: { last_attempt_at: 'desc' },
    take: 20,
    include: {
      commission: { select: { id: true, shopify_order_id: true, created_at: true } },
      affiliate: { select: { id: true, affiliate_number: true, name: true, webhook_url: true } },
    },
  });

  if (logs.length === 0) {
    console.log('No webhook logs found that called tryfleur.com.');
    return;
  }

  console.log('=== WEBHOOK LOGS THAT CALLED tryfleur.com ===\n');
  for (const log of logs) {
    const aff = log.affiliate;
    console.log('Log id:', log.id);
    console.log('  Commission:', log.commission?.id, '| Order:', log.commission?.shopify_order_id, '| At:', log.last_attempt_at?.toISOString?.() ?? log.created_at?.toISOString?.());
    console.log('  Affiliate id (internal):', aff?.id);
    console.log('  Affiliate number (ref):', aff?.affiliate_number);
    console.log('  Affiliate name:', aff?.name);
    console.log('  URL that was called:', log.webhook_url);
    console.log('  That affiliate’s CURRENT webhook_url in DB:', aff?.webhook_url ?? '(null)');
    console.log('');
  }

  const affiliate30485 = await prisma.affiliate.findFirst({
    where: { affiliate_number: 30485 },
    select: { id: true, affiliate_number: true, webhook_url: true },
  });
  if (affiliate30485) {
    console.log('=== AFFILIATE 30485 (current DB) ===');
    console.log('  id:', affiliate30485.id);
    console.log('  webhook_url:', affiliate30485.webhook_url);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
