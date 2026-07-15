import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAffiliate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Get affiliate payouts
 * SECURITY: Only returns data for the logged-in affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Always filter by affiliate_id
    const commissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliate.id,
        status: {
          in: ['eligible', 'paid'],
        },
      },
      include: {
        payout_run_commissions: {
          include: {
            payout_run: true,
          },
        },
        order_attribution: {
          select: {
            shopify_order_number: true,
            shopify_order_id: true,
          },
        },
      },
      orderBy: {
        eligible_date: 'desc',
      },
    });

    const formatted = commissions.map(c => ({
      id: c.id,
      order_number: c.order_attribution.shopify_order_number || c.order_attribution.shopify_order_id || 'N/A',
      amount: c.amount.toString(),
      currency: c.currency,
      status: c.status,
      eligible_date: c.eligible_date.toISOString(),
      // PayoutRunCommission.commission_id is unique, so a commission belongs to
      // at most one payout run. Still returned as an array to keep the response
      // shape stable for existing clients.
      payout_runs: c.payout_run_commissions
        ? [
            {
              id: c.payout_run_commissions.payout_run.id,
              period_start: c.payout_run_commissions.payout_run.period_start.toISOString(),
              period_end: c.payout_run_commissions.payout_run.period_end.toISOString(),
              status: c.payout_run_commissions.payout_run.status,
              payout_reference: c.payout_run_commissions.payout_run.payout_reference,
            },
          ]
        : [],
    }));

    return NextResponse.json({ payouts: formatted });
  } catch (error: any) {
    console.error('Affiliate payouts error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payouts' },
      { status: 500 }
    );
  }
}
