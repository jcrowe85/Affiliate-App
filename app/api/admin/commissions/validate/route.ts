import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Validate pending commission(s) - move from 'pending' to 'eligible'
 * This allows admins to manually approve conversions that are in pending status
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

    // Check for unresolved fraud flags before validating
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
          error: 'Cannot validate commissions with unresolved fraud flags',
          fraud_commission_ids: fraudFlags.map(f => f.commission_id),
        },
        { status: 400 }
      );
    }

    // Update commissions from pending to eligible
    const updated = await prisma.commission.updateMany({
      where: {
        id: { in: commissionIds },
        shopify_shop_id: admin.shopify_shop_id,
        status: 'pending', // Only update pending commissions
      },
      data: {
        status: 'eligible',
      },
    });

    return NextResponse.json({
      success: true,
      validated_count: updated.count,
    });
  } catch (error: any) {
    console.error('Error validating commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to validate commissions' },
      { status: 500 }
    );
  }
}
