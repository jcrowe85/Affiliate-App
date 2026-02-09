import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAffiliate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Get affiliate conversions (commissions)
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
      },
      include: {
        order_attribution: {
          include: {
            order: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 100,
    });

    const formatted = commissions.map(c => ({
      id: c.id,
      order_number: c.order_attribution.order?.shopify_order_id || 'N/A',
      amount: c.amount.toString(),
      currency: c.currency,
      status: c.status,
      eligible_date: c.eligible_date.toISOString(),
      created_at: c.created_at.toISOString(),
    }));

    return NextResponse.json({ conversions: formatted });
  } catch (error: any) {
    console.error('Affiliate conversions error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch conversions' },
      { status: 500 }
    );
  }
}
