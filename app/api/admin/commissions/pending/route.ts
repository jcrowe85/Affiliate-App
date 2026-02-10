import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch commissions with status 'pending' or 'eligible' for admin review
    const commissions = await prisma.commission.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['pending', 'eligible'] },
      },
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
        fraud_flags: {
          where: {
            resolved: false,
          },
          select: {
            id: true,
            flag_type: true,
            score: true,
            reason: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({
      commissions: commissions.map(c => ({
        id: c.id,
        status: c.status,
        affiliate_name: c.affiliate.name,
        affiliate_email: c.affiliate.email,
        order_number: c.order_attribution?.shopify_order_number || c.shopify_order_id,
        amount: c.amount.toString(),
        currency: c.currency,
        eligible_date: c.eligible_date.toISOString(),
        created_at: c.created_at.toISOString(),
        has_fraud_flags: c.fraud_flags.length > 0,
        fraud_flags: c.fraud_flags.map(f => ({
          type: f.flag_type,
          score: f.score,
          reason: f.reason,
        })),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching pending commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending commissions' },
      { status: 500 }
    );
  }
}
