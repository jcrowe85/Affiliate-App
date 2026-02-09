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
        payout_runs: {
          include: {
            payout_run: true,
          },
        },
        order_attribution: true,
      },
      orderBy: {
        eligible_date: 'desc',
      },
    });

    const formatted = commissions.map(c => ({
      id: c.id,
      order_number: c.order_attribution?.shopify_order_number || c.order_attribution?.shopify_order_id || 'N/A',
      amount: c.amount.toString(),
      currency: c.currency,
      status: c.status,
      eligible_date: c.eligible_date.toISOString(),
      payout_runs: c.payout_runs.map(pr => ({
        id: pr.payout_run.id,
        period_start: pr.payout_run.period_start.toISOString(),
        period_end: pr.payout_run.period_end.toISOString(),
        status: pr.payout_run.status,
        payout_reference: pr.payout_run.payout_reference,
      })),
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
