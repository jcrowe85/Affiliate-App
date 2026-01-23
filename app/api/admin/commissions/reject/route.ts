import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Reject commission(s) - mark as reversed
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commissionIds, reason } = await request.json();

    if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return NextResponse.json(
        { error: 'commissionIds array is required' },
        { status: 400 }
      );
    }

    // Only reverse eligible or approved commissions (not paid)
    const updated = await prisma.commission.updateMany({
      where: {
        id: { in: commissionIds },
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['eligible', 'approved'] },
      },
      data: {
        status: 'reversed',
      },
    });

    return NextResponse.json({
      success: true,
      rejected_count: updated.count,
      reason: reason || 'Rejected by admin',
    });
  } catch (error: any) {
    console.error('Error rejecting commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject commissions' },
      { status: 500 }
    );
  }
}