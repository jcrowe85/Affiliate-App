import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';
import { firePostbacks } from '@/lib/postback';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Process payout for an affiliate - mark eligible commissions as paid
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { affiliate_id, commission_ids, payout_reference } = await request.json();

    if (!affiliate_id || !commission_ids || !Array.isArray(commission_ids) || commission_ids.length === 0) {
      return NextResponse.json(
        { error: 'affiliate_id and commission_ids array are required' },
        { status: 400 }
      );
    }

    // Verify commissions belong to this affiliate and shop, and are eligible
    const commissions = await prisma.commission.findMany({
      where: {
        id: { in: commission_ids },
        affiliate_id: affiliate_id,
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['eligible', 'approved'] },
        eligible_date: {
          lte: new Date(), // Only pay commissions that are past their eligible date
        },
      },
      include: {
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
      },
    });

    if (commissions.length !== commission_ids.length) {
      return NextResponse.json(
        { error: 'Some commissions not found, not eligible, or not ready for payout' },
        { status: 400 }
      );
    }

    // Check for unresolved fraud flags
    const fraudFlags = await prisma.fraudFlag.findMany({
      where: {
        commission_id: { in: commission_ids },
        shopify_shop_id: admin.shopify_shop_id,
        resolved: false,
      },
    });

    if (fraudFlags.length > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot pay commissions with unresolved fraud flags',
          fraud_commission_ids: fraudFlags.map(f => f.commission_id),
        },
        { status: 400 }
      );
    }

    // Mark commissions as paid
    await prisma.commission.updateMany({
      where: {
        id: { in: commission_ids },
      },
      data: {
        status: 'paid',
      },
    });

    // Create a payout run record for tracking
    const payoutRun = await prisma.payoutRun.create({
      data: {
        period_start: commissions.reduce((min, c) => (c.created_at < min ? c.created_at : min), new Date()),
        period_end: commissions.reduce((max, c) => (c.created_at > max ? c.created_at : max), new Date()),
        status: 'paid',
        payout_reference: payout_reference || null,
        shopify_shop_id: admin.shopify_shop_id,
        commissions: {
          create: commissions.map(c => ({
            commission_id: c.id,
          })),
        },
      },
    });

    // Fire postbacks for payment event
    for (const commissionId of commission_ids) {
      try {
        await firePostbacks(commissionId, 'payment', admin.shopify_shop_id);
      } catch (error) {
        console.error(`Error firing postback for commission ${commissionId}:`, error);
        // Continue even if postback fails
      }
    }

    // Calculate total amount paid
    const totalAmount = commissions.reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
    const currency = commissions[0]?.currency || 'USD';

    return NextResponse.json({
      success: true,
      message: 'Payout processed successfully',
      paid_count: commissions.length,
      total_amount: totalAmount.toFixed(2),
      currency,
      payout_run_id: payoutRun.id,
      commissions: commissions.map(c => ({
        id: c.id,
        order_number: c.order_attribution?.shopify_order_number || c.shopify_order_id,
        amount: c.amount.toString(),
        eligible_date: c.eligible_date,
      })),
    });
  } catch (error: any) {
    console.error('Error processing payout:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process payout' },
      { status: 500 }
    );
  }
}
