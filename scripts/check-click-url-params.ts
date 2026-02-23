/**
 * Check if any Click records have url param fields populated.
 * Run: npx tsx scripts/check-click-url-params.ts
 */
import { prisma } from '../lib/db';

async function main() {
  const total = await prisma.click.count();
  const withAnyParam = await prisma.click.count({
    where: {
      OR: [
        { url_transaction_id: { not: null } },
        { url_affiliate_id: { not: null } },
        { url_sub1: { not: null } },
        { url_sub2: { not: null } },
        { url_sub3: { not: null } },
        { url_sub4: { not: null } },
      ],
    },
  });

  console.log('Click table: total rows =', total);
  console.log('Clicks with any url param field populated =', withAnyParam);

  if (withAnyParam > 0) {
    const samples = await prisma.click.findMany({
      where: {
        OR: [
          { url_transaction_id: { not: null } },
          { url_affiliate_id: { not: null } },
          { url_sub1: { not: null } },
          { url_sub2: { not: null } },
          { url_sub3: { not: null } },
          { url_sub4: { not: null } },
        ],
      },
      select: {
        id: true,
        created_at: true,
        affiliate_id: true,
        url_transaction_id: true,
        url_affiliate_id: true,
        url_sub1: true,
        url_sub2: true,
        url_sub3: true,
        url_sub4: true,
        url_params: true,
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    console.log('\nSample clicks with url params (most recent 10):');
    console.log(JSON.stringify(samples, null, 2));
  } else {
    console.log('\nNo clicks found with url_transaction_id, url_affiliate_id, url_sub1-4, or url_params set.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
