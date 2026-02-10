import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get pending commission approvals
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Get both pending (needs validation) and eligible (needs approval) commissions
    const commissions = await prisma.commission.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['pending', 'eligible'] }, // Both pending validation and eligible for approval
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
        },
      },
      orderBy: {
        eligible_date: 'asc',
      },
      skip,
      take: limit,
    });

    const total = await prisma.commission.count({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['pending', 'eligible'] },
      },
    });

    return NextResponse.json({
      commissions: commissions.map(c => ({
        id: c.id,
        status: c.status, // Include status to distinguish pending vs eligible
        affiliate_name: c.affiliate.name,
        affiliate_email: c.affiliate.email,
        order_number: c.order_attribution.shopify_order_number,
        amount: c.amount.toString(),
        currency: c.currency,
        eligible_date: c.eligible_date,
        created_at: c.created_at,
        has_fraud_flags: c.fraud_flags.length > 0,
        fraud_flags: c.fraud_flags.map(f => ({
          type: f.flag_type,
          score: f.score,
          reason: f.reason,
        })),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error('Error fetching pending commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pending commissions' },
      { status: 500 }
    );
  }
}