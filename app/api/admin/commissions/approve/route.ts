import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { firePostbacks } from '@/lib/postback';

/**
 * Approve commission(s) for payout
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commissionIds } = await request.json();

    if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
      return NextResponse.json(
        { error: 'commissionIds array is required' },
        { status: 400 }
      );
    }

    // Check for unresolved fraud flags before approving
    const fraudFlags = await prisma.fraudFlag.findMany({
      where: {
        commission_id: { in: commissionIds },
        shopify_shop_id: admin.shopify_shop_id,
        resolved: false,
      },
    });

    if (fraudFlags.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot approve commissions with unresolved fraud flags',
          fraud_commission_ids: fraudFlags.map(f => f.commission_id),
        },
        { status: 400 }
      );
    }

    // Update commissions to approved status
    const updated = await prisma.commission.updateMany({
      where: {
        id: { in: commissionIds },
        shopify_shop_id: admin.shopify_shop_id,
        status: 'eligible',
      },
      data: {
        status: 'approved',
      },
    });

    // Fire postbacks for approval event
    for (const commissionId of commissionIds) {
      try {
        await firePostbacks(commissionId, 'approval', admin.shopify_shop_id);
      } catch (error) {
        console.error(`Error firing postback for commission ${commissionId}:`, error);
        // Continue even if postback fails
      }
    }

    return NextResponse.json({
      success: true,
      approved_count: updated.count,
    });
  } catch (error: any) {
    console.error('Error approving commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve commissions' },
      { status: 500 }
    );
  }
}