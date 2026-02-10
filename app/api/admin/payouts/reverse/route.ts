import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Reverse paid commissions back to eligible/approved status
 * Useful for correcting mistakes or handling payment failures
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commission_ids, reason } = await request.json();

    if (!commission_ids || !Array.isArray(commission_ids) || commission_ids.length === 0) {
      return NextResponse.json(
        { error: 'commission_ids array is required' },
        { status: 400 }
      );
    }

    // Verify commissions belong to this shop and are currently paid
    const commissions = await prisma.commission.findMany({
      where: {
        id: { in: commission_ids },
        shopify_shop_id: admin.shopify_shop_id,
        status: 'paid',
      },
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (commissions.length !== commission_ids.length) {
      return NextResponse.json(
        { 
          error: 'Some commissions not found or not in paid status',
          found: commissions.length,
          requested: commission_ids.length,
        },
        { status: 400 }
      );
    }

    // Reverse commissions back to eligible status
    // We'll use 'eligible' as the default, but you could also check what they were before
    await prisma.commission.updateMany({
      where: {
        id: { in: commission_ids },
      },
      data: {
        status: 'eligible', // Change back to eligible so they appear in payouts again
      },
    });

    // Delete any PayoutRunCommission records associated with these commissions
    await prisma.payoutRunCommission.deleteMany({
      where: {
        commission_id: { in: commission_ids },
      },
    });

    // Calculate total amount reversed
    const totalAmount = commissions.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
    const currency = commissions[0]?.currency || 'USD';

    return NextResponse.json({
      success: true,
      message: 'Commissions reversed successfully',
      reversed_count: commissions.length,
      total_amount: totalAmount.toFixed(2),
      currency,
      reason: reason || 'Reversed by admin',
      commissions: commissions.map(c => ({
        id: c.id,
        affiliate_name: c.affiliate.name,
        affiliate_email: c.affiliate.email,
        amount: c.amount.toString(),
        order_id: c.shopify_order_id,
      })),
    });
  } catch (error: any) {
    console.error('Error reversing commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reverse commissions' },
      { status: 500 }
    );
  }
}
