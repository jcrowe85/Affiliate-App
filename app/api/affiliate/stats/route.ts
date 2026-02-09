import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAffiliate } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Get affiliate dashboard statistics
 * SECURITY: Only returns data for the logged-in affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const affiliate = await getCurrentAffiliate();
    if (!affiliate) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // SECURITY: Always filter by affiliate_id to prevent data leakage
    const affiliateId = affiliate.id;

    // Get total commissions
    const totalCommissions = await prisma.commission.count({
      where: {
        affiliate_id: affiliateId,
      },
    });

    // Get commissions by status
    const pendingCommissions = await prisma.commission.count({
      where: {
        affiliate_id: affiliateId,
        status: 'pending',
      },
    });

    const eligibleCommissions = await prisma.commission.count({
      where: {
        affiliate_id: affiliateId,
        status: 'eligible',
      },
    });

    const paidCommissions = await prisma.commission.count({
      where: {
        affiliate_id: affiliateId,
        status: 'paid',
      },
    });

    // Get total revenue and commission amounts
    const allCommissions = await prisma.commission.findMany({
      where: {
        affiliate_id: affiliateId,
      },
      select: {
        amount: true,
        status: true,
        currency: true,
      },
    });

    const totalRevenue = allCommissions
      .filter(c => c.status !== 'reversed')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const totalCommissionsAmount = allCommissions
      .filter(c => c.status !== 'reversed')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const paidCommissionsAmount = allCommissions
      .filter(c => c.status === 'paid')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    const pendingCommissionsAmount = allCommissions
      .filter(c => c.status === 'pending' || c.status === 'eligible')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    // Get total clicks
    const totalClicks = await prisma.click.count({
      where: {
        affiliate_id: affiliateId,
      },
    });

    // Get total conversions (orders)
    const totalConversions = await prisma.orderAttribution.count({
      where: {
        affiliate_id: affiliateId,
      },
    });

    // Calculate conversion rate
    const conversionRate = totalClicks > 0 
      ? ((totalConversions / totalClicks) * 100).toFixed(2)
      : '0.00';

    // Get fraud flags count
    const fraudFlags = await prisma.fraudFlag.count({
      where: {
        affiliate_id: affiliateId,
        resolved: false,
      },
    });

    // Get upcoming payouts (eligible commissions)
    const upcomingPayouts = await prisma.commission.count({
      where: {
        affiliate_id: affiliateId,
        status: 'eligible',
        eligible_date: {
          lte: new Date(),
        },
      },
    });

    return NextResponse.json({
      totalCommissions,
      pendingCommissions,
      eligibleCommissions,
      paidCommissions,
      totalRevenue: totalRevenue.toFixed(2),
      totalCommissionsAmount: totalCommissionsAmount.toFixed(2),
      paidCommissionsAmount: paidCommissionsAmount.toFixed(2),
      pendingCommissionsAmount: pendingCommissionsAmount.toFixed(2),
      totalClicks,
      totalConversions,
      conversionRate,
      fraudFlags,
      upcomingPayouts,
      currency: allCommissions[0]?.currency || 'USD',
    });
  } catch (error: any) {
    console.error('Affiliate stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
