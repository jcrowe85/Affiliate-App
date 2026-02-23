/**
 * Remove test purchases for jcrowe120485@gmail.com attributed to affiliate 30485.
 * Deletes OrderAttribution (and cascade: Commission, PayoutRunCommission, AffiliateWebhookLog, etc.).
 * Run: npx tsx scripts/remove-test-orders.ts
 */
import { prisma } from '../lib/db';

const CUSTOMER_EMAIL = 'jcrowe120485@gmail.com';
const AFFILIATE_NUMBER = 30485;

async function main() {
  const affiliate = await prisma.affiliate.findFirst({
    where: { affiliate_number: AFFILIATE_NUMBER },
    select: { id: true, name: true },
  });

  if (!affiliate) {
    console.log('Affiliate', AFFILIATE_NUMBER, 'not found.');
    return;
  }

  const emailNorm = CUSTOMER_EMAIL.trim().toLowerCase();
  const orderAttributions = await prisma.orderAttribution.findMany({
    where: {
      affiliate_id: affiliate.id,
      customer_email: emailNorm,
    },
    include: {
      commissions: { select: { id: true, amount: true, status: true, shopify_order_id: true } },
    },
  });

  if (orderAttributions.length === 0) {
    console.log('No orders found for', CUSTOMER_EMAIL, 'attributed to affiliate', AFFILIATE_NUMBER);
    return;
  }

  console.log('Found', orderAttributions.length, 'order(s) to remove:');
  orderAttributions.forEach((oa) => {
    console.log('  - Order', oa.shopify_order_number, '| Attribution id:', oa.id, '| Commissions:', oa.commissions.length);
  });

  // Delete OrderAttribution; Commission (and related) will cascade
  const ids = orderAttributions.map((oa) => oa.id);
  await prisma.orderAttribution.deleteMany({
    where: { id: { in: ids } },
  });

  console.log('Removed', orderAttributions.length, 'order attribution(s) and their commission(s).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
