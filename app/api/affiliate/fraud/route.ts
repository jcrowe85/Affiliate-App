import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAffiliate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Get affiliate fraud flags
 * SECURITY: Only returns data for the logged-in affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Always filter by affiliate_id
    const fraudFlags = await prisma.fraudFlag.findMany({
      where: {
        affiliate_id: affiliate.id,
      },
      include: {
        commission: {
          include: {
            order_attribution: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const formatted = fraudFlags.map(ff => ({
      id: ff.id,
      commission_id: ff.commission_id,
      flag_type: ff.flag_type,
      score: ff.score,
      reason: ff.reason,
      resolved: ff.resolved,
      created_at: ff.created_at.toISOString(),
      commission: {
        id: ff.commission.id,
        order_number: ff.commission.order_attribution?.shopify_order_number || ff.commission.order_attribution?.shopify_order_id || 'N/A',
        amount: ff.commission.amount.toString(),
        currency: ff.commission.currency,
        status: ff.commission.status,
      },
    }));

    return NextResponse.json({ fraudFlags: formatted });
  } catch (error: any) {
    console.error('Affiliate fraud flags error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch fraud flags' },
      { status: 500 }
    );
  }
}
