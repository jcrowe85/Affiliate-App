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

    // Get pending approvals
    const pendingApprovals = await prisma.commission.count({
      where: {
        shopify_shop_id: shopifyShopId,
        status: 'eligible',
      },
    });

    // Get unresolved fraud flags
    const fraudFlags = await prisma.fraudFlag.count({
      where: {
        shopify_shop_id: shopifyShopId,
        resolved: false,
      },
    });

    // Get upcoming payouts (eligible commissions)
    const upcomingPayouts = await prisma.commission.count({
      where: {
        shopify_shop_id: shopifyShopId,
        status: 'eligible',
        eligible_date: {
          lte: new Date(), // Eligible now
        },
      },
    });

    // Get total commissions count
    const totalCommissions = await prisma.commission.count({
      where: {
        shopify_shop_id: shopifyShopId,
      },
    });

    // Get all commissions for calculations
    const allCommissions = await prisma.commission.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
      },
      select: {
        amount: true,
        status: true,
      },
    });

    // Calculate revenue and commission totals
    const totalRevenue = allCommissions
      .filter(c => c.status !== 'reversed')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const totalCommissionsAmount = allCommissions
      .filter(c => c.status !== 'reversed')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const paidCommissions = allCommissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const owedCommissions = allCommissions
      .filter(c => c.status === 'eligible' || c.status === 'approved')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    // Get clicks and conversions
    const totalClicks = await prisma.click.count({
      where: {
        shopify_shop_id: shopifyShopId,
      },
    });

    const totalConversions = await prisma.orderAttribution.count({
      where: {
        shopify_shop_id: shopifyShopId,
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