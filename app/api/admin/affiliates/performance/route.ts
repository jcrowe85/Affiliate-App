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
    const period = searchParams.get('period') || '30d'; // 1h, 24h, 7d, 30d, 90d, max

    // Calculate date range based on period
    let startDate: Date | null = null;
    if (period !== 'max') {
      const now = new Date();
      let timeMs: number;
      if (period === '1h') {
        timeMs = 60 * 60 * 1000; // 1 hour
      } else if (period === '24h') {
        timeMs = 24 * 60 * 60 * 1000; // 24 hours
      } else if (period === '7d') {
        timeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      } else if (period === '30d') {
        timeMs = 30 * 24 * 60 * 60 * 1000; // 30 days
      } else if (period === '90d') {
        timeMs = 90 * 24 * 60 * 60 * 1000; // 90 days
      } else {
        timeMs = 30 * 24 * 60 * 60 * 1000; // default to 30 days
      }
      startDate = new Date(now.getTime() - timeMs);
    }

    // Build date filter for commissions and orders
    const dateFilter = startDate ? { created_at: { gte: startDate } } : {};

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
      },
    });

    const affiliateIds = affiliateStats.map(a => a.id);

    // Get clicks count for the period
    const clicksData = affiliateIds.length > 0
      ? await prisma.click.groupBy({
          by: ['affiliate_id'],
          where: {
            affiliate_id: { in: affiliateIds },
            shopify_shop_id: admin.shopify_shop_id,
            ...dateFilter,
          },
          _count: {
            id: true,
          },
        })
      : [];

    // Get order attributions for the period (for revenue calculation)
    const orderAttributions = affiliateIds.length > 0
      ? await prisma.orderAttribution.findMany({
          where: {
            affiliate_id: { in: affiliateIds },
            shopify_shop_id: admin.shopify_shop_id,
            ...dateFilter,
          },
          select: {
            affiliate_id: true,
            order_total: true,
            order_currency: true,
            commissions: {
              select: {
                status: true,
              },
            },
          },
        })
      : [];

    // Get commission aggregates for the period
    const commissionAggregates = affiliateIds.length > 0
      ? await prisma.commission.groupBy({
          by: ['affiliate_id', 'status'],
          where: {
            affiliate_id: { in: affiliateIds },
            shopify_shop_id: admin.shopify_shop_id,
            ...dateFilter,
          },
          _sum: {
            amount: true,
          },
        })
      : [];

    // Group aggregates by affiliate_id
    const aggregatesByAffiliate = new Map<string, { 
      total: number; 
      paid: number; 
      pending: number;
      revenue: number;
      clicks: number;
      orders: number;
    }>();

    // Initialize all affiliates
    affiliateStats.forEach(affiliate => {
      aggregatesByAffiliate.set(affiliate.id, {
        total: 0,
        paid: 0,
        pending: 0,
        revenue: 0,
        clicks: 0,
        orders: 0,
      });
    });

    // Add clicks
    clicksData.forEach(click => {
      const existing = aggregatesByAffiliate.get(click.affiliate_id);
      if (existing) {
        existing.clicks = click._count.id;
      }
    });

    // Add revenue from order totals (what customers paid)
    orderAttributions.forEach(oa => {
      const existing = aggregatesByAffiliate.get(oa.affiliate_id);
      if (existing) {
        // Only count orders with non-reversed commissions
        const hasNonReversedCommission = oa.commissions.some(c => c.status !== 'reversed');
        if (hasNonReversedCommission) {
          existing.revenue += parseFloat(oa.order_total?.toString() || '0');
          existing.orders += 1;
        }
      }
    });

    // Add commission aggregates
    commissionAggregates.forEach(agg => {
      const existing = aggregatesByAffiliate.get(agg.affiliate_id);
      if (existing) {
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
      }
    });

    // Calculate performance metrics for each affiliate
    const performance = affiliateStats.map(affiliate => {
      const aggregates = aggregatesByAffiliate.get(affiliate.id) || { 
        total: 0, 
        paid: 0, 
        pending: 0,
        revenue: 0,
        clicks: 0,
        orders: 0,
      };

      const conversionRate = aggregates.clicks > 0 ? (aggregates.orders / aggregates.clicks) * 100 : 0;

      return {
        affiliate_id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        clicks: aggregates.clicks,
        orders: aggregates.orders,
        conversion_rate: conversionRate.toFixed(2),
        revenue: aggregates.revenue.toFixed(2),
        total_commission: aggregates.total.toFixed(2),
        paid_commission: aggregates.paid.toFixed(2),
        pending_commission: aggregates.pending.toFixed(2),
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