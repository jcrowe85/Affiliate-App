import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { firePostbacks } from '@/lib/postback';

/**
 * Approve payout run and mark commissions as paid
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payout_reference } = await request.json();

    const payoutRun = await prisma.payoutRun.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
        status: 'draft',
      },
      include: {
        commissions: {
          include: {
            commission: true,
          },
        },
      },
    });

    if (!payoutRun) {
      return NextResponse.json(
        { error: 'Payout run not found or already processed' },
        { status: 404 }
      );
    }

    // Update payout run status
    await prisma.payoutRun.update({
      where: { id: params.id },
      data: {
        status: 'approved',
        payout_reference: payout_reference || null,
      },
    });

    // Mark commissions as paid
    const commissionIds = payoutRun.commissions.map(pc => pc.commission_id);
    await prisma.commission.updateMany({
      where: {
        id: { in: commissionIds },
      },
      data: {
        status: 'paid',
      },
    });

    // Fire postbacks for payment event
    for (const commissionId of commissionIds) {
      try {
        await firePostbacks(commissionId, 'payment', admin.shopify_shop_id);
      } catch (error) {
        console.error(`Error firing postback for commission ${commissionId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payout run approved and commissions marked as paid',
      paid_count: commissionIds.length,
    });
  } catch (error: any) {
    console.error('Error approving payout run:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve payout run' },
      { status: 500 }
    );
  }
}