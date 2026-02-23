/**
 * Trace webhook by order attribution id.
 * Run: npx tsx scripts/trace-webhook-by-attribution.ts
 * Or:  ORDER_ATTRIBUTION_ID=cmlyyd83y001p3jexvlvmogoz npx tsx scripts/trace-webhook-by-attribution.ts
 */
import { prisma } from '../lib/db';

const ORDER_ATTRIBUTION_ID = process.env.ORDER_ATTRIBUTION_ID || 'cmlyyd83y001p3jexvlvmogoz';

async function main() {
  const oa = await prisma.orderAttribution.findUnique({
    where: { id: ORDER_ATTRIBUTION_ID },
    include: {
      affiliate: {
        select: {
          id: true,
          affiliate_number: true,
          name: true,
          email: true,
          webhook_url: true,
          webhook_parameter_mapping: true,
        },
      },
      click: {
        select: {
          id: true,
          landing_url: true,
          url_transaction_id: true,
          url_affiliate_id: true,
          url_sub1: true,
          url_sub2: true,
          url_sub3: true,
          url_sub4: true,
          url_params: true,
        },
      },
      commissions: {
        include: {
          affiliate: {
            select: {
              id: true,
              affiliate_number: true,
              name: true,
              webhook_url: true,
            },
          },
          affiliate_webhook_logs: {
            orderBy: { last_attempt_at: 'desc' },
          },
        },
      },
    },
  });

  if (!oa) {
    console.log('OrderAttribution not found:', ORDER_ATTRIBUTION_ID);
    return;
  }

  console.log('=== ORDER ATTRIBUTION ===');
  console.log('id:', oa.id);
  console.log('shopify_order_id:', oa.shopify_order_id);
  console.log('shopify_order_number:', oa.shopify_order_number);
  console.log('attribution_type:', oa.attribution_type);
  console.log('affiliate_id (internal):', oa.affiliate_id);
  console.log('click_id:', oa.click_id ?? '(null)');
  console.log('');

  console.log('=== AFFILIATE (from attribution) ===');
  const aff = oa.affiliate;
  if (aff) {
    console.log('id:', aff.id);
    console.log('affiliate_number (ref):', aff.affiliate_number);
    console.log('name:', aff.name);
    console.log('webhook_url (current in DB):', aff.webhook_url ?? '(null)');
    console.log('webhook_parameter_mapping:', JSON.stringify(aff.webhook_parameter_mapping, null, 2));
  } else {
    console.log('(no affiliate)');
  }
  console.log('');

  if (oa.click) {
    console.log('=== CLICK (attributed click) ===');
    console.log('id:', oa.click.id);
    console.log('landing_url:', oa.click.landing_url);
    console.log('url_transaction_id:', (oa.click as any).url_transaction_id ?? '(null)');
    console.log('url_affiliate_id:', (oa.click as any).url_affiliate_id ?? '(null)');
    console.log('url_sub1..4:', [ (oa.click as any).url_sub1, (oa.click as any).url_sub2, (oa.click as any).url_sub3, (oa.click as any).url_sub4 ]);
    console.log('url_params:', JSON.stringify((oa.click as any).url_params, null, 2));
    console.log('');
  }

  console.log('=== COMMISSIONS ===');
  for (const c of oa.commissions) {
    console.log('Commission id:', c.id);
    console.log('  amount:', c.amount, c.currency, '| status:', c.status);
    console.log('  affiliate_id:', c.affiliate_id);
    console.log('  affiliate (ref):', c.affiliate?.affiliate_number, '| name:', c.affiliate?.name);
    console.log('  affiliate.webhook_url (at load time):', c.affiliate?.webhook_url ?? '(null)');
    console.log('  Webhook logs:');
    if (c.affiliate_webhook_logs.length === 0) {
      console.log('    (none)');
    } else {
      for (const log of c.affiliate_webhook_logs) {
        console.log('    - log id:', log.id);
        console.log('      webhook_url (URL that was called):', log.webhook_url);
        console.log('      status:', log.status, '| response_code:', log.response_code);
        console.log('      error_message:', log.error_message ?? '(none)');
        console.log('      last_attempt_at:', log.last_attempt_at?.toISOString?.());
      }
    }
    console.log('');
  }

  console.log('=== CONCLUSION ===');
  const commission = oa.commissions[0];
  if (commission?.affiliate_webhook_logs?.length) {
    const log = commission.affiliate_webhook_logs[0];
    const stored = commission.affiliate?.webhook_url;
    if (log.webhook_url.includes('tryfleur.com') && stored && !stored.includes('tryfleur.com')) {
      console.log('The webhook log shows we CALLED tryfleur.com, but this affiliate\'s current webhook_url in DB is:', stored);
      console.log('So either (1) webhook_url was tryfleur.com at the time we fired and was updated later, or (2) there is a bug using a different URL than affiliate.webhook_url.');
    } else if (log.webhook_url.includes('tryfleur.com')) {
      console.log('The webhook called tryfleur.com; this affiliate\'s webhook_url in DB is also tryfleur.com or null. Update webhook_url in admin to the partner postback URL.');
    } else {
      console.log('The webhook called:', log.webhook_url);
      console.log('Affiliate webhook_url in DB:', stored);
    }
  } else {
    console.log('No webhook log found for this commission (webhook may not have been configured or may have been skipped).');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
