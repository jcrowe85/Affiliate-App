/**
 * One-time backfill: record seeding orders that were sent before they were
 * stored locally, so they show in the affiliates table's Seeded column.
 *
 * Reads every Shopify order tagged `affiliate-seeding` and matches it to an
 * affiliate by its `affiliate-<number>` tag. Safe to re-run — orders already
 * recorded are skipped. Needs the read_orders scope.
 *
 * Run: npm run seeds:backfill          (add --dry-run to only print)
 */

import './_load-env';
import { PrismaClient } from '@prisma/client';
import { listSeedOrders, resolveShopifyAdminCredentials } from '../lib/shopify-admin';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const shops = await prisma.affiliate.findMany({
    distinct: ['shopify_shop_id'],
    select: { shopify_shop_id: true },
  });

  for (const { shopify_shop_id } of shops) {
    const creds = await resolveShopifyAdminCredentials(shopify_shop_id);
    const orders = await listSeedOrders(creds);
    console.log(`${shopify_shop_id}: ${orders.length} seeding order(s) in Shopify`);

    const affiliates = await prisma.affiliate.findMany({
      where: { shopify_shop_id },
      select: { id: true, affiliate_number: true, email: true },
    });
    // The tag is `affiliate-<number>`, or `affiliate-<id>` for one with no number.
    const byTag = new Map<string, { id: string; email: string }>();
    for (const a of affiliates) {
      byTag.set(`affiliate-${a.affiliate_number ?? a.id}`.toLowerCase(), a);
    }

    let recorded = 0;
    for (const order of orders) {
      const affiliate = order.tags
        .map((t) => byTag.get(t.toLowerCase()))
        .find(Boolean);
      if (!affiliate) {
        console.log(`  ${order.name}: no matching affiliate (tags: ${order.tags.join(', ')})`);
        continue;
      }

      const summary = order.items.map((i) => `${i.quantity} × ${i.title}`).join(', ');
      console.log(`  ${order.name} -> ${affiliate.email}: ${summary}`);
      if (dryRun) continue;

      await prisma.affiliateSeedOrder.upsert({
        where: { shopify_order_id: order.legacyResourceId },
        update: {},
        create: {
          affiliate_id: affiliate.id,
          shopify_shop_id,
          shopify_order_id: order.legacyResourceId,
          order_name: order.name,
          items: order.items as any,
          created_at: new Date(order.createdAt),
        },
      });
      recorded++;
    }
    console.log(dryRun ? '  (dry run, nothing written)' : `  recorded ${recorded}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
