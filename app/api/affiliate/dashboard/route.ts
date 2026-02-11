import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAffiliate } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Get affiliate dashboard data
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get affiliate stats
    const commissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: affiliate.shopify_shop_id,
      },
      select: {
        amount: true,
        status: true,
      },
    });

    const totalCommissions = commissions
      .filter(c => c.status !== 'reversed')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const paidCommissions = commissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const pendingCommissions = commissions
      .filter(c => c.status === 'eligible' || c.status === 'approved' || c.status === 'pending')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    // Get revenue (order totals)
    const orderAttributions = await prisma.orderAttribution.findMany({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: affiliate.shopify_shop_id,
        commissions: {
          some: {
            status: { not: 'reversed' },
          },
        },
      },
      select: {
        order_total: true,
      },
    });

    const totalRevenue = orderAttributions.reduce(
      (sum, oa) => sum + parseFloat(oa.order_total?.toString() || '0'),
      0
    );

    const totalOrders = await prisma.orderAttribution.count({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: affiliate.shopify_shop_id,
      },
    });

    const totalClicks = await prisma.click.count({
      where: {
        affiliate_id: affiliate.id,
        shopify_shop_id: affiliate.shopify_shop_id,
      },
    });

    return NextResponse.json({
      affiliate: {
        id: affiliate.id,
        email: affiliate.email,
        name: affiliate.name,
        affiliate_number: affiliate.affiliate_number,
      },
      stats: {
        total_commissions: totalCommissions.toFixed(2),
        paid_commissions: paidCommissions.toFixed(2),
        pending_commissions: pendingCommissions.toFixed(2),
        total_revenue: totalRevenue.toFixed(2),
        total_orders: totalOrders,
        total_clicks: totalClicks,
      },
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
