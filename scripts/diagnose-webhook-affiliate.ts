/**
 * One-off: Diagnose why affiliate 30485's conversions never received transaction data via webhook.
 * Run: npx tsx scripts/diagnose-webhook-affiliate.ts
 */
import { prisma } from '../lib/db';

const AFFILIATE_NUMBER = 30485;

async function main() {
  const affiliate = await prisma.affiliate.findFirst({
    where: { affiliate_number: AFFILIATE_NUMBER },
    select: {
      id: true,
      affiliate_number: true,
      name: true,
      email: true,
      webhook_url: true,
      webhook_parameter_mapping: true,
      postback_transaction_id: true,
      postback_affiliate_id: true,
      postback_sub1: true,
      postback_sub2: true,
      postback_sub3: true,
      postback_sub4: true,
    },
  });

  if (!affiliate) {
    console.log('Affiliate not found with affiliate_number:', AFFILIATE_NUMBER);
    return;
  }

  console.log('=== AFFILIATE ===');
  console.log(JSON.stringify(affiliate, null, 2));

  const commissions = await prisma.commission.findMany({
    where: { affiliate_id: affiliate.id },
    orderBy: { created_at: 'desc' },
    include: {
      order_attribution: {
        select: { id: true, shopify_order_number: true, click_id: true },
      },
    },
  });

  console.log('\n=== COMMISSIONS (count:', commissions.length, ') ===');

  for (const c of commissions) {
    const oa = c.order_attribution;
    console.log('\n--- Commission', c.id, '| Order', oa?.shopify_order_number, '| Created', c.created_at.toISOString());
    console.log('  order_attribution.click_id:', oa?.click_id ?? 'null');

    const logs = await prisma.affiliateWebhookLog.findMany({
      where: { commission_id: c.id },
      orderBy: { last_attempt_at: 'desc' },
      take: 1,
    });
    if (logs.length) {
      const log = logs[0];
      console.log('  webhook log status:', log.status, '| response_code:', log.response_code);
      console.log('  request_params (what was sent):', JSON.stringify(log.request_params, null, 2));
    } else {
      console.log('  (no webhook log entry)');
    }
  }

  console.log('\n=== SUMMARY ===');
  const withClick = commissions.filter((c) => c.order_attribution?.click_id);
  console.log('Commissions with click_id:', withClick.length, '/', commissions.length);
  console.log('Affiliate-level postback_* (current):', {
    postback_transaction_id: affiliate.postback_transaction_id ?? 'null',
    postback_affiliate_id: affiliate.postback_affiliate_id ?? 'null',
    postback_sub1: affiliate.postback_sub1 ?? 'null',
    postback_sub2: affiliate.postback_sub2 ?? 'null',
    postback_sub3: affiliate.postback_sub3 ?? 'null',
    postback_sub4: affiliate.postback_sub4 ?? 'null',
  });
  console.log('\nParameter mapping sends these dynamic fields to webhook:', Object.entries(affiliate.webhook_parameter_mapping || {}).filter(([, v]: [string, any]) => v?.type === 'dynamic').map(([k, v]: [string, any]) => `${k} <- ${v?.value}`));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
