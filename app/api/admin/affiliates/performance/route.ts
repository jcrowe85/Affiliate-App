import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get affiliate performance ranking
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');

    // Get affiliate performance stats
    const affiliateStats = await prisma.affiliate.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'active',
      },
      select: {
        id: true,
        name: true,
        email: true,
        _count: {
          select: {
            clicks: true,
            orders: true,
            commissions: true,
          },
        },
      },
    });

    // Get commission aggregates for all affiliates in one query
    const affiliateIds = affiliateStats.map(a => a.id);
    const commissionAggregates = affiliateIds.length > 0
      ? await prisma.commission.groupBy({
          by: ['affiliate_id', 'status'],
          where: {
            affiliate_id: { in: affiliateIds },
            shopify_shop_id: admin.shopify_shop_id,
          },
          _sum: {
            amount: true,
          },
        })
      : [];

    // Group aggregates by affiliate_id
    const aggregatesByAffiliate = new Map<string, { total: number; paid: number; pending: number }>();
    commissionAggregates.forEach(agg => {
      const existing = aggregatesByAffiliate.get(agg.affiliate_id) || { total: 0, paid: 0, pending: 0 };
      const amount = parseFloat(agg._sum.amount?.toString() || '0');
      
      if (agg.status !== 'reversed') {
        existing.total += amount;
      }
      if (agg.status === 'paid') {
        existing.paid += amount;
      }
      if (agg.status === 'eligible' || agg.status === 'approved') {
        existing.pending += amount;
      }
      
      aggregatesByAffiliate.set(agg.affiliate_id, existing);
    });

    // Calculate performance metrics for each affiliate
    const performance = affiliateStats.map(affiliate => {
      const aggregates = aggregatesByAffiliate.get(affiliate.id) || { total: 0, paid: 0, pending: 0 };

      const orders = affiliate._count.orders;
      const clicks = affiliate._count.clicks;
      const conversionRate = clicks > 0 ? (orders / clicks) * 100 : 0;

      return {
        affiliate_id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        clicks,
        orders,
        conversion_rate: conversionRate.toFixed(2),
        total_commission: aggregates.total.toFixed(2),
        paid_commission: aggregates.paid.toFixed(2),
        pending_commission: aggregates.pending.toFixed(2),
        total_commissions_count: affiliate._count.commissions,
      };
    });

    // Sort by total commission (descending)
    performance.sort((a, b) => parseFloat(b.total_commission) - parseFloat(a.total_commission));

    return NextResponse.json({
      affiliates: performance.slice(0, limit),
      total: performance.length,
    });
  } catch (error: any) {
    console.error('Error fetching affiliate performance:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch affiliate performance',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}