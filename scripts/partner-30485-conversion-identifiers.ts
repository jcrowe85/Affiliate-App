/**
 * Export identifying/fingerprint data for affiliate 30485's conversions
 * so the partner can match click IDs on their end (we don't have affiliate_id/sub params for older clicks).
 *
 * Run: npx tsx scripts/partner-30485-conversion-identifiers.ts
 *
 * Output: JSON and a short help note. Partner can match by:
 * - ip_hash: SHA256(IP). If they log IP and hash with SHA256, they can match.
 * - user_agent_hash: SHA256(User-Agent). Same idea.
 * - landing_url: may contain their params or UTM; click created_at for timing.
 * - order_number, customer_email, order_date for their records.
 */

import { prisma } from '../lib/db';

const AFFILIATE_NUMBER = 30485;

async function main() {
  const affiliate = await prisma.affiliate.findFirst({
    where: { affiliate_number: AFFILIATE_NUMBER },
    select: { id: true, name: true, affiliate_number: true },
  });

  if (!affiliate) {
    console.log('Affiliate', AFFILIATE_NUMBER, 'not found.');
    process.exit(1);
  }

  const commissions = await prisma.commission.findMany({
    where: { affiliate_id: affiliate.id },
    orderBy: { created_at: 'asc' },
    include: {
      order_attribution: {
        include: {
          click: true,
        },
      },
    },
  });

  const rows: Array<{
    conversion_index: number;
    order_number: string;
    order_id: string;
    order_date: string;
    customer_email: string | null;
    customer_name: string | null;
    commission_amount: string;
    commission_status: string;
    // Fingerprint / identifying data (from attributed click if present)
    click_id: string | null;
    click_created_at: string | null;
    ip_hash: string | null;
    user_agent_hash: string | null;
    landing_url: string | null;
    attribution_type: string;
    // So partner can hash their own data and match
    hash_note: string;
  }> = [];

  commissions.forEach((c, idx) => {
    const oa = c.order_attribution;
    const click = oa?.click;
    const clickAny = click as { ip_hash?: string; user_agent_hash?: string; landing_url?: string; created_at?: Date } | null;
    rows.push({
      conversion_index: idx + 1,
      order_number: oa?.shopify_order_number ?? c.shopify_order_id,
      order_id: c.shopify_order_id,
      order_date: c.created_at.toISOString(),
      customer_email: oa?.customer_email ?? null,
      customer_name: oa?.customer_name ?? null,
      commission_amount: c.amount.toString(),
      commission_status: c.status,
      click_id: oa?.click_id ?? null,
      click_created_at: clickAny?.created_at?.toISOString() ?? null,
      ip_hash: clickAny?.ip_hash ?? null,
      user_agent_hash: clickAny?.user_agent_hash ?? null,
      landing_url: clickAny?.landing_url ?? null,
      attribution_type: oa?.attribution_type ?? 'link',
      hash_note: 'ip_hash = SHA256(IP), user_agent_hash = SHA256(User-Agent). Match on their side by hashing the same way.',
    });
  });

  console.log(JSON.stringify({ affiliate: { name: affiliate.name, affiliate_number: affiliate.affiliate_number }, conversions: rows }, null, 2));

  // If landing_url has partner params, extract for easy matching
  const withUrlParams = rows.map((r) => {
    let transaction_id: string | null = null;
    let affiliate_id_param: string | null = null;
    let sub1: string | null = null;
    let sub2: string | null = null;
    let sub3: string | null = null;
    if (r.landing_url) {
      try {
        const u = new URL(r.landing_url);
        transaction_id = u.searchParams.get('transaction_id');
        affiliate_id_param = u.searchParams.get('affiliate_id');
        sub1 = u.searchParams.get('sub1');
        sub2 = u.searchParams.get('sub2');
        sub3 = u.searchParams.get('sub3');
      } catch (_) {}
    }
    return {
      ...r,
      partner_transaction_id: transaction_id,
      partner_affiliate_id: affiliate_id_param,
      partner_sub1: sub1,
      partner_sub2: sub2,
      partner_sub3: sub3,
    };
  });

  const out = { affiliate: { name: affiliate.name, affiliate_number: affiliate.affiliate_number }, conversions: withUrlParams };
  const fs = await import('fs');
  const path = 'scripts/partner-30485-conversion-identifiers.json';
  fs.writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  console.log('\nWritten to', path);

  console.log('\n--- HELP FOR PARTNER ---');
  console.log('For these 7 conversions, landing_url contains your params — you can match by:');
  console.log('  - transaction_id (in URL) = your click/transaction ID');
  console.log('  - affiliate_id, sub1, sub2, sub3 (in URL) = your identifiers');
  console.log('Fingerprint (if you do not have URL params for a click):');
  console.log('  - ip_hash: SHA256(IP). Hash the visitor IP with SHA256 and match to ip_hash.');
  console.log('  - user_agent_hash: SHA256(User-Agent). Same to match.');
  console.log('  - click_created_at (UTC) + order_number / customer_email to correlate with your conversions.');
  console.log('Total conversions:', rows.length);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
