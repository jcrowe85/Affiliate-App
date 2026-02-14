import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get admin dashboard statistics
 */
export async function GET(request: NextRequest) {
  try {
    // Get admin from session (standalone auth)
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const shopifyShopId = admin.shopify_shop_id;
    const searchParams = request.nextUrl.searchParams;
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

    // Build date filter
    const dateFilter = startDate ? { created_at: { gte: startDate } } : {};

    // Get pending approvals (always all time)
    const pendingApprovals = await prisma.commission.count({
      where: {
        shopify_shop_id: shopifyShopId,
        status: 'eligible',
      },
    });

    // Get unresolved fraud flags (always all time)
    const fraudFlags = await prisma.fraudFlag.count({
      where: {
        shopify_shop_id: shopifyShopId,
        resolved: false,
      },
    });

    // Get upcoming payouts (always all time)
    const upcomingPayouts = await prisma.commission.count({
      where: {
        shopify_shop_id: shopifyShopId,
        status: 'eligible',
        eligible_date: {
          lte: new Date(), // Eligible now
        },
      },
    });

    // Get total commissions count for the period
    const totalCommissions = await prisma.commission.count({
      where: {
        shopify_shop_id: shopifyShopId,
        ...dateFilter,
      },
    });

    // Get all commissions for the period
    const allCommissions = await prisma.commission.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        ...dateFilter,
      },
      select: {
        amount: true,
        status: true,
      },
    });

    // Get all order attributions for the period
    const allOrderAttributions = await prisma.orderAttribution.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        ...dateFilter,
      },
      select: {
        order_total: true,
        commissions: {
          select: {
            status: true,
          },
        },
      },
    });

    // Calculate revenue from order totals (what customers actually paid)
    const totalRevenue = allOrderAttributions
      .filter(oa => oa.commissions.some(c => c.status !== 'reversed')) // Only count orders with non-reversed commissions
      .reduce((sum, oa) => sum + parseFloat(oa.order_total?.toString() || '0'), 0);

    // Calculate commission totals (what we pay affiliates)
    const totalCommissionsAmount = allCommissions
      .filter(c => c.status !== 'reversed')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const paidCommissions = allCommissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const owedCommissions = allCommissions
      .filter(c => c.status === 'eligible' || c.status === 'approved')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    // Get all-time outstanding commissions (eligible + approved, not yet paid)
    // This is all commissions that are not paid or reversed, regardless of period
    const allTimeOutstandingCommissions = await prisma.commission.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
        status: {
          in: ['eligible', 'approved', 'pending'],
        },
      },
      select: {
        amount: true,
        currency: true,
      },
    });

    const outstandingCommissions = allTimeOutstandingCommissions
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    // Get clicks and conversions for the period
    const totalClicks = await prisma.click.count({
      where: {
        shopify_shop_id: shopifyShopId,
        ...dateFilter,
      },
    });

    const totalConversions = await prisma.orderAttribution.count({
      where: {
        shopify_shop_id: shopifyShopId,
        ...dateFilter,
      },
    });

    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    return NextResponse.json({
      pendingApprovals,
      fraudFlags,
      upcomingPayouts,
      totalCommissions,
      totalRevenue: totalRevenue.toFixed(2),
      totalCommissionsAmount: totalCommissionsAmount.toFixed(2),
      paidCommissions: paidCommissions.toFixed(2),
      owedCommissions: owedCommissions.toFixed(2),
      outstandingCommissions: outstandingCommissions.toFixed(2),
      totalClicks,
      totalConversions,
      conversionRate: conversionRate.toFixed(2),
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}