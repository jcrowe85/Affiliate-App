/**
 * One-time backfill: set offer_number for offers that have null.
 * Run: npx tsx scripts/backfill-offer-numbers.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const needBackfill = await prisma.offer.findMany({
    where: { offer_number: null },
    orderBy: [{ shopify_shop_id: 'asc' }, { created_at: 'asc' }],
    select: { id: true, shopify_shop_id: true },
  });

  if (needBackfill.length === 0) {
    console.log('No offers with null offer_number. Nothing to do.');
    return;
  }

  // Group by shop, assign next numbers after existing max
  const byShop = new Map<string, { id: string }[]>();
  for (const o of needBackfill) {
    const list = byShop.get(o.shopify_shop_id) ?? [];
    list.push({ id: o.id });
    byShop.set(o.shopify_shop_id, list);
  }

  let updated = 0;
  for (const [shopId, list] of byShop) {
    const agg = await prisma.offer.aggregate({
      where: { shopify_shop_id: shopId },
      _max: { offer_number: true },
    });
    // Start at 29332 if no offers exist, otherwise continue from max + 1
    const next = agg._max.offer_number != null ? agg._max.offer_number + 1 : 29332;
    for (let i = 0; i < list.length; i++) {
      await prisma.offer.update({
        where: { id: list[i].id },
        data: { offer_number: next + i },
      });
      updated++;
    }
  }

  console.log(`Backfilled offer_number for ${updated} offer(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
